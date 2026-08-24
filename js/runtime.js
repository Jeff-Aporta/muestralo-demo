// Runtime compartido del sitio generado: sesión, carrito y pedidos.
// Toda página horneada lo usa; el contenido SEO ya viene en el HTML.

// ------------------------------------------------------------- sesión

// Conecta topbar: botón de sesión, diálogo auth, contador de carrito.
export function conectarShell(MslCliente) {
  const dlg = document.getElementById("dlg-sesion");
  const btn = document.getElementById("btn-sesion");
  const pintarSesion = () => {
    document.getElementById("enlace-pedidos").hidden = !MslCliente.token;
  };
  btn.onclick = () => {
    if (MslCliente.token) {
      if (confirm("¿Cerrar sesión?")) { MslCliente.logout(); pintarSesion(); refrescarContador(MslCliente); }
    } else dlg.showModal();
  };
  document.querySelector("msl-auth-form").addEventListener("msl-login", () => {
    dlg.close();
    pintarSesion();
    refrescarContador(MslCliente);
  });
  pintarSesion();
  refrescarContador(MslCliente);
}

export async function refrescarContador(MslCliente) {
  const n = document.getElementById("carrito-n");
  if (!MslCliente.token) { n.textContent = ""; return; }
  const c = await MslCliente.carrito().catch(() => null);
  n.textContent = c ? `(${c.items.length})` : "";
}

// Exige sesión: sin token abre el diálogo y devuelve false.
function exigirSesion(MslCliente) {
  if (MslCliente.token) return true;
  document.getElementById("dlg-sesion").showModal();
  return false;
}

// ------------------------------------------------------------- catálogo

// Botones "Agregar" horneados en las tarjetas (data-agregar = id producto).
export function conectarAgregables(MslCliente) {
  document.querySelectorAll("[data-agregar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!exigirSesion(MslCliente)) return;
      await MslCliente.agregar(Number(btn.dataset.agregar), 1, {});
      await refrescarContador(MslCliente);
    });
  });
}

// Buscador y filtros del catálogo: trabajan sobre el índice ya horneado.
// Nada de pedir de nuevo a la API: el HTML ya tiene todas las referencias.
export function conectarBuscador() {
  const form = document.getElementById("buscador");
  if (!form) return;
  const secciones = [...document.querySelectorAll("section.seccion")];
  const aviso = document.getElementById("sin-resultados");
  let depto = "";

  const aplicar = () => {
    const q = form.q.value.trim().toLowerCase();
    let visibles = 0;
    for (const sec of secciones) {
      const enDepto = !depto || sec.id === depto;
      let n = 0;
      for (const li of sec.querySelectorAll("li")) {
        const coincide = enDepto && (!q || li.textContent.toLowerCase().includes(q));
        li.hidden = !coincide;
        if (coincide) n++;
      }
      sec.hidden = n === 0;
      const cuenta = sec.querySelector(".indice-titulo span");
      if (cuenta && n) cuenta.textContent = `${n} ${n === 1 ? "referencia" : "referencias"}`;
      visibles += n;
    }
    if (aviso) aviso.hidden = visibles > 0;
  };

  form.addEventListener("submit", (e) => e.preventDefault());
  form.q.addEventListener("input", aplicar);
  document.getElementById("filtros-depto")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-depto]");
    if (!btn) return;
    depto = btn.dataset.depto;
    for (const b of document.querySelectorAll("[data-depto]")) {
      b.setAttribute("aria-pressed", String(b === btn));
    }
    aplicar();
    if (depto) document.getElementById(depto)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // El hash de la URL entra ya filtrado (enlaces del home y del pie).
  if (location.hash) {
    const id = location.hash.slice(1);
    document.querySelector(`[data-depto="${CSS.escape(id)}"]`)?.click();
  }
}

// ------------------------------------------------------------- producto

// Ficha de producto: fichas de opción, adicionales y total en vivo.
export function conectarPersonalizacion(MslCliente, dinero) {
  const form = document.getElementById("personalizar");
  const art = document.querySelector(".producto");
  if (!form || !art) return;
  const prod = JSON.parse(art.dataset.producto);
  const totalEl = document.getElementById("total-linea");
  const aviso = document.getElementById("aviso-producto");

  const leer = () => {
    const personalizacion = {};
    for (const g of form.querySelectorAll("fieldset[data-grupo]")) {
      const clave = g.dataset.grupo;
      if (clave === "adicionales") continue;
      const elegido = g.querySelector("input[type=radio]:checked");
      if (elegido) personalizacion[clave] = elegido.value;
    }
    const adic = [...form.querySelectorAll('[name="adicional"]:checked')];
    if (adic.length) personalizacion.adicionales = adic.map((c) => c.value);
    const extra = adic.reduce((s, c) => s + Number(c.dataset.precio || 0), 0);
    const cantidad = Math.max(1, Number(form.cantidad.value) || 1);
    return { personalizacion, total: (prod.precio + extra) * cantidad, cantidad };
  };

  // El total se recalcula igual que en el servidor: base + adicionales.
  const refrescarTotal = () => {
    if (totalEl && dinero) totalEl.textContent = dinero(leer().total, prod.moneda);
  };
  form.addEventListener("change", refrescarTotal);
  form.addEventListener("input", refrescarTotal);
  refrescarTotal();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!exigirSesion(MslCliente)) return;
    const { personalizacion, cantidad } = leer();
    try {
      await MslCliente.agregar(prod.id, cantidad, personalizacion);
      location.href = `${window.MSL.dominio}/carrito/`;
    } catch (err) {
      if (aviso) aviso.innerHTML = `<span class="msl-error">${err.message}</span>`;
    }
  });
}

// ------------------------------------------------------------- carrito

export async function vistaCarrito(MslCliente) {
  if (!exigirSesion(MslCliente)) return;
  const panel = document.querySelector("msl-carrito-panel");
  const pintar = async () => {
    panel.carrito = await MslCliente.carrito();
    refrescarContador(MslCliente);
  };
  await pintar();
  panel.addEventListener("msl-cantidad", async (e) => {
    await MslCliente.cambiarCantidad(e.detail.id, e.detail.cantidad);
    pintar();
  });
  panel.addEventListener("msl-quitar", async (e) => {
    await MslCliente.quitar(e.detail.id);
    pintar();
  });
  panel.addEventListener("msl-congelar", async () => {
    const r = await MslCliente.congelar();
    // Enlace canónico del sitio generado (MPA): /pedido/?c=CODIGO.
    const wa = window.MSL.whatsapp
      ? `https://wa.me/${window.MSL.whatsapp}?text=` +
        encodeURIComponent(`Deseo hacer este pedido ${window.MSL.dominio}/pedido/?c=${r.codigo}`)
      : r.whatsapp_url;
    location.href = `${window.MSL.dominio}/pedido/?c=${r.codigo}`;
    if (wa) open(wa, "_blank");
  });
}

// ------------------------------------------------------------- pedidos

export async function vistaPedidos(MslCliente) {
  if (!exigirSesion(MslCliente)) return;
  const lista = document.getElementById("lista-pedidos");
  const { results: pedidos } = await MslCliente.pedidos();
  lista.innerHTML = pedidos.length
    ? pedidos.map(() => `<msl-pedido-card></msl-pedido-card>`).join("")
    : `<p>Sin pedidos todavía.</p>`;
  lista.querySelectorAll("msl-pedido-card").forEach((el, i) => { el.pedido = pedidos[i]; });
}

export async function vistaPedido(MslCliente) {
  if (!exigirSesion(MslCliente)) return;
  const codigo = new URLSearchParams(location.search).get("c");
  const cont = document.getElementById("pedido-detalle");
  if (!codigo) { cont.innerHTML = `<p class="msl-error">Falta el código del pedido.</p>`; return; }
  try {
    const p = await MslCliente.pedido(codigo);
    if (window.MSL.whatsapp) {
      p.whatsapp_url = `https://wa.me/${window.MSL.whatsapp}?text=` +
        encodeURIComponent(`Deseo hacer este pedido ${window.MSL.dominio}/pedido/?c=${p.codigo}`);
    }
    cont.innerHTML = `<msl-pedido-card></msl-pedido-card>`;
    cont.querySelector("msl-pedido-card").pedido = p;
  } catch (e) {
    cont.innerHTML = `<p class="msl-error">${e.message}</p>`;
  }
}
