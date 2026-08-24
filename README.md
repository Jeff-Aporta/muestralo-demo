# Tienda Demo — sitio público

Sitio de catálogo generado con **Muéstralo**. Repo estático: el contenido se hornea con SEO completo (meta, Open Graph, JSON-LD, sitemap) para indexar directo en Google, Bing y Yahoo, con la identidad de marca propia.

## Qué hay aquí

- `empresa.json` — identidad del tenant: `app` (id en la API), `api`, `dominio` público final e `idioma`.
- `css/`, `js/` — estilos y runtime del sitio (interactividad: sesión, carrito, pedidos).
- `cdn/` — kit de componentes `msl-*` (copia; la fuente vive en `Jeff-Aporta/muestralo-app`).
- `scripts/build.mjs` — generador: baja config y productos de la API y hornea `dist/`.
- `.github/workflows/pages.yml` — publica a GitHub Pages en cada push; Cloudflare Pages opcional.

## Regenerar el sitio

```bash
node scripts/build.mjs   # genera dist/ (requiere Node 20+, sin dependencias)
```

Cada push a `main` corre el build y publica automáticamente. Regenera cuando cambien productos, precios o config del tenant.

## DNS personalizado (opcional)

1. Define el dominio final en `empresa.json` → `dominio` y haz push.
2. En repo → Settings → Variables: `CF_PAGES_ENABLED=true`, `CF_PAGES_PROJECT=<nombre>`.
3. Secrets: `CF_API_TOKEN` y `CF_ACCOUNT_ID`.
4. El workflow despliega también a Cloudflare Pages; apunta el DNS al proyecto.
