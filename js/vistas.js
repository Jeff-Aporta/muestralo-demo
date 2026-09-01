// Boot del sitio generado: carga el kit y despacha la vista.
// window.MSL lo horneó el build (app, api, dominio, whatsapp, moneda).
//
// El kit no se copia al repo de la empresa: llega por CDN desde muestralo-app.
// Para probar con un kit local, fija window.MSL_CDN antes de cargar este script.

const KIT = window.MSL_CDN || new URL("../cdn/", import.meta.url).href.replace(/\/+$/, "");
window.MSL_CDN = KIT;

const { cargarKit } = await import(`${KIT}/msl-loader.js`);
const { MslCliente } = await import(`${KIT}/msl-cliente.js`);
const { dinero, montarControlesTema } = await import(`${KIT}/msl-tema.js`);
const R = await import("./runtime.js");

await cargarKit("tienda");
MslCliente.configurar({ base: window.MSL.api, app: window.MSL.app });

// Controles nativos del kit: paleta de marca y claro/oscuro.
// El tema ya se aplicó antes del primer pintado (script del <head>).
montarControlesTema(document.getElementById("controles-tema"), window.MSL.paletas || []);

const vista = document.body.dataset.vista;
R.conectarShell(MslCliente);

if (vista === "inicio" || vista === "catalogo" || vista === "menu" || vista === "promociones") R.conectarAgregables(MslCliente);
if (vista === "catalogo" || vista === "menu" || vista === "promociones") R.conectarBuscador();
if (vista === "producto") R.conectarPersonalizacion(MslCliente, dinero);
if (vista === "carrito") R.vistaCarrito(MslCliente);
if (vista === "pedidos") R.vistaPedidos(MslCliente);
if (vista === "pedido") R.vistaPedido(MslCliente, dinero);

// Tracking de visita (una por página, MPA no tiene hashchange).
MslCliente.visita(location.pathname);
