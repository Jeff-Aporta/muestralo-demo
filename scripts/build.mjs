// Build estático SEO del sitio de la empresa. Node 20+, sin dependencias.
// Lee empresa.json, baja config y catálogo de la API y hornea dist/ (MPA).
// Cada página sale con meta, Open Graph, JSON-LD y contenido visible sin JS.

import { readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EMP = JSON.parse(await readFile(new URL("../empresa.json", import.meta.url), "utf8"));
const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(RAIZ, "dist");
const DOMINIO = String(EMP.dominio).replace(/\/+$/, "");
const IDIOMA = EMP.idioma || "es";

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
  cfg = { app: EMP.app, nombre: EMP.nombre || EMP.app, css_vars: {}, meta: {} };
}

const NOMBRE = cfg.nombre || EMP.nombre || EMP.app;
const META = cfg.meta || {};
const MONEDA = "COP";

// ------------------------------------------------------------- helpers

const esc = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#39;");

const slug = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";

const dinero = (centavos, moneda = MONEDA) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: moneda, maximumFractionDigits: 0 })
    .format((centavos || 0) / 100);

const urlProducto = (p) => `/producto/${p.id}-${slug(p.nombre)}/`;

// Tema horneado: la marca pinta desde el primer byte, sin esperar JS.
function temaCss() {
  const vars = Object.entries(cfg.css_vars || {})
    .map(([k, v]) => `  ${k}: ${v};`).join("\n");
  return `:root {\n${vars}\n}\n`;
}

// ------------------------------------------------------------- layout

function head({ titulo, descripcion, path, prefijo, imagen, jsonld, noindex }) {
  const canonical = `${DOMINIO}${path}`;
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${canonical}">
${noindex ? `<meta name="robots" content="noindex,nofollow">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(NOMBRE)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${canonical}">
${imagen ? `<meta property="og:image" content="${esc(imagen)}">\n<meta name="twitter:card" content="summary_large_image">` : ""}
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Jeff-Aporta/is-webcomponents@main/dist/cdn/is-base.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Jeff-Aporta/is-webcomponents@main/dist/cdn/palettes.min.css">
<link rel="stylesheet" href="${prefijo}css/tema.css">
<link rel="stylesheet" href="${prefijo}css/app.css">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
</head>`;
}

// window.MSL queda horneado: el runtime no necesita pedir /api/config.
function shell({ titulo, descripcion, path, prefijo, vista, contenido, jsonld, imagen, noindex }) {
  return `<!doctype html>
<html lang="${IDIOMA}">
${head({ titulo, descripcion, path, prefijo, imagen, jsonld, noindex })}
<body data-vista="${vista}">
<header id="topbar">
  <a id="marca" href="${prefijo}">${esc(NOMBRE)}</a>
  <nav>
    <a href="${prefijo}">Inicio</a>
    <a href="${prefijo}catalogo/">Catálogo</a>
    <a href="${prefijo}sedes/">Sedes</a>
  </nav>
  <div>
    <a href="${prefijo}pedidos/" id="enlace-pedidos" hidden>Mis pedidos</a>
    <a href="${prefijo}carrito/"><is-icon icon="mdi:cart"></is-icon><span id="carrito-n"></span></a>
    <is-button id="btn-sesion" variante="texto"><is-icon icon="mdi:account"></is-icon></is-button>
  </div>
</header>
<main id="vista">
${contenido}
</main>
<footer id="pie">
  <p>${esc(NOMBRE)} — Catálogo potenciado por <a href="https://github.com/Jeff-Aporta/muestralo-app" rel="noopener">Muéstralo</a></p>
</footer>
<dialog id="dlg-sesion"><msl-auth-form></msl-auth-form></dialog>
<script>
  window.MSL = ${JSON.stringify({
    app: EMP.app, api: EMP.api, dominio: DOMINIO,
    whatsapp: cfg.whatsapp_soporte || null, moneda: MONEDA,
  })};
</script>
<script type="module" src="${prefijo}js/vistas.js"></script>
</body>
</html>`;
}

// Tarjeta de producto horneada (SEO: enlace real, precio visible sin JS).
function tarjetaProducto(p, prefijo) {
  const img = (p.imagenes || [])[0];
  return `<article class="tarjeta-producto">
  <a href="${prefijo}${urlProducto(p).slice(1)}" class="tarjeta-enlace">
    ${img ? `<img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy">` : ""}
    <h2>${esc(p.nombre)}</h2>
    <p class="tarjeta-cat">${esc(p.categoria || "")}</p>
    <strong class="msl-precio">${dinero(p.precio, p.moneda)}</strong>
  </a>
  <is-button data-agregar="${p.id}"><is-icon icon="mdi:cart-plus"></is-icon> Agregar</is-button>
</article>`;
}

const rutaTarjeta = (p) => urlProducto(p);

// ------------------------------------------------------------- páginas

const archivos = [];
const escribir = (ruta, contenido) => archivos.push([join(DIST, ruta), contenido]);

function pInicio() {
  const destacados = productos.slice(0, 8);
  const jsonld = {
    "@context": "https://schema.org", "@type": "Organization",
    name: NOMBRE, url: `${DOMINIO}/`,
    ...(META.logo ? { logo: META.logo } : {}),
    ...(cfg.whatsapp_soporte ? { contactPoint: { "@type": "ContactPoint", telephone: cfg.whatsapp_soporte, contactType: "sales" } } : {}),
  };
  escribir("index.html", shell({
    titulo: NOMBRE, descripcion: META.eslogan || `Catálogo de ${NOMBRE}`,
    path: "/", prefijo: "", vista: "inicio", jsonld,
    contenido: `<section class="hero">
  <h1>${esc(NOMBRE)}</h1>
  <p>${esc(META.eslogan || "Catálogo en línea")}</p>
  <a href="catalogo/"><is-button>Ver catálogo</is-button></a>
</section>
${destacados.length ? `<section><h2>Destacados</h2><div class="grid">
${destacados.map((p) => tarjetaProducto(p, "./")).join("")}
</div></section>` : ""}`,
  }));
}

function pCatalogo() {
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: productos.map((p, i) => ({
      "@type": "ListItem", position: i + 1,
      name: p.nombre, url: `${DOMINIO}${rutaTarjeta(p)}`,
    })),
  };
  escribir("catalogo/index.html", shell({
    titulo: `Catálogo — ${NOMBRE}`,
    descripcion: `Todos los productos de ${NOMBRE}.`,
    path: "/catalogo/", prefijo: "../", vista: "catalogo", jsonld,
    contenido: `<h1>Catálogo</h1>
<form id="buscador">
  <input name="q" placeholder="Buscar…">
  <is-button type="submit"><is-icon icon="mdi:magnify"></is-icon></is-button>
</form>
<div class="grid" id="grid-productos">
${productos.map((p) => tarjetaProducto(p, "../")).join("")}
</div>`,
  }));
}

function pProducto(p) {
  const img = (p.imagenes || [])[0];
  const path = urlProducto(p);
  const vars = p.variaciones || {};
  const jsonld = {
    "@context": "https://schema.org", "@type": "Product",
    name: p.nombre, description: p.descripcion || p.nombre,
    ...(img ? { image: img } : {}),
    ...(p.categoria ? { category: p.categoria } : {}),
    offers: {
      "@type": "Offer", price: ((p.precio || 0) / 100).toFixed(2),
      priceCurrency: p.moneda || MONEDA,
      availability: (p.stock || 0) > 0
        ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${DOMINIO}${path}`,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: `${DOMINIO}/` },
      { "@type": "ListItem", position: 2, name: "Catálogo", item: `${DOMINIO}/catalogo/` },
      { "@type": "ListItem", position: 3, name: p.nombre },
    ],
  };
  escribir(`${path.slice(1)}index.html`, shell({
    titulo: `${p.nombre} — ${NOMBRE}`,
    descripcion: (p.descripcion || `${p.nombre} en ${NOMBRE}`).slice(0, 160),
    path, prefijo: "../../", vista: "producto", imagen: img,
    jsonld: [jsonld, breadcrumb],
    contenido: `<article class="producto" data-producto='${esc(JSON.stringify({ id: p.id, precio: p.precio, moneda: p.moneda }))}'>
  <nav class="miga"><a href="../../">Inicio</a> / <a href="../../catalogo/">Catálogo</a> / ${esc(p.nombre)}</nav>
  ${(p.imagenes || []).map((u) => `<img src="${esc(u)}" alt="${esc(p.nombre)}">`).join("")}
  <h1>${esc(p.nombre)}</h1>
  <p>${esc(p.descripcion || "")}</p>
  <strong class="msl-precio">${dinero(p.precio, p.moneda)}</strong>
  <p class="stock">${(p.stock || 0) > 0 ? `${p.stock} disponibles` : "Agotado"}</p>
  <form id="personalizar">
    ${Object.entries(vars).filter(([k]) => k !== "adicionales").map(([k, ops]) => `
    <label>${esc(k)}
      <select name="${esc(k)}">${(ops || []).map((o) => `<option>${esc(o)}</option>`).join("")}</select>
    </label>`).join("")}
    ${(vars.adicionales || []).map((a) => `
    <label><input type="checkbox" name="adicional" value="${esc(a.nombre)}"> ${esc(a.nombre)} (+${dinero(a.precio, p.moneda)})</label>`).join("")}
    <label>Cantidad <input name="cantidad" type="number" min="1" value="1"></label>
    <is-button type="submit"><is-icon icon="mdi:cart-plus"></is-icon> Agregar al carrito</is-button>
  </form>
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
    contenido: `<h1>Sedes</h1>
${sedes.length
  ? `<ul>${sedes.map((s) => `<li><strong>${esc(s.nombre)}</strong> — ${esc(s.direccion || "")}</li>`).join("")}</ul>`
  : `<p>Este catálogo no publica sedes.</p>`}`,
  }));
}

// Páginas dinámicas: noindex, el contenido lo llena el runtime con sesión.
function pDinamicas() {
  escribir("carrito/index.html", shell({
    titulo: `Carrito — ${NOMBRE}`, descripcion: "Tu carrito de compras.",
    path: "/carrito/", prefijo: "../", vista: "carrito", noindex: true,
    contenido: `<h1>Carrito</h1><msl-carrito-panel></msl-carrito-panel>`,
  }));
  escribir("pedidos/index.html", shell({
    titulo: `Mis pedidos — ${NOMBRE}`, descripcion: "Historial de pedidos.",
    path: "/pedidos/", prefijo: "../", vista: "pedidos", noindex: true,
    contenido: `<h1>Mis pedidos</h1><div id="lista-pedidos"><is-spinner></is-spinner></div>`,
  }));
  escribir("pedido/index.html", shell({
    titulo: `Pedido — ${NOMBRE}`, descripcion: "Detalle del pedido.",
    path: "/pedido/", prefijo: "../", vista: "pedido", noindex: true,
    contenido: `<div id="pedido-detalle"><is-spinner></is-spinner></div>`,
  }));
}

// Panel de la empresa en su propio dominio: el admin llega por jsDelivr.
// noindex y sin datos horneados: todo lo pide con la sesión del dueño.
function pAdmin() {
  // GitHub Pages, no jsDelivr: jsDelivr cachea la resolución de @main hasta 12 h
  // y un arreglo del panel tardaría en llegar a las empresas.
  const CDN_ADMIN = "https://jeff-aporta.github.io/muestralo-admin";
  escribir("admin/index.html", `<!doctype html>
<html lang="${IDIOMA}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Admin — ${esc(NOMBRE)}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Jeff-Aporta/is-webcomponents@main/dist/cdn/is-base.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/Jeff-Aporta/is-webcomponents@main/dist/cdn/palettes.min.css">
<link rel="stylesheet" href="${CDN_ADMIN}/css/admin.css">
</head>
<body>
<div id="raiz"></div>
<script>
  // El tenant y la API quedan fijados: el dueño solo pone sus credenciales.
  localStorage.setItem("msl.app", ${JSON.stringify(EMP.app)});
  localStorage.setItem("msl.api", ${JSON.stringify(EMP.api)});
</script>
<script type="module" src="${CDN_ADMIN}/js/admin.js"></script>
</body>
</html>
`);
}

// ------------------------------------------------------------- índices

function pSitemap() {
  const urls = ["/", "/catalogo/", "/sedes/", ...productos.map((p) => urlProducto(p))];
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
await cp(join(RAIZ, "css", "app.css"), join(DIST, "css", "app.css"));
await cp(join(RAIZ, "js"), join(DIST, "js"), { recursive: true });

console.log(`Sitio generado en dist/: ${archivos.length + 1} archivos (${productos.length} productos) para "${NOMBRE}" [${EMP.app}].`);
