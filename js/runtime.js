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

// Buscador del catálogo: filtra en cliente sobre las tarjetas ya horneadas.
export function conectarBuscador() {
  const form = document.getElementById("buscador");
  if (!form) return;
  form.addEventListener("submit", (e) => e.preventDefault());
  form.q.addEventListener("input", () => {
    const q = form.q.value.trim().toLowerCase();
    document.querySelectorAll(".tarjeta-producto").forEach((t) => {
      t.hidden = q && !t.textContent.toLowerCase().includes(q);
    });
  });
}

// ------------------------------------------------------------- producto

// Form de personalización horneado: variaciones + adicionales + cantidad.
export function conectarPersonalizacion(MslCliente) {
  const form = document.getElementById("personalizar");
  const art = document.querySelector(".producto");
  if (!form || !art) return;
  const prod = JSON.parse(art.dataset.producto);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!exigirSesion(MslCliente)) return;
    const personalizacion = {};
    for (const sel of form.querySelectorAll("select")) personalizacion[sel.name] = sel.value;
    const adic = [...form.querySelectorAll('[name="adicional"]:checked')].map((c) => c.value);
    if (adic.length) personalizacion.adicionales = adic;
    await MslCliente.agregar(prod.id, Number(form.cantidad.value) || 1, personalizacion);
    location.href = `${window.MSL.dominio}/carrito/`;
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
  const pedidos = await MslCliente.pedidos();
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
