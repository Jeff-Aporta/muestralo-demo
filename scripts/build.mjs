// Build estático SEO del sitio de la empresa. Node 20+, sin dependencias.
// Lee empresa.json, baja config y catálogo de la API y hornea dist/ (MPA).
// Cada página sale con meta, Open Graph, JSON-LD y contenido visible sin JS.
//
// Forma del sitio: índice impreso. Los departamentos y sus renglones
// (nombre · guía de puntos · precio) son HTML real; el JS solo añade sesión,
// carrito y pedido encima.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { htmlVitrina } from "./vitrina.mjs";
import { paraSelector, leerPaletasLocal, hornearPaletas, textoBoot } from "../../../app/molde/scripts/paletas.mjs";
import { htmlTopbar, htmlPie, htmlDialogoSesion, htmlPaginaAdmin } from "../../../app/molde/scripts/marco.mjs";

const EMP = JSON.parse(await readFile(new URL("../empresa.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(RAIZ, "dist");
const DOMINIO = String(EMP.dominio).replace(/\/+$/, "");
const IDIOMA = EMP.idioma || "es";
const KIT = "https://cdn.jsdelivr.net/gh/Jeff-Aporta/muestralo-app@main/cdn";
const KIT_IS = "https://cdn.jsdelivr.net/gh/Jeff-Aporta/is-webcomponents@main/dist/cdn";

// ------------------------------------------------------------- API

// QUERY va con body; fetch de Node acepta métodos arbitrarios.
async function api(metodo, ruta, body) {
  const r = await fetch(`${EMP.api}${ruta}`, {
    method: metodo,
    headers: { "content-type": "application/json", "x-app": EMP.app },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${metodo} ${ruta} → HTTP ${r.status}`);
  return await r.json();
}

let cfg = null;
let productos = [];
try {
  cfg = await api("GET", "/api/config");
  const r = await api("QUERY", "/api/productos", { limit: 500, sort: "id" });
  productos = r.results || [];
} catch (e) {
  // Sitio mínimo sin datos: el deploy no se bloquea, pero se avisa fuerte.
  console.warn(`AVISO: sin datos de la API (${e.message}). Se genera sitio vacío.`);
  cfg = { app: EMP.app, nombre: EMP.nombre || EMP.app, css_vars: {}, meta: {}, paletas: [] };
}

const NOMBRE = cfg.nombre || EMP.nombre || EMP.app;
const META = cfg.meta || {};
const PALETAS_LOCAL = await leerPaletasLocal(RAIZ);
const PALETAS_SRC = (cfg.paletas || []).length ? cfg.paletas : PALETAS_LOCAL;
const PALETAS = paraSelector(PALETAS_SRC);
const MONEDA = "COP";
const ICONO_MARCA = META.icono || "mdi:storefront-outline";
const FUENTES = META.fuentes || null;

// Departamentos declarados por el tenant; si no, se deducen del catálogo.
const DEPARTAMENTOS = (META.departamentos || []).length
  ? META.departamentos
  : [...new Set(productos.map((p) => p.categoria).filter(Boolean))]
      .map((c) => ({ id: slug(c), nombre: c, icono: "mdi:tag-outline", lema: "" }));

// ------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

function slug(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

const dinero = (centavos, moneda = MONEDA) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda, maximumFractionDigits: 0 })
    .format((centavos || 0) / 100);

const urlProducto = (p) => `/producto/${p.id}-${slug(p.nombre)}/`;

const delDepto = (dep) => productos.filter((p) => slug(p.categoria) === slug(dep.nombre || dep.id));

// Resumen de opciones de un producto: "5 tallas · 4 colores · 3 adicionales".
function resumenOpciones(p) {
  const v = p.variaciones || {};
  const partes = [];
  for (const [clave, valor] of Object.entries(v)) {
    if (clave === "adicionales") {
      const n = (valor || []).length;
      if (n) partes.push(`${n} ${n === 1 ? "adicional" : "adicionales"}`);
    } else if (Array.isArray(valor) && valor.length > 1) {
      partes.push(`${valor.length} ${clave}`);
    }
  }
  return partes;
}

// ------------------------------------------------------------- cabeza

// Arranque de tema: NO se reescribe aquí. Se toma tal cual de `msl-boot.js`
// del kit y se inserta en línea, para que corra antes del primer pintado sin
// costar una petición extra. Una sola definición para todo el ecosistema.
let BOOT = null;
try {
  BOOT = await textoBoot(RAIZ, KIT);
} catch (e) {
  console.error(`ERROR: no se pudo traer msl-boot.js del kit (${e.message}).`);
  console.error("El sitio saldría con destello de tema. Reintenta el build.");
  process.exit(1);
}

// Config que lee el boot: hoja local combinada, sin pedir la API al pintar.
function bootTema(prefijo) {
  return `window.MSL_BOOT=${JSON.stringify({ api: EMP.api, app: EMP.app, paletaCss: true, paletaHref: `${prefijo}css/paletas.css` })};
window.MSL_BOOT=window.MSL_BOOT;
${BOOT}`;
}

function head({ titulo, descripcion, path, prefijo, imagen, jsonld, noindex }) {
  const canonical = `${DOMINIO}${path}`;
  const fuentesLink = FUENTES?.url
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${esc(FUENTES.url)}">`
    : "";
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${canonical}">
${noindex ? `<meta name="robots" content="noindex,nofollow">` : `<meta name="robots" content="index,follow">`}
<meta property="og:type" content="website">
<meta property="og:locale" content="${IDIOMA}_CO">
<meta property="og:site_name" content="${esc(NOMBRE)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${canonical}">
${imagen ? `<meta property="og:image" content="${esc(imagen)}">\n<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<!-- El tema y el catálogo salen de la API: se abre la conexión desde el head. -->
<link rel="preconnect" href="${esc(EMP.api)}" crossorigin>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
${fuentesLink}
<link rel="stylesheet" href="${KIT_IS}/is-base.min.css">
<link rel="stylesheet" href="${prefijo}cdn/msl-kit.css" data-msl-kit>
<link rel="stylesheet" href="${prefijo}css/paletas.css">
<link rel="stylesheet" href="${prefijo}css/tema.css">
<link rel="stylesheet" href="${prefijo}css/app.css">
<script>${bootTema(prefijo)}</script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
</head>`;
}

// Contrato de la dirección de diseño: viaja en el HTML servido, auditable.
const CONTRATO = `<!--
THESIS: un catálogo multi-sector se lee como un índice impreso con guía de puntos hasta el precio, no como una rejilla de tarjetas iguales; la identidad del comercio repinta el índice entero.
OWN-WORLD: tokens --is-* de is-webcomponents; el color de marca del tenant llena bandas y estados; display grande con tracking cerrado; renglones separados por hairline y guía punteada.
STORY: el visitante entiende de un vistazo qué departamentos hay, recorre renglones con precio visible, abre la ficha, personaliza y pide por WhatsApp.
FIRST VIEWPORT: nombre del comercio a escala de portada con su lema, la fila de departamentos como índice, y los controles de paleta y tema en la cabecera.
FORM: índice impreso con columna de precios (candidato 4 de la lista ordenada; seed e576508a).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

// window.MSL queda horneado: el runtime no necesita pedir /api/config.
function shell({ titulo, descripcion, path, prefijo, vista, contenido, jsonld, imagen, noindex, actual }) {
  const paletaDefecto = PALETAS[0]?.value ?? "";
  const chrome = {
    esc, nombre: NOMBRE, icono: ICONO_MARCA, prefijo: prefijo || "./",
    departamentos: DEPARTAMENTOS, actual, meta: META, vista, paletas: PALETAS,
  };
  return `<!doctype html>
<html lang="${IDIOMA}"${paletaDefecto ? ` data-palette="${esc(paletaDefecto)}"` : ""}>
${head({ titulo, descripcion, path, prefijo, imagen, jsonld, noindex })}
<body data-vista="${vista}">
${CONTRATO}
${htmlTopbar(chrome)}
<main id="vista">
${contenido}
</main>
${htmlPie(chrome)}
${htmlDialogoSesion()}
<script>
  window.MSL = ${JSON.stringify({
    app: EMP.app, api: EMP.api, dominio: DOMINIO,
    whatsapp: cfg.whatsapp_soporte || null, moneda: MONEDA,
    paletas: PALETAS,
  })};
</script>
<script type="module" src="${prefijo}js/vistas.js"></script>
</body>
</html>`;
}

// ------------------------------------------------------------- piezas

// Renglón de índice: la unidad de todo el sitio.
function renglon(p, prefijo, i) {
  const opciones = resumenOpciones(p);
  const agotado = (p.stock || 0) <= 0;
  return `<li style="--i:${i}">
  <a class="renglon" href="${prefijo}${urlProducto(p).slice(1)}">
    <span class="renglon-nombre">${esc(p.nombre)}</span>
    <span class="renglon-precio">${dinero(p.precio, p.moneda)}</span>
    ${p.descripcion ? `<p class="renglon-nota">${esc(String(p.descripcion).slice(0, 150))}</p>` : ""}
    ${opciones.length || agotado ? `<span class="renglon-opciones">
      ${opciones.map((o) => `<span class="opcion-chip">${esc(o)}</span>`).join("")}
      ${agotado ? `<span class="opcion-chip" data-agotado>agotado</span>` : ""}
    </span>` : ""}
  </a>
</li>`;
}

function seccionDepto(dep, prefijo, items, { total = null, verTodo = null } = {}) {
  if (!items.length) return "";
  const n = total ?? items.length;
  return `<section class="seccion" id="${esc(dep.id)}">
  <div class="indice-titulo">
    <h2>${esc(dep.nombre)}</h2>
    <span>${n} ${n === 1 ? "referencia" : "referencias"}</span>
  </div>
  <ul class="indice">${items.map((p, i) => renglon(p, prefijo, i)).join("")}</ul>
  ${verTodo ? `<p class="ver-todo"><a href="${verTodo}">Ver ${n - items.length} más de ${esc(dep.nombre)} <is-icon icon="mdi:arrow-right"></is-icon></a></p>` : ""}
</section>`;
}

// ------------------------------------------------------------- páginas

const archivos = [];
const escribir = (ruta, contenido) => archivos.push([join(DIST, ruta), contenido]);

// Tema horneado: solo variables sueltas del tenant. La paleta llega por la API.
function temaCss() {
  const vars = Object.entries(cfg.css_vars || {}).map(([k, v]) => `  ${k}: ${v};`).join("\n");
  const fuentes = FUENTES?.display ? `  --msl-font-display: ${FUENTES.display};\n` : "";
  const cuerpo = FUENTES?.cuerpo ? `  --is-sans: ${FUENTES.cuerpo};\n` : "";
  return `:root {\n${fuentes}${cuerpo}${vars}\n}\n`;
}

function pInicio() {
  const jsonld = {
    "@context": "https://schema.org", "@type": "Store",
    name: NOMBRE, url: `${DOMINIO}/`,
    ...(META.descripcion ? { description: META.descripcion } : {}),
    ...(cfg.whatsapp_soporte ? { telephone: cfg.whatsapp_soporte } : {}),
    ...((META.sedes || []).length
      ? { address: (META.sedes || []).map((s) => ({ "@type": "PostalAddress", streetAddress: s.direccion, name: s.nombre })) }
      : {}),
    department: DEPARTAMENTOS.map((d) => ({ "@type": "Store", name: d.nombre, url: `${DOMINIO}/catalogo/#${d.id}` })),
  };
  const hero = productos.find((p) => (p.imagenes || [])[0]) || productos[0];
  escribir("index.html", shell({
    titulo: `${NOMBRE} — ${META.eslogan || "Tienda"}`,
    descripcion: META.descripcion || META.eslogan || `Tienda de ${NOMBRE}`,
    path: "/", prefijo: "", vista: "inicio", jsonld,
    imagen: hero ? (hero.imagenes || [])[0] : undefined,
    contenido: htmlVitrina({
      nombre: NOMBRE, meta: META, departamentos: DEPARTAMENTOS,
      productos, cfg, esc, dinero, urlProducto, delDepto,
    }),
  }));
}

function pCatalogo() {
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList",
    numberOfItems: productos.length,
    itemListElement: productos.map((p, i) => ({
      "@type": "ListItem", position: i + 1,
      name: p.nombre, url: `${DOMINIO}${urlProducto(p)}`,
    })),
  };
  const secciones = DEPARTAMENTOS.map((d) => seccionDepto(d, "../", delDepto(d))).join("");
  const sinDepto = productos.filter((p) => !DEPARTAMENTOS.some((d) => slug(d.nombre || d.id) === slug(p.categoria)));

  escribir("catalogo/index.html", shell({
    titulo: `Catálogo — ${NOMBRE}`,
    descripcion: `Las ${productos.length} referencias de ${NOMBRE}, por departamento, con precio y opciones.`,
    path: "/catalogo/", prefijo: "../", vista: "catalogo", jsonld,
    contenido: htmlIndice({ h1: "Catálogo", prefijo: "../" }),
  }));
}

function htmlIndice({ h1, prefijo, items = productos, depts = DEPARTAMENTOS }) {
  const secciones = depts.map((d) => seccionDepto(d, prefijo, delDepto(d).filter((p) => items.includes(p)))).join("");
  const sueltos = items.filter((p) => !depts.some((d) => slug(d.nombre || d.id) === slug(p.categoria)));
  return `<div class="indice-titulo"><h1>${esc(h1)}</h1><span>${items.length} referencias</span></div>
<form class="barra-busqueda" id="buscador" role="search">
  <is-input type="search" name="q" placeholder="Buscar…" aria-label="Buscar"></is-input>
  <div class="filtros" id="filtros-depto">
    <button type="button" class="filtro" data-depto="" aria-pressed="true">Todo</button>
    ${depts.map((d) => `<button type="button" class="filtro" data-depto="${esc(d.id)}" aria-pressed="false">${esc(d.nombre)}</button>`).join("")}
  </div>
</form>
<p class="vacio" id="sin-resultados" hidden><is-icon icon="mdi:magnify-close"></is-icon><br>Nada coincide con esa búsqueda.</p>
${secciones}
${sueltos.length ? seccionDepto({ id: "otros", nombre: "Otros", lema: "" }, prefijo, sueltos) : ""}`;
}

function pMenu() {
  escribir("menu/index.html", shell({
    titulo: `Menú — ${NOMBRE}`,
    descripcion: `Menú de ${NOMBRE}: mismas referencias del catálogo, por departamento.`,
    path: "/menu/", prefijo: "../", vista: "menu",
    contenido: htmlIndice({ h1: "Menú", prefijo: "../" }),
  }));
}

function pPromociones() {
  const items = productos.filter((p) => /combo|promo|oferta|pack|maxi|ahorro/i.test(`${p.nombre} ${p.descripcion || ""} ${p.categoria || ""}`));
  const lista = items.length ? items : productos.slice(0, 8);
  escribir("promociones/index.html", shell({
    titulo: `Promociones — ${NOMBRE}`,
    descripcion: `Combos y destacados de ${NOMBRE}.`,
    path: "/promociones/", prefijo: "../", vista: "promociones",
    contenido: htmlIndice({ h1: "Promociones", prefijo: "../", items: lista, depts: DEPARTAMENTOS.filter((d) => lista.some((p) => slug(p.categoria) === slug(d.nombre || d.id))) }),
  }));
}

function pProducto(p) {
  const img = (p.imagenes || [])[0];
  const path = urlProducto(p);
  const vars = p.variaciones || {};
  const agotado = (p.stock || 0) <= 0;
  const dep = DEPARTAMENTOS.find((d) => slug(d.nombre || d.id) === slug(p.categoria));

  const jsonld = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.nombre, description: p.descripcion || p.nombre,
    ...(img ? { image: img } : {}),
    ...(p.categoria ? { category: p.categoria } : {}),
    brand: { "@type": "Brand", name: NOMBRE },
    offers: {
      "@type": "Offer", price: ((p.precio || 0) / 100).toFixed(2),
      priceCurrency: p.moneda || MONEDA,
      availability: agotado ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      url: `${DOMINIO}${path}`,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${DOMINIO}/` },
      { "@type": "ListItem", position: 2, name: "Catálogo", item: `${DOMINIO}/catalogo/` },
      ...(dep ? [{ "@type": "ListItem", position: 3, name: dep.nombre, item: `${DOMINIO}/catalogo/#${dep.id}` }] : []),
      { "@type": "ListItem", position: dep ? 4 : 3, name: p.nombre },
    ],
  };

  // Grupos de opciones como fichas: se elige tocando, sin desplegables.
  const grupos = Object.entries(vars)
    .filter(([k, v]) => k !== "adicionales" && Array.isArray(v) && v.length)
    .map(([clave, opciones]) => `<fieldset data-grupo="${esc(clave)}">
      <legend>${esc(clave)}</legend>
      <div class="fichas">
        ${opciones.map((o, i) => `<label class="ficha">
          <input type="radio" name="${esc(clave)}" value="${esc(o)}"${i === 0 ? " checked" : ""}>
          ${esc(o)}
        </label>`).join("")}
      </div>
    </fieldset>`).join("");

  const adicionales = (vars.adicionales || []).length
    ? `<fieldset data-grupo="adicionales">
        <legend>Adicionales</legend>
        <div class="fichas">
          ${vars.adicionales.map((a) => `<label class="ficha">
            <input type="checkbox" name="adicional" value="${esc(a.nombre)}" data-precio="${a.precio || 0}">
            ${esc(a.nombre)} <small>+${dinero(a.precio, p.moneda)}</small>
          </label>`).join("")}
        </div>
      </fieldset>`
    : "";

  escribir(`${path.slice(1)}index.html`, shell({
    titulo: `${p.nombre} — ${NOMBRE}`,
    descripcion: (p.meta?.meta_descripcion || p.descripcion || `${p.nombre} en ${NOMBRE}`).slice(0, 160),
    path, prefijo: "../../", vista: "producto", imagen: img,
    jsonld: [jsonld, breadcrumb], actual: dep?.id,
    contenido: `<article class="producto" data-producto='${esc(JSON.stringify({ id: p.id, precio: p.precio, moneda: p.moneda }))}'>
  <div class="producto-media">
    ${img
      ? `<img src="${esc(img)}" alt="${esc(p.nombre)}" width="800" height="1000">`
      : `<div class="sin-foto"><is-icon icon="${esc(dep?.icono || ICONO_MARCA)}"></is-icon></div>`}
  </div>
  <div>
    <nav class="miga"><a href="../../">Inicio</a> · <a href="../../catalogo/">Catálogo</a>${dep ? ` · <a href="../../catalogo/#${esc(dep.id)}">${esc(dep.nombre)}</a>` : ""}</nav>
    <h1>${esc(p.nombre)}</h1>
    <p>${esc(p.descripcion || "")}</p>
    <p class="precio-grande">${dinero(p.precio, p.moneda)}</p>
    <p class="stock"${agotado ? " data-agotado" : ""}>${agotado ? "Agotado por ahora" : `${p.stock} disponibles`}</p>
    <form class="personalizar" id="personalizar">
      ${grupos}
      ${adicionales}
      <is-input class="campo" name="cantidad" type="number" min="1" value="1" label="Cantidad"></is-input>
      <div class="total-linea"><span>Total</span><strong id="total-linea">${dinero(p.precio, p.moneda)}</strong></div>
      <is-button type="submit"${agotado ? " disabled" : ""}>
        <is-icon icon="mdi:basket-plus-outline"></is-icon> Agregar al carrito
      </is-button>
      <p id="aviso-producto"></p>
    </form>
  </div>
</article>`,
  }));
}

function pSedes() {
  const sedes = META.sedes || [];
  const jsonld = sedes.map((s) => ({
    "@context": "https://schema.org", "@type": "LocalBusiness",
    name: `${NOMBRE} — ${s.nombre}`, ...(s.direccion ? { address: s.direccion } : {}),
  }));
  escribir("sedes/index.html", shell({
    titulo: `Sedes — ${NOMBRE}`,
    descripcion: `Puntos de venta y sedes de ${NOMBRE}.`,
    path: "/sedes/", prefijo: "../", vista: "sedes",
    jsonld: jsonld.length ? jsonld : null,
    contenido: `<div class="indice-titulo"><h1>Sedes</h1><span>${sedes.length}</span></div>
${sedes.length
  ? `<ul class="indice">${sedes.map((s, i) => `<li style="--i:${i}"><div class="renglon">
      <span class="renglon-nombre">${esc(s.nombre)}</span>
      <span class="renglon-precio">${esc(s.horario || "")}</span>
      <p class="renglon-nota">${esc(s.direccion || "")}</p>
    </div></li>`).join("")}</ul>`
  : `<p class="vacio"><is-icon icon="mdi:map-marker-off-outline"></is-icon><br>Este catálogo atiende solo en línea.</p>`}`,
  }));
}

// Páginas dinámicas: noindex, el contenido lo llena el runtime con sesión.
function pDinamicas() {
  escribir("carrito/index.html", shell({
    titulo: `Carrito — ${NOMBRE}`, descripcion: "Tu carrito de compras.",
    path: "/carrito/", prefijo: "../", vista: "carrito", noindex: true,
    contenido: `<div class="indice-titulo"><h1>Carrito</h1></div><msl-carrito-panel></msl-carrito-panel>`,
  }));
  escribir("pedidos/index.html", shell({
    titulo: `Mis pedidos — ${NOMBRE}`, descripcion: "Historial de pedidos.",
    path: "/pedidos/", prefijo: "../", vista: "pedidos", noindex: true,
    contenido: `<div class="indice-titulo"><h1>Mis pedidos</h1></div><div id="lista-pedidos"><is-spinner></is-spinner></div>`,
  }));
  escribir("pedido/index.html", shell({
    titulo: `Pedido — ${NOMBRE}`, descripcion: "Detalle del pedido.",
    path: "/pedido/", prefijo: "../", vista: "pedido", noindex: true,
    contenido: `<div id="pedido-detalle"><is-spinner></is-spinner></div>`,
  }));
}

// Panel de la empresa en su propio dominio: el admin llega por GitHub Pages.
// jsDelivr cachea la resolución de @main hasta 12 h y un arreglo tardaría.
function pAdmin() {
  escribir("admin/index.html", htmlPaginaAdmin({
    esc, idioma: IDIOMA, nombre: NOMBRE, api: EMP.api, app: EMP.app, kitIs: KIT_IS,
    adminLocal: "../../../../admin",
  }));
}

// ------------------------------------------------------------- índices

function pSitemap() {
  const urls = ["/", "/menu/", "/promociones/", "/catalogo/", "/sedes/", ...productos.map((p) => urlProducto(p))];
  escribir("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${DOMINIO}${u}</loc></url>`).join("\n")}
</urlset>
`);
}

function pRobots() {
  escribir("robots.txt", `User-agent: *
Allow: /
Disallow: /carrito/
Disallow: /pedidos/
Disallow: /pedido/
Disallow: /admin/

Sitemap: ${DOMINIO}/sitemap.xml
`);
}

// ------------------------------------------------------------- main

pInicio();
pCatalogo();
pMenu();
pPromociones();
for (const p of productos) pProducto(p);
pSedes();
pDinamicas();
pAdmin();
pSitemap();
pRobots();

await rm(DIST, { recursive: true, force: true });
await mkdir(join(DIST, "css"), { recursive: true });
for (const [ruta, contenido] of archivos) {
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, contenido);
}
await writeFile(join(DIST, "css", "tema.css"), temaCss());
await hornearPaletas(RAIZ, DIST, PALETAS_SRC);
await cp(join(RAIZ, "css", "app.css"), join(DIST, "css", "app.css"));
await cp(join(RAIZ, "js"), join(DIST, "js"), { recursive: true });
for (const kitLocal of [join(RAIZ, "..", "cdn"), join(RAIZ, "..", "..", "app", "cdn")]) {
  try {
    await cp(kitLocal, join(DIST, "cdn"), { recursive: true });
    break;
  } catch { /* siguiente candidato */ }
}

console.log(`Sitio generado en dist/: ${archivos.length + 1} archivos (${productos.length} productos, ${DEPARTAMENTOS.length} departamentos) para "${NOMBRE}" [${EMP.app}].`);
