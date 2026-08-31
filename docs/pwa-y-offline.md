# PWA y Offline

[← Volver al índice](README.md)

---

## Service Worker (`sw.js`)

### Versionado

```javascript
const CACHE_VERSION = 'gastos-pwa-v2.5.6';
const STATIC_CACHE = `${CACHE_VERSION}-static`;   // Assets de App Shell
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;  // Respuestas dinámicas
```

Al actualizar `CACHE_VERSION`, el Service Worker invalida y recrea los caches.

### App Shell (assets cacheados)

```
./
index.html
manifest.json
css/styles.css
js/state.js
js/utils.js
js/ui.js
js/auth.js
js/data.js
js/carga.js
js/historial.js
js/dashboard.js
js/comparar.js
js/abm.js
js/app.js
icon-192.png
icon-512.png
apple-touch-icon.png
```

### Estrategias de cache

| Tipo de request | Estrategia | Descripción |
|-----------------|-----------|-------------|
| Navegación (HTML) | **Network First** | Intenta red primero; si falla, sirve desde cache |
| Assets estáticos (CSS, JS, imágenes, fonts) | **Stale While Revalidate** | Sirve cache inmediato + actualiza en background |
| Requests externos (CDN) | No interceptados | Solo se cachean requests same-origin |
| Requests no-GET | No interceptados | POST, PUT, DELETE pasan directo a la red |

### Ciclo de vida

1. **Install:** `skipWaiting()` + cachea todos los archivos del App Shell con `cache: 'reload'`
2. **Activate:** elimina caches de versiones anteriores + `clients.claim()` para tomar control inmediato
3. **Fetch:** intercepta requests same-origin GET según estrategia
4. **Message:** soporta `SKIP_WAITING` para forzar actualización

---

## Cache de Datos en localStorage

### Keys de almacenamiento

| Key | Contenido | Descripción |
|-----|-----------|-------------|
| `gastos_data_cache_v3` | JSON array | Copia completa de `allData` |
| `gastos_data_cache_meta_v3` | `{ savedAt, count }` | Metadata del último cache |
| `gastos_pending_queue_v2` | JSON array | Cola de operaciones offline |
| `gastos_historial_filters_v1` | JSON object | Filtros activos del historial |
| `gastos_dark` | `"0"` / `"1"` | Preferencia modo oscuro |
| `gastos_tab` | string | Última tab activa |

### Funciones de cache

| Función | Descripción |
|---------|-------------|
| `saveCache(data)` | Guarda `allData` + metadata en localStorage. Maneja `QuotaExceededError` |
| `loadCache()` | Lee `allData` desde localStorage. Retorna `[]` si falla |
| `updateCacheLabel()` | Actualiza label visual con fecha/hora del último cache |

### Manejo de QuotaExceededError

Si `localStorage` está lleno al guardar cache:
1. Elimina el cache anterior (`removeItem`)
2. Reintenta la escritura
3. Si vuelve a fallar, silencia el error (cache es opcional)

---

## Cola Offline (Pending Queue)

### Estructura de una operación encolada

```javascript
{
  action: 'add' | 'update' | 'delete',
  payload: {
    data: { Fecha, Centro, Tipo, Concepto, Metodo, Importe },  // para 'add'
    id: 'uuid',                                                 // para 'update'/'delete'
    record: { Fecha, Centro, ... }                               // para 'update'
  },
  queuedAt: '2026-04-03T15:30:00.000Z'  // timestamp ISO
}
```

### Funciones de cola

| Función | Descripción |
|---------|-------------|
| `getPendingQueue()` | Lee cola desde localStorage |
| `setPendingQueue(queue)` | Guarda cola + actualiza badge visual |
| `enqueueOperation(item)` | Agrega operación con timestamp |
| `syncPendingQueue(showFeedback)` | Procesa toda la cola secuencialmente |

### Proceso de sincronización (`syncPendingQueue`)

1. Verifica: hay items en cola, hay conexión, no hay sync en progreso, hay usuario autenticado
2. Recorre cada operación:
   - `add` → INSERT en Supabase con `user_id`
   - `update` → UPDATE en Supabase por `id`
   - `delete` → DELETE en Supabase por `id`
3. Operaciones exitosas se remueven de la cola
4. Operaciones fallidas permanecen para reintentar
5. Si se procesó todo: recarga datos completos
6. Si quedan pendientes: toast de aviso

### Triggers de sincronización

| Trigger | Fuente |
|---------|--------|
| Recuperar conexión | `window.addEventListener('online')` |
| Manual | Botón "Sincronizar" en barra de estado |
| Post-carga de datos | Al final de `cargarDatos()` si hay pendientes |

### Indicadores visuales

| Componente | Ubicación | Visible cuando |
|------------|-----------|----------------|
| Badge "N pendientes" | Barra de estado | Cola tiene ≥1 item |
| Botón "Sincronizar" | Barra de estado | Cola tiene ≥1 item |
| Badge "Pendiente" en card/fila | Historial | Registro tiene `_pending: true` |
| Connection status | Navbar | Siempre ("N reg.", "N reg. (caché)", "Sin conexión") |

---

## Comportamiento Offline Completo

### Al perder conexión

1. Status → "Sin conexión" (punto rojo)
2. Operaciones de guardar/editar/borrar se encolan automáticamente
3. Toast amarillo: "Sin conexión. Gasto guardado localmente."
4. Datos locales se actualizan optimistamente (el registro aparece con badge "Pendiente")
5. Cache se actualiza con los cambios locales

### Al recuperar conexión

1. Status → "En línea" (punto verde)
2. Se intenta sincronizar la cola automáticamente
3. Si éxito: toast "Pendientes sincronizados" + recarga datos frescos
4. Si fallo parcial: toast "Quedaron N pendientes"

### Si la carga inicial falla (sin internet al abrir)

1. Se intenta cargar desde cache de localStorage
2. Si hay cache: status → "N reg. (caché)" (punto amber), toast "Sin conexión. Se muestra la última copia local."
3. Si no hay cache: status → "Sin conexión" (punto rojo)
