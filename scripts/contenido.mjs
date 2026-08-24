// Generador de contenido de la tienda: textos SEO por LLM e imágenes por
// MiniMax. Node 20+, sin dependencias. Escribe DIRECTO en la API del tenant.
//
// Uso:
//   node scripts/contenido.mjs --textos          # descripciones + meta SEO
//   node scripts/contenido.mjs --imagenes        # imágenes de productos sin foto
//   node scripts/contenido.mjs --todo
//
// Credenciales por variables de entorno (nunca en el repo):
//   MSL_NICKNAME, MSL_PASSWORD   sesión del dueño del tenant
//   LLM_API_KEY  + LLM_BASE_URL + LLM_MODEL   (por defecto: Groq)
//   MINIMAX_API_KEY  para generación de imágenes

import { readFile } from "node:fs/promises";

const EMP = JSON.parse(await readFile(new URL("../empresa.json", import.meta.url), "utf8"));
const args = new Set(process.argv.slice(2));
const HACER_TEXTOS = args.has("--textos") || args.has("--todo");
const HACER_IMAGENES = args.has("--imagenes") || args.has("--todo");
if (!HACER_TEXTOS && !HACER_IMAGENES) {
  console.error("Nada que hacer. Usa --textos, --imagenes o --todo.");
  process.exit(1);
}

// LLM compatible OpenAI: Groq por defecto, cualquier otro por env.
const LLM = {
  base: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
  key: process.env.LLM_API_KEY || process.env.GROQ_API_KEY,
  model: process.env.LLM_MODEL || "openai/gpt-oss-120b",
};
const MINIMAX_KEY = process.env.MINIMAX_API_KEY;

// ------------------------------------------------------------------ api

let token = null;

async function api(metodo, ruta, body) {
  const h = { "content-type": "application/json", "x-app": EMP.app };
  if (token) h.authorization = `Bearer ${token}`;
  const r = await fetch(`${EMP.api}${ruta}`, {
    method: metodo, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${d.error || r.status}`);
  return d;
}

async function entrar() {
  const nickname = process.env.MSL_NICKNAME;
  const password = process.env.MSL_PASSWORD;
  if (!nickname || !password) throw new Error("faltan MSL_NICKNAME y MSL_PASSWORD");
  const r = await api("POST", "/api/usuarios/login", { nickname, password });
  token = r.token;
  return r;
}

// ------------------------------------------------------------------ llm

// Pide JSON al modelo y lo parsea aunque venga envuelto en ```json.
async function pedirJson(sistema, usuario) {
  if (!LLM.key) throw new Error("falta LLM_API_KEY (o GROQ_API_KEY)");
  const r = await fetch(`${LLM.base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${LLM.key}` },
    body: JSON.stringify({
      model: LLM.model,
      temperature: 0.7,
      messages: [{ role: "system", content: sistema }, { role: "user", content: usuario }],
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`LLM ${r.status}: ${d.error?.message || ""}`);
  const txt = String(d.choices?.[0]?.message?.content ?? "");
  const limpio = txt.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return JSON.parse(limpio);
}

const SISTEMA = `Eres redactor de e-commerce en español de Colombia. Escribes fichas
de producto claras, concretas y optimizadas para buscadores: sin promesas falsas,
sin relleno, con palabras que la gente realmente busca. Respondes SOLO JSON válido.`;

// Textos SEO de un producto: descripción larga y meta corta.
async function textosDeProducto(p, marca) {
  return await pedirJson(SISTEMA, `Marca: ${marca}
Producto: ${p.nombre}
Categoría: ${p.categoria || "sin categoría"}
Descripción actual: ${p.descripcion || "(vacía)"}

Devuelve JSON: {"descripcion": "2-4 frases, máximo 400 caracteres",
"meta_descripcion": "máximo 155 caracteres", "palabras_clave": ["3 a 6 términos"]}`);
}

// Identidad de la tienda: eslogan y meta del home.
async function textosDeMarca(cfg, productos) {
  return await pedirJson(SISTEMA, `Marca: ${cfg.nombre}
Productos del catálogo: ${productos.map((p) => p.nombre).join(", ") || "(catálogo vacío)"}

Devuelve JSON: {"eslogan": "máximo 60 caracteres",
"meta_descripcion": "máximo 155 caracteres, para el home",
"palabras_clave": ["4 a 8 términos"]}`);
}

// -------------------------------------------------------------- imágenes

// MiniMax image-01: prompt → imagen. Devuelve data:URL lista para subir.
async function imagenDe(prompt) {
  if (!MINIMAX_KEY) throw new Error("falta MINIMAX_API_KEY");
  const r = await fetch("https://api.minimax.io/v1/image_generation", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${MINIMAX_KEY}` },
    body: JSON.stringify({
      model: "image-01", prompt, n: 1,
      aspect_ratio: "1:1", response_format: "base64",
    }),
  });
  const d = await r.json();
  // MiniMax responde 200 con el error dentro: base_resp manda, no el status.
  const codigo = d.base_resp?.status_code ?? 0;
  if (!r.ok || codigo) throw new Error(`MiniMax: ${d.base_resp?.status_msg || r.status}`);
  const b64 = d.data?.image_base64?.[0] ?? d.data?.[0]?.b64_json;
  if (!b64) throw new Error("MiniMax no devolvió imagen");
  return `data:image/jpeg;base64,${b64}`;
}

// ----------------------------------------------------------------- main

const sesion = await entrar();
console.log(`Sesión de ${sesion.nickname} en [${EMP.app}].`);

const cfg = await api("GET", "/api/config");
const productos = (await api("QUERY", "/api/productos", { limit: 500, eq: { activo: 1 } })).results || [];
console.log(`${productos.length} productos en catálogo.`);

if (HACER_TEXTOS) {
  const marca = await textosDeMarca(cfg, productos);
  await api("PUT", "/api/config", {
    meta: { ...(cfg.meta || {}), ...marca },
  });
  console.log(`Marca: "${marca.eslogan}"`);

  for (const p of productos) {
    const t = await textosDeProducto(p, cfg.nombre);
    await api("PUT", `/api/productos/${p.id}`, {
      descripcion: t.descripcion,
      meta: { ...(p.meta || {}), meta_descripcion: t.meta_descripcion, palabras_clave: t.palabras_clave },
    });
    console.log(`  texto ✓ ${p.nombre}`);
  }
}

if (HACER_IMAGENES) {
  const sinFoto = productos.filter((p) => !(p.imagenes || []).length);
  console.log(`${sinFoto.length} productos sin imagen.`);
  for (const p of sinFoto) {
    const prompt = `Fotografía de producto de "${p.nombre}"${p.categoria ? `, categoría ${p.categoria}` : ""}, `
      + `fondo limpio de estudio, luz suave, encuadre cuadrado, calidad de catálogo comercial.`;
    const data = await imagenDe(prompt);
    const sub = await api("POST", "/api/archivos", {
      nombre: `${p.id}-${p.nombre}.jpg`, tipo: "imagen", data,
      entidad: "producto", entidad_id: p.id,
    });
    const url = `${EMP.api}${sub.url}`;
    await api("PUT", `/api/productos/${p.id}`, { imagenes: [url] });
    console.log(`  imagen ✓ ${p.nombre}`);
  }
}

console.log("Listo. Corre `node scripts/build.mjs` para hornear el sitio.");
