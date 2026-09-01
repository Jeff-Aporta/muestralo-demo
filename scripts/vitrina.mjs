// Home tipo tienda en producción: hero, colecciones, mosaico de fotos.
// El catálogo completo sigue en /catalogo/. Esto es el abrebocas del comercio.

export function fotoDe(p) {
  return (p?.imagenes || p?.fotos || [])[0] || "";
}

export function htmlVitrina({
  nombre, meta, departamentos, productos, cfg,
  esc, dinero, urlProducto, delDepto,
}) {
  const conFoto = productos.filter((p) => fotoDe(p));
  const hero = conFoto[0] || productos[0];
  const heroFoto = fotoDe(hero);
  const destacados = destacar(departamentos, productos, delDepto, 8);
  const eslogan = meta.eslogan || meta.descripcion || "";
  const wa = cfg.whatsapp_soporte || cfg.whatsapp || "";

  return `
<msl-vitrina-hero>
  <div class="msl-vitrina-hero-copy">
    <p class="msl-vitrina-kicker">Tienda en línea</p>
    <h1>${esc(nombre)}</h1>
    <p class="msl-vitrina-lema">${esc(eslogan)}</p>
    <div class="msl-vitrina-ctas">
      <a href="menu/"><is-button>Entrar a la tienda</is-button></a>
      ${hero ? `<a href="${esc(urlProducto(hero).replace(/^\//, ""))}"><is-button variant="text">Ver ${esc(hero.nombre)}</is-button></a>` : ""}
    </div>
  </div>
  <figure class="msl-vitrina-hero-foto">
    ${heroFoto
      ? `<img src="${esc(heroFoto)}" alt="${esc(hero.nombre)}" width="900" height="1200">`
      : `<div class="msl-sin-img"><is-icon icon="mdi:storefront-outline"></is-icon></div>`}
    ${hero ? `<figcaption><a href="${esc(urlProducto(hero).replace(/^\//, ""))}">${esc(hero.nombre)} · ${esc(dinero(hero.precio, hero.moneda))}</a></figcaption>` : ""}
  </figure>
</msl-vitrina-hero>

<section class="vitrina-bloque" aria-label="Colecciones">
  <header class="vitrina-cabeza">
    <h2>Pasear la casa</h2>
    <p>Cada rincón con su propio ritmo. Elige por dónde empezar.</p>
  </header>
  <div class="vitrina-colecciones">
    ${departamentos.map((d) => htmlColeccion(d, delDepto(d), esc)).join("")}
  </div>
</section>

<section class="vitrina-bloque" aria-label="Piezas en vitrina">
  <header class="vitrina-cabeza">
    <h2>Ahora en sala</h2>
    <p>Lo que un visitante vería al cruzar la puerta.</p>
  </header>
  <div class="vitrina-mosaico">
    ${destacados.map((p, i) => htmlProducto(p, i, { esc, dinero, urlProducto })).join("")}
  </div>
</section>

<msl-vitrina-banda>
  <p class="msl-vitrina-kicker">Cómo se pide</p>
  <h2>Armas el carrito. Cierras por WhatsApp.</h2>
  <p>${esc(meta.descripcion || "Catálogo vivo, precios al día y pedido asistido. Así se ve Muéstralo cuando la tienda ya está abierta.")}</p>
  <div class="msl-vitrina-ctas">
    <a href="menu/"><is-button>Ver todo el menú</is-button></a>
    ${wa ? `<a href="https://wa.me/${esc(String(wa).replace(/\D/g, ""))}" rel="noopener"><is-button variant="text"><is-icon icon="mdi:whatsapp"></is-icon> Hablar con la tienda</is-button></a>` : ""}
  </div>
</msl-vitrina-banda>

${htmlSedes(meta.sedes || [], esc)}
`;
}

function destacar(departamentos, productos, delDepto, tope) {
  const vistos = new Set();
  const out = [];
  const colas = departamentos.map((d) => delDepto(d).filter((p) => fotoDe(p)));
  let i = 0;
  while (out.length < tope) {
    let avanzó = false;
    for (const cola of colas) {
      const p = cola[i];
      if (p && !vistos.has(p.id)) {
        vistos.add(p.id);
        out.push(p);
        avanzó = true;
        if (out.length >= tope) break;
      }
    }
    if (!avanzó) break;
    i++;
  }
  for (const p of productos) {
    if (out.length >= tope) break;
    if (!vistos.has(p.id) && fotoDe(p)) {
      vistos.add(p.id);
      out.push(p);
    }
  }
  return out;
}

function htmlColeccion(dep, items, esc) {
  const foto = fotoDe(items.find((p) => fotoDe(p)) || items[0]);
  const n = items.length;
  return `<msl-vitrina-coleccion>
  <a href="menu/#${esc(dep.id)}">
    ${foto
      ? `<img src="${esc(foto)}" alt="" loading="lazy">`
      : `<div class="msl-sin-img"><is-icon icon="${esc(dep.icono || "mdi:tag-outline")}"></is-icon></div>`}
    <span class="msl-vitrina-coleccion-meta">
      <strong>${esc(dep.nombre)}</strong>
      <em>${esc(dep.lema || `${n} ${n === 1 ? "pieza" : "piezas"}`)}</em>
    </span>
  </a>
</msl-vitrina-coleccion>`;
}

function htmlProducto(p, i, { esc, dinero, urlProducto }) {
  const foto = fotoDe(p);
  const href = urlProducto(p).replace(/^\//, "");
  const agotado = (p.stock || 0) <= 0;
  return `<msl-vitrina-producto data-i="${i}">
  <is-card>
    <a slot="media" href="${esc(href)}" tabindex="-1">
      ${foto
        ? `<img src="${esc(foto)}" alt="${esc(p.nombre)}" loading="lazy" width="640" height="800">`
        : `<div class="msl-sin-img"><is-icon icon="mdi:image-off-outline"></is-icon></div>`}
    </a>
    <a slot="header" href="${esc(href)}">${esc(p.nombre)}</a>
    <span class="msl-precio">${esc(dinero(p.precio, p.moneda))}</span>
    ${p.categoria ? `<small>${esc(p.categoria)}</small>` : ""}
    ${agotado ? `<is-badge>agotado</is-badge>` : ""}
    <div slot="actions" class="msl-acciones">
      <a href="${esc(href)}"><is-button variant="text">Ver</is-button></a>
      <is-button type="button" data-agregar="${p.id}" ${agotado ? "disabled" : ""}>
        <is-icon icon="mdi:cart-plus"></is-icon> Agregar
      </is-button>
    </div>
  </is-card>
</msl-vitrina-producto>`;
}

function htmlSedes(sedes, esc) {
  if (!sedes.length) return "";
  return `<msl-vitrina-banda data-variante="sedes">
  <p class="msl-vitrina-kicker">En la calle</p>
  <h2>Puntos de la casa</h2>
  <ul class="vitrina-sedes">
    ${sedes.map((s) => `<li><strong>${esc(s.nombre)}</strong><span>${esc(s.direccion || "")}</span></li>`).join("")}
  </ul>
  <p><a href="sedes/"><is-button variant="text">Cómo llegar</is-button></a></p>
</msl-vitrina-banda>`;
}
