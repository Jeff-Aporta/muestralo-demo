// Boot del sitio generado: fija el CDN local, carga el kit y despacha la vista.
// window.MSL lo horneó el build (app, api, dominio, whatsapp, moneda).

window.MSL_CDN = new URL("../cdn", import.meta.url).href;

const { cargarKit } = await import("../cdn/msl-loader.js");
const { MslCliente } = await import("../cdn/msl-cliente.js");
const { dinero } = await import("../cdn/msl-tema.js");
const R = await import("./runtime.js");

await cargarKit();
MslCliente.configurar({ base: window.MSL.api, app: window.MSL.app });

const vista = document.body.dataset.vista;
R.conectarShell(MslCliente);

if (vista === "inicio" || vista === "catalogo") R.conectarAgregables(MslCliente);
if (vista === "catalogo") R.conectarBuscador();
if (vista === "producto") R.conectarPersonalizacion(MslCliente);
if (vista === "carrito") R.vistaCarrito(MslCliente);
if (vista === "pedidos") R.vistaPedidos(MslCliente);
if (vista === "pedido") R.vistaPedido(MslCliente, dinero);

// Tracking de visita (una por página, MPA no tiene hashchange).
MslCliente.visita(location.pathname);
