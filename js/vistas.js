// Boot del sitio generado: carga el kit y despacha la vista.
// window.MSL lo horneó el build (app, api, dominio, whatsapp, moneda).
//
// El kit no se copia al repo de la empresa: llega por CDN desde muestralo-app.
// Para probar con un kit local, fija window.MSL_CDN antes de cargar este script.

const KIT = window.MSL_CDN || "https://cdn.jsdelivr.net/gh/Jeff-Aporta/muestralo-app@main/cdn";
window.MSL_CDN = KIT;

const { cargarKit } = await import(`${KIT}/msl-loader.js`);
const { MslCliente } = await import(`${KIT}/msl-cliente.js`);
const { dinero } = await import(`${KIT}/msl-tema.js`);
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
