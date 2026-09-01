# CLAUDE.md

Guía para Claude Code al trabajar en este repo.

## Qué es

PWA de **gestión de gastos personales** (es-AR). SPA en HTML/CSS/JS vanilla con Tailwind CDN, Chart.js y service worker. Backend: Supabase (Postgres + Auth + RLS). Hosting: GitHub Pages.

- Repo: `psettimini/PWA4` (branch `main`)
- App pública: GitHub Pages del repo
- Versión actual: `2.10.0` (ver `js/state.js` → `APP_VERSION`)

## Supabase

- **URL:** `https://vljwkvtivthwwerqxisc.supabase.co`
- **Project ID / ref:** `vljwkvtivthwwerqxisc` (nombre: `gastos-app`, región us-east-2, Postgres 17)
- Cliente inicializado en [js/state.js:5](js/state.js:5) con la anon key embebida (RLS protege los datos por `user_id`).

### Tablas (schema `public`, todas con RLS)

| Tabla | Filas aprox. | Notas |
|---|---|---|
| `profiles` | 1 | Perfil extendido. FK → `auth.users.id`. Campos: `plan` (`trial`/`active`/`expired`/`cancelled`), `trial_ends_at` (default now()+14 días), `email`, `display_name`, `subscription_id`. |
| `gastos` | ~695 | Movimientos. FK `user_id` → `auth.users.id`. Campos: `fecha`, `centro`, `tipo` (`F` o `V`), `concepto`, `metodo`, `importe` (numeric), `moneda` (`ARS` o `USD`, default `ARS`). |
| `centros` | ~7 | Centros de gasto por usuario. |
| `metodos_pago` | ~4 | Métodos de pago por usuario. |
| `presupuesto_fijos` | — | Presupuesto de gastos fijos. Una fila por ítem recurrente (`concepto`+`centro`+`moneda` únicos). `importe` es **por ocurrencia**; `frecuencia` (`mensual`…`anual`) define la mensualización; `mes_ancla` (1-12) ubica los no mensuales. Campos: `metodo`, `dia_vencimiento`, `cuotas_restantes`, `activo`, `notas`. |

Para inspeccionar/cambiar el schema usar las tools MCP de Supabase con `project_id=vljwkvtivthwwerqxisc`. **Nunca** correr `apply_migration` ni `execute_sql` destructivo sin confirmación previa del usuario.

## Estructura

```
index.html              SPA principal (~29 KB)
manifest.json           Manifiesto PWA
sw.js                   Service Worker (cache-first assets, network-first nav)
css/styles.css          Custom + dark mode + responsive
js/
  state.js              Cliente Supabase, estado global S, constantes, registry
  utils.js              Helpers puros: formato, cache, cola offline
  ui.js                 Toast, modal, dark mode, tabs, pull-to-refresh
  auth.js               Login, registro, reset, logout
  data.js               Carga, cache localStorage, sync offline
  carga.js              Form de alta/edición, patrones, autocomplete
  historial.js          Tabla, filtros, swipe cards, export
  dashboard.js          KPIs y gráficos
  comparar.js           Comparación mes a mes (acepta el presupuesto como lado)
  presupuesto.js        Presupuesto de fijos: detección, mensualización, pendientes
  abm.js                ABM centros y métodos
  app.js                Init, event listeners globales
docs/                   Documentación técnica detallada
```

Los módulos JS son **ES Modules** (migración hecha en commit `4a901a2`). Las dependencias circulares se resuelven con el `registry` exportado desde [js/state.js](js/state.js).

## Documentación existente

Antes de explorar a ciegas, leer `docs/`:

- [docs/arquitectura.md](docs/arquitectura.md) — stack, estructura, flujo de datos
- [docs/base-de-datos.md](docs/base-de-datos.md) — schema, RLS, queries
- [docs/funcionalidades.md](docs/funcionalidades.md) — features y comportamientos
- [docs/pwa-y-offline.md](docs/pwa-y-offline.md) — service worker, cola offline, cache
- [docs/seguridad.md](docs/seguridad.md) — RLS, auth, consideraciones
- [docs/ui-y-estilos.md](docs/ui-y-estilos.md) — patrones de UI, dark mode, mobile
- [docs/referencia-tecnica.md](docs/referencia-tecnica.md) — referencia API interna

## Flujo de desarrollo

1. **No hay build step.** Editar archivos y servir directo. Para probar local: `python3 -m http.server` o similar desde la raíz.
2. **Service worker:** al cambiar versiones de assets, bumpear el cache name en `sw.js` para forzar invalidación.
3. **Deploy:** push a `main` → GitHub Pages publica automáticamente.
4. **Versión:** actualizar `APP_VERSION` en `js/state.js` cuando haya cambios visibles al usuario.

## Convenciones

- **Branch:** se trabaja siempre sobre `main` y se pushea a `main`. No crear ramas ni PRs salvo que el usuario lo pida explícitamente.
- **Encoding:** todos los archivos en **UTF-8** (sin BOM). Aplica a HTML, JS, CSS, JSON, Markdown y cualquier archivo que se cree o modifique.
- Comentarios y mensajes de UI en **español (es-AR)**.
- Commits siguen el formato del repo: tipo en minúscula + descripción breve (`fix:`, `refactor:`, `feat:`). Ver `git log` para ejemplos.
- No introducir frameworks ni bundlers — el proyecto es deliberadamente vanilla.
