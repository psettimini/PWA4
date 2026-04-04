# UI y Estilos

[← Volver al índice](README.md)

---

## Sistema de Notificaciones

| Tipo | Función | Duración | Color |
|------|---------|----------|-------|
| Éxito | `toast(msg)` | 1.8s | Slate oscuro (invertido en dark mode) |
| Error | `toastError(msg)` | 3s | Rojo (#dc2626) |
| Advertencia | `toastWarn(msg)` | 2.5s | Amber (#d97706) |

Todas las notificaciones: posición fija top-center, border-radius, shadow, fade-out animado, z-index 60, max-width 90vw.

---

## Modal de Confirmación

`modalConfirm(msg)` → `Promise<boolean>`

- Overlay oscuro semitransparente
- Caja centrada con mensaje + botones "Cancelar" / "Confirmar" (rojo)
- Cierra al hacer click fuera del modal
- Animación fadeIn de 200ms
- Texto escapado con `escapeHtml()` para prevenir XSS

---

## Modo Oscuro

### Activación

1. **Default:** detecta preferencia del sistema con `prefers-color-scheme: dark`
2. **Manual:** toggle en Config o botón luna/sol en navbar
3. **Persistencia:** `localStorage` key `gastos_dark` (`"0"` / `"1"`)

### Implementación

- Alterna clase `.dark` en `<html>`
- Actualiza `theme-color` meta tag (blanco ↔ `#0f172a`)
- Reconfigura `Chart.defaults.color` y `Chart.defaults.borderColor`
- Re-renderiza charts activos de Dashboard y Comparar
- Ícono alterna entre `fa-moon` y `fa-sun`

### Variables CSS

| Variable | Light | Dark |
|----------|-------|------|
| `--bg` | `#f1f5f9` | `#0f172a` |
| `--bg2` | `#eef2f7` | `#1e293b` |
| `--surface` | `rgba(255,255,255,.95)` | `rgba(30,41,59,.95)` |
| `--surface-solid` | `#fff` | `#1e293b` |
| `--border` | `rgba(226,232,240,.8)` | `rgba(51,65,85,.8)` |
| `--border-solid` | `#e2e8f0` | `#334155` |
| `--text` | `#1e293b` | `#f1f5f9` |
| `--text2` | `#334155` | `#cbd5e1` |
| `--text3` | `#64748b` | `#94a3b8` |
| `--text4` | `#94a3b8` | `#64748b` |
| `--input-bg` | `#fff` | `#0f172a` |
| `--input-border` | `#cbd5e1` | `#475569` |
| `--kpi-bg` | `#f8fafc` | `#334155` |
| `--card-shadow` | `rgba(0,0,0,.1)` | `rgba(0,0,0,.3)` |
| `--pill-bg` | `#f1f5f9` | `#334155` |
| `--pill-border` | `#e2e8f0` | `#475569` |
| `--pill-text` | `#475569` | `#cbd5e1` |

### Overrides dark

El CSS incluye overrides específicos para `.dark` que sobreescriben clases de Tailwind:
- Inputs, selects, textareas → fondo y borde oscuro
- Headings y text-slate-* → colores adaptados
- Backgrounds bg-slate-*, bg-white → variables dark
- Tablas (thead, tbody, bordes) → colores oscuros
- Badges de colores (bg-blue-50, bg-amber-50, etc.) → versiones con opacity

---

## Navegación por Tabs

### Desktop (≥769px)

Tab bar horizontal en la navbar superior con botones de texto. Tab activa con `border-bottom: 3px solid #3b82f6` y color azul.

### Mobile (≤768px)

Bottom navigation fija con 5 botones (ícono + label):
- Carga (`fa-plus-circle`)
- Historial (`fa-list`)
- Dashboard (`fa-chart-pie`)
- Comparar (`fa-balance-scale`)
- Config (`fa-cog`)

Tab activa destacada en azul. Padding inferior con `env(safe-area-inset-bottom)` para iPhones con notch.

### Comportamiento al cambiar tab

| Tab | Acción al activar |
|-----|-------------------|
| Carga | (ninguna adicional) |
| Historial | `restoreHistoryFilters()` + `renderHistorial()` |
| Dashboard | `renderDashboard()` |
| Comparar | `initComparar()` |
| Config | `renderABM()` |

La tab activa se persiste en `localStorage` y se restaura al recargar.

---

## Pull-to-Refresh

Implementación touch manual (sin librerías):

1. **`touchstart`:** registra Y inicial si `scrollY === 0` y auth overlay está oculto
2. **`touchmove`:** muestra indicador con progreso proporcional. Cambia texto: "Deslizá para actualizar" → "Soltar para actualizar". Flecha rota 180° al superar threshold
3. **`touchend`:** si supera threshold (80px), ejecuta `cargarDatos()` + toast "Datos actualizados". Animación de retracción

Indicador visual: barra flotante top-center con flecha/spinner + texto.

---

## Loading Overlay

`showLoading(true/false)` → overlay semitransparente con spinner Font Awesome (`fa-circle-notch fa-spin`) + texto "Cargando...". Z-index 40.

---

## Barra de Estado

Panel informativo debajo de la navbar (`.glass-panel`):

| Componente | Descripción |
|------------|-------------|
| Indicador de red | Punto (verde/amber/rojo) + texto ("Listo", "Sin conexión", etc.) |
| Cache label | Fecha y hora del último cache guardado |
| Badge pendientes | "N pendientes" — visible solo si hay operaciones en cola |
| Botón sincronizar | Fuerza `syncPendingQueue(true)` — visible solo si hay pendientes |

---

## Glass Panel

Clase `.glass-panel` aplicada a todos los contenedores principales:
- `backdrop-filter: blur(10px)`
- Background semitransparente
- Borde con variable `--border`
- Sombra con variable `--card-shadow`
- Transiciones suaves al cambiar tema

---

## Diseño Responsive (≤768px)

| Aspecto | Comportamiento mobile |
|---------|----------------------|
| Navbar | Compacta: brand + connection status. Sin tab bar |
| Navegación | Bottom nav fija con íconos |
| Formulario | Grids colapsan a 1 columna. Inputs: min-height 50px, font-size 16px (evita zoom iOS) |
| Historial | Tabla oculta → cards con swipe visibles |
| Filtros | Grid 1 columna full-width |
| Charts | `max-width: 100%` |
| Padding inferior | Ajustado para bottom nav + safe-area-inset |
| Glass panels | Border-radius 1rem, padding 1rem |
| Resumen mes | Grid 3 columnas con mini-cards |

---

## Tipografía

- **Fuente:** Inter (Google Fonts)
- **Pesos:** 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- **Body:** `font-family: 'Inter', sans-serif`

---

## Animaciones

| Animación | Uso |
|-----------|-----|
| `fadeIn` (0.3s) | Transición entre tabs (`.fade-in`) |
| `spin` (0.8s linear infinite) | Spinner de pull-to-refresh |
| Fade-out opacity | Toasts antes de removerse |
| `transition: transform 0.2s` | Swipe cards |
| `transition: background 0.3s, color 0.3s` | Cambio de tema dark/light |

---

## Colores de Comparación

| Clase | Color | Uso |
|-------|-------|-----|
| `.comp-up` | `#ef4444` (rojo) | Aumento de gasto |
| `.comp-down` | `#10b981` (verde) | Disminución de gasto |
| `.comp-neutral` | `var(--text3)` | Sin cambio |
| `.comp-bar-mes1` | `#3b82f6` (azul) | Barras Mes A |
| `.comp-bar-mes2` | `#f59e0b` (amber) | Barras Mes B |
