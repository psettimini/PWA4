# Referencia Técnica

[← Volver al índice](README.md)

---

## Estado Global (`config.js`)

| Variable | Tipo | Descripción |
|----------|------|-------------|
| `sb` | SupabaseClient | Cliente Supabase (nombrado `sb`, no `supabase`, para evitar error Safari) |
| `allData` | Array | Todos los gastos del usuario: `{ Fecha, Centro, Tipo, Concepto, Metodo, Importe, ID, _raw }` |
| `charts` | Object | Instancias activas de Chart.js por nombre |
| `patrones` | Array | Patrones de uso: `{ concepto, centro, tipo, metodo, frecuencia, promedio }` |
| `editingId` | string/null | ID del gasto en edición (`null` si es nuevo) |
| `currentTab` | string | Tab activa actual |
| `syncInProgress` | boolean | Flag para evitar sincronización concurrente |
| `dbCentros` | Array | Centros de gasto de la tabla catálogo |
| `dbMetodos` | Array | Métodos de pago de la tabla catálogo |
| `currentUserId` | string/null | UUID del usuario autenticado |
| `suggestionIndex` | number | Índice de navegación por teclado en autocomplete (-1 = ninguno) |

### Constantes

| Constante | Valor | Descripción |
|-----------|-------|-------------|
| `SUPABASE_URL` | `https://vljwkvtivthwwerqxisc.supabase.co` | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | JWT string | Clave pública anon |
| `APP_VERSION` | `'2.1.0'` | Versión de la app |
| `STORAGE_KEYS.dark` | `'gastos_dark'` | Key localStorage para dark mode |
| `STORAGE_KEYS.dataCache` | `'gastos_data_cache_v3'` | Key localStorage para datos |
| `STORAGE_KEYS.cacheMeta` | `'gastos_data_cache_meta_v3'` | Key localStorage para metadata cache |
| `STORAGE_KEYS.pendingQueue` | `'gastos_pending_queue_v2'` | Key localStorage para cola offline |
| `STORAGE_KEYS.historyFilters` | `'gastos_historial_filters_v1'` | Key localStorage para filtros historial |
| `$` | `id => document.getElementById(id)` | Selector shorthand |

---

## Catálogo de Funciones por Módulo

### `utils.js` — Funciones puras y helpers

| Función | Firma | Descripción |
|---------|-------|-------------|
| `safeNumber` | `(v) → number` | Parsea a float, retorna 0 si no es finito |
| `formatearNumero` | `(n) → string` | Entero formateado con `toLocaleString('es-AR')` |
| `localDateStr` | `() → string` | Fecha local YYYY-MM-DD (evita desfase UTC) |
| `localMesStr` | `() → string` | Mes local YYYY-MM |
| `setFechaHoy` | `() → void` | Setea input fecha a hoy |
| `debounce` | `(fn, ms) → fn` | Debounce genérico (default 150ms) |
| `escapeHtml` | `(s) → string` | Escape de &, <, >, ", ' |
| `escapeAttr` | `(s) → string` | Alias de escapeHtml para atributos |
| `csvEscape` | `(v) → string` | Escape para valores CSV |
| `getMesKey` | `(fecha) → string` | Extrae YYYY-MM de una fecha |
| `uniqueSorted` | `(vals) → string[]` | Valores únicos ordenados, filtra falsy |
| `destroyChart` | `(name) → void` | Destruye instancia Chart.js por nombre |
| `showLoading` | `(show) → void` | Muestra/oculta overlay de carga |
| `formatMesLabel` | `(m) → string` | "2024-03" → "Mar 2024" |
| `getDateGroupLabel` | `(fecha) → string` | Label temporal inteligente (Hoy, Ayer, etc.) |
| `formatFechaCorta` | `(fecha) → string` | "3 abr", "15 ene" |
| `aggregateBy` | `(items, keyFn, valFn) → object` | Reduce items en `{ key: sum }` |
| `getPendingQueue` | `() → array` | Lee cola offline de localStorage |
| `setPendingQueue` | `(queue) → void` | Guarda cola + actualiza badge |
| `enqueueOperation` | `(item) → void` | Encola operación con timestamp |
| `saveCache` | `(data) → void` | Guarda datos en localStorage |
| `loadCache` | `() → array` | Lee datos desde localStorage |
| `updateCacheLabel` | `() → void` | Actualiza label visual del cache |
| `updateNetworkStatus` | `(label, tone) → void` | Actualiza dot + texto de red |
| `updatePendingBadge` | `() → void` | Actualiza badge y botón pendientes |
| `persistHistoryFilters` | `() → void` | Guarda filtros del historial |
| `restoreHistoryFilters` | `() → void` | Restaura filtros del historial |
| `descargarCSV` | `(nombre, contenido) → void` | Genera y descarga archivo CSV |

### `ui.js` — Interfaz de usuario

| Función | Descripción |
|---------|-------------|
| `toast(msg, duration)` | Notificación de éxito |
| `toastError(msg)` | Notificación de error |
| `toastWarn(msg)` | Notificación de advertencia |
| `modalConfirm(msg)` | Modal de confirmación → Promise<boolean> |
| `initDarkMode()` | Inicializa dark mode (system pref o localStorage) |
| `applyDarkMode(dark)` | Aplica/remueve dark mode |
| `toggleDarkMode()` | Alterna dark mode |
| `showTab(tab)` | Cambia a la tab indicada |

### `auth.js` — Autenticación

| Función | Descripción |
|---------|-------------|
| `showAuth()` | Muestra overlay de auth |
| `hideAuth()` | Oculta overlay de auth |
| `showAuthMode(mode)` | Alterna login/register/reset |
| `showAuthError(msg)` | Muestra error en overlay |
| `showAuthSuccess(msg)` | Muestra éxito en overlay |
| `doLogin()` | Login con email + password |
| `doRegister()` | Registro de cuenta |
| `doResetPassword()` | Envío de email de recuperación |
| `doLogout()` | Cierre de sesión con limpieza total |

### `data.js` — Datos y sincronización

| Función | Descripción |
|---------|-------------|
| `cargarDatos()` | Carga todos los datos de Supabase, actualiza cache y UI |
| `loadCentrosFromDB()` | Carga catálogo de centros |
| `loadMetodosFromDB()` | Carga catálogo de métodos |
| `syncPendingQueue(showFeedback)` | Sincroniza cola offline |

### `carga.js` — Formulario y patrones

| Función | Descripción |
|---------|-------------|
| `guardarGasto()` | Guarda nuevo gasto o actualiza existente |
| `limpiarFormulario()` | Resetea formulario a estado inicial |
| `cancelarEdicion()` | Cancela edición en curso |
| `borrarGasto(id, concepto)` | Borra gasto con confirmación |
| `procesarPatrones()` | Genera patrones de uso desde allData |
| `mostrarSugerencias(v)` | Muestra autocomplete |
| `mostrarSugerenciasDebounced` | Versión con debounce 120ms |
| `navegarSugerencias(e)` | Navegación ↑↓ Enter Escape |
| `seleccionarPatron(c, ce)` | Selecciona sugerencia de autocomplete |
| `filtrarSugerencias()` | Trigger de autocomplete desde datalist |
| `actualizarSugerencias()` | Calcula fijos pendientes del mes |
| `seleccionarFijo(c, ce, t, m, i)` | Precarga fijo en formulario |
| `guardarFijoRapido(...)` | Carga rápida de fijo con fecha de hoy |
| `actualizarResumen()` | Calcula resumen del mes actual |

### `historial.js` — Historial y filtros

| Función | Descripción |
|---------|-------------|
| `getFiltrados()` | Aplica todos los filtros a allData |
| `renderHistorial()` | Renderiza tabla (desktop) y cards (mobile) |
| `filtrarHistorial()` | Persiste filtros + re-render |
| `filtrarHistorialDebounced` | Versión con debounce 200ms |
| `limpiarFiltros()` | Resetea filtros a "todos" |
| `exportarHistorialFiltrado()` | Descarga CSV filtrado |
| `editarGasto(id)` | Carga gasto en formulario de edición |
| `exportarCSV()` | Descarga CSV completo |
| `initSwipeCards()` | Inicializa event delegation para swipe |
| `borrarGasto_direct(id)` | Borrado directo (desde swipe) |

### `dashboard.js` — Gráficos y KPIs

| Función | Descripción |
|---------|-------------|
| `renderDashboard()` | Renderiza KPIs + gráficos principales |
| `renderEvolucionCentro()` | Gráfico de evolución de un centro seleccionado |
| `renderEvolucionConcepto()` | Gráfico de evolución de un concepto seleccionado |

### `comparar.js` — Comparación de meses

| Función | Descripción |
|---------|-------------|
| `initComparar()` | Puebla selects y auto-selecciona meses |
| `renderComparar()` | Render principal de comparación |
| `renderTablaComp(...)` | Tabla detalle con barras visuales |
| `renderBarrasComp(...)` | Bar chart comparativo |
| `renderDonutsComp(...)` | Donuts de distribución |
| `renderNuevosElim(...)` | Listas de nuevos/eliminados |
| `limpiarComparar()` | Resetea toda la sección |

### `abm.js` — Gestión de catálogos

| Función | Descripción |
|---------|-------------|
| `getAllValuesForField(field)` | Valores únicos (datos + catálogo DB) |
| `getStatsForField(field)` | Stats por valor: registros y total |
| `renderABM()` | Renderiza ambas listas (centros + métodos) |
| `renderABMList(field)` | Renderiza una lista ABM |
| `updateMetodoSelect()` | Actualiza select de método en formulario |
| `abmAdd(field)` | Agregar valor al catálogo |
| `abmRemoveCustom(field, value)` | Eliminar valor sin registros |
| `abmRename(field, oldValue)` | Renombrar con bulk update |
| `abmMerge(field, sourceValue)` | Fusionar con bulk rename + delete |

### `app.js` — Inicialización

| Listener/Acción | Descripción |
|-----------------|-------------|
| `DOMContentLoaded` | Inicializa: dark mode, cache label, badges, status red, fecha, versión, tab, SW, auth listener |
| `online` | Status → "En línea" + sync cola |
| `offline` | Status → "Sin conexión" |
| `click` (document) | Cierra sugerencias de autocomplete |
| `resize` (window) | Debounce 180ms → re-render sección visible |

---

## Localización Argentina

| Aspecto | Implementación |
|---------|----------------|
| Timezone | UTC-3. `localDateStr()` y `localMesStr()` usan `new Date()` local |
| Formato numérico | `toLocaleString('es-AR')` → punto como separador de miles |
| Idioma UI | Español argentino con voseo ("Iniciá", "Ingresá", "Completá") |
| Meses abreviados | Ene, Feb, Mar, Abr, May, Jun, Jul, Ago, Sep, Oct, Nov, Dic |
| Meses completos | Enero, Febrero, ..., Diciembre |
| Moneda | Peso argentino ($), sin decimales en display |
| Días de semana | Domingo, Lunes, ..., Sábado (para agrupación en historial) |
