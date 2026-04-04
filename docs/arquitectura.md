# Arquitectura

[← Volver al índice](README.md)

---

## Stack Tecnológico

| Capa | Tecnología | Detalle |
|------|------------|--------|
| Frontend | HTML5 + Tailwind CSS + JS vanilla | SPA con módulos JS |
| CSS Framework | Tailwind CSS 3 | CDN (`cdn.tailwindcss.com`) |
| Gráficos | Chart.js | CDN (`cdn.jsdelivr.net`) |
| Iconos | Font Awesome 6 | CDN (`cdnjs.cloudflare.com`) |
| Tipografía | Inter (300–700) | Google Fonts |
| Backend | Supabase | PostgreSQL + Auth + RLS |
| Hosting | GitHub Pages | Repo `psettimini/PWA4`, branch `main` |
| PWA | Service Worker + Manifest | Cache-first para assets, network-first para navegación |

**URL Supabase:** `https://vljwkvtivthwwerqxisc.supabase.co`

---

## Estructura de Archivos

```
PWA4/
├── index.html              ← HTML principal (SPA, ~29 KB)
├── manifest.json           ← Manifiesto PWA
├── sw.js                   ← Service Worker
├── css/
│   └── styles.css          ← Estilos custom + dark mode + responsive
├── js/
│   ├── config.js           ← Configuración Supabase, estado global, constantes
│   ├── utils.js            ← Funciones puras: formateo, cache, cola offline
│   ├── ui.js               ← Toast, modal, dark mode, tabs, pull-to-refresh
│   ├── auth.js             ← Login, registro, reset password, logout
│   ├── data.js             ← Carga de datos, cache, sincronización offline
│   ├── carga.js            ← Formulario, patrones, autocomplete, fijos pendientes
│   ├── historial.js        ← Tabla, filtros, swipe cards mobile, exportación
│   ├── dashboard.js        ← KPIs, gráficos de evolución y distribución
│   ├── comparar.js         ← Comparación mes a mes con gráficos y tablas
│   ├── abm.js              ← ABM de centros de gasto y métodos de pago
│   └── app.js              ← Inicialización, event listeners globales
├── docs/                   ← Documentación técnica (esta carpeta)
├── icon-192.png            ← Ícono PWA 192×192
├── icon-512.png            ← Ícono PWA 512×512
├── apple-touch-icon.png    ← Ícono para iOS 180×180
└── README.md
```

### Orden de carga de módulos JS

El orden importa porque todas las funciones son globales y hay dependencias entre módulos:

1. `config.js` — Supabase client (`sb`), estado global, constantes
2. `utils.js` — Helpers puros que usan las constantes de config
3. `ui.js` — Toast, modal, tabs (usa `$()`, `escapeHtml` de utils)
4. `auth.js` — Auth (usa `sb`, `$()`, `modalConfirm`, `showAuth/hideAuth`)
5. `data.js` — Carga de datos (usa `sb`, cache utils, `currentUserId`)
6. `carga.js` — Formulario (usa `sb`, `allData`, `patrones`, `dbCentros`)
7. `historial.js` — Historial (usa `allData`, filtros, `editarGasto`)
8. `dashboard.js` — Dashboard (usa `allData`, `charts`, Chart.js)
9. `comparar.js` — Comparación (usa `allData`, `charts`, Chart.js)
10. `abm.js` — ABM (usa `sb`, `dbCentros`, `dbMetodos`, `allData`)
11. `app.js` — Inicialización (usa todo lo anterior)

---

## Flujo de Datos

```
                   ┌─────────────────┐
                   │  Supabase Auth   │
                   └────────┬────────┘
                            │ onAuthStateChange
                            ▼
                   ┌─────────────────┐
                   │   cargarDatos()  │◄── Pull-to-refresh
                   │                  │◄── Botón Recargar
                   │                  │◄── Post-guardado/borrado
                   └────────┬────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
    ┌─────────────┐  ┌──────────┐  ┌──────────┐
    │ sb.gastos   │  │sb.centros│  │sb.metodos│
    │ select *    │  │ select   │  │ select   │
    └──────┬──────┘  └────┬─────┘  └────┬─────┘
           │              │              │
           ▼              ▼              ▼
    ┌──────────────────────────────────────────┐
    │     allData / dbCentros / dbMetodos      │
    │        (estado global en memoria)        │
    └──────────────────────┬───────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ saveCache()  │  │procesarPat.()│  │actualizarSug.│
  │(localStorage)│  │ → patrones   │  │ → fijos pend.│
  └──────────────┘  └──────┬───────┘  └──────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │renderHist. │    │renderDash. │    │renderComp. │
  │(si visible)│    │(si visible)│    │(si visible)│
  └────────────┘    └────────────┘    └────────────┘
```

### Ciclo de vida de un gasto

1. **Crear:** Formulario → validación → INSERT en Supabase (o encolar offline) → `cargarDatos()` → re-render
2. **Editar:** Click editar → cargar en formulario → UPDATE en Supabase → `cargarDatos()` → re-render
3. **Borrar:** Click borrar → modal confirmación → DELETE en Supabase → `cargarDatos()` → re-render
4. **Offline:** Cualquier operación se encola → se sincroniza al volver online

---

## PWA Manifest

| Campo | Valor |
|-------|-------|
| `name` | Gestión de Gastos |
| `short_name` | Gastos |
| `lang` | es-AR |
| `display` | standalone |
| `orientation` | portrait-primary |
| `background_color` | #ffffff |
| `theme_color` | #ffffff |
| `categories` | finance, productivity, business |
| Íconos | 192×192, 512×512 (any+maskable), 180×180 (apple-touch) |

Metas HTML adicionales: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `viewport-fit=cover`, `user-scalable=no`.
