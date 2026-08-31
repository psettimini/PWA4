# Funcionalidades

[← Volver al índice](README.md)

---

## Secciones de la Aplicación

La app tiene 5 tabs/secciones principales:

| Tab | Sección | Módulo JS | Descripción |
|-----|---------|-----------|-------------|
| Carga | `section-carga` | `carga.js` | Formulario para registrar gastos |
| Historial | `section-historial` | `historial.js` | Listado filtrable de gastos |
| Dashboard | `section-dashboard` | `dashboard.js` | KPIs y gráficos analíticos |
| Comparar | `section-comparar` | `comparar.js` | Comparación mes a mes |
| Config ⚙ | `section-config` | `abm.js` | Configuración, ABM de catálogos |

---

## 1. Autenticación (`auth.js`)

### Funciones

| Función | Descripción |
|---------|-------------|
| `doLogin()` | Login con email + password vía `sb.auth.signInWithPassword()` |
| `doRegister()` | Registro con `sb.auth.signUp()`. Requiere confirmación por email |
| `doResetPassword()` | Envío de email de recuperación con `sb.auth.resetPasswordForEmail()` |
| `doLogout()` | Cierre de sesión con confirmación modal. Limpia cache, datos y cola offline |
| `showAuth()` / `hideAuth()` | Muestra/oculta el overlay de autenticación |
| `showAuthMode(mode)` | Alterna entre modos: `'login'`, `'register'`, `'reset'` |
| `showAuthError(msg)` / `showAuthSuccess(msg)` | Feedback visual en el overlay |

### Flujo

1. Al cargar la app, `sb.auth.onAuthStateChange()` (en `app.js`) verifica si hay sesión activa
2. **Con sesión:** oculta overlay → guarda `currentUserId` → carga datos (con delay 100ms)
3. **Sin sesión:** muestra overlay de login
4. **Logout:** limpia `allData`, `dbCentros`, `dbMetodos`, `currentUserId`, cache localStorage y cola offline

### Traducción de errores

| Error de Supabase | Mensaje mostrado |
|-------------------|------------------|
| `Invalid login credentials` | Email o contraseña incorrectos |
| `Email not confirmed` | Revisá tu email para confirmar la cuenta |
| `User already registered` | Ya existe una cuenta con ese email |

---

## 2. Carga de Gastos (`carga.js`)

### Formulario

Campos del formulario:

| Campo | Tipo HTML | Validación | Notas |
|-------|-----------|------------|-------|
| Fecha | `input[date]` | Requerido | Default: hoy (fecha local) |
| Centro de Gasto | `input[text]` + `datalist` | Requerido | Autocomplete desde catálogo |
| Concepto | `input[text]` | Requerido | Autocomplete inteligente |
| Tipo | `select` | — | "F" (Fijo) / "V" (Variable) |
| Método de Pago | `select` | — | Dinámico desde catálogo |
| Moneda | toggle ARS/USD | — | Default ARS. Cambia el label del importe a `$` o `U$S` |
| Importe | `input[text]` | Requerido, ≠ 0 | `inputmode="decimal"`, admite `.` o `,` |

### Guardar gasto (`guardarGasto()`)

1. Valida campos obligatorios e importe ≠ 0
2. **Detección de duplicados** (solo al crear): busca en `allData` mismo concepto + centro **en la misma moneda** y en el mismo mes
   - Para conceptos "repetibles" (transferencia, envío, retiro, carga): pregunta "¿Cargar otro?"
   - Para el resto: pregunta "¿Cargar igual?"
   - Muestra los importes de los duplicados existentes con su moneda
3. INSERT o UPDATE en Supabase
4. **Si offline:** encola operación con `enqueueOperation()`, actualiza datos locales, muestra toast de aviso
5. Vibración háptica (`navigator.vibrate(50)`) al guardar exitosamente
6. Limpia formulario y recarga datos

### Edición inline

- `editarGasto(id)` carga datos del registro en el formulario
- Cambia botón "Guardar" (azul) → "Actualizar" (amber)
- Muestra indicador "Editando registro existente" y botón "Cancelar"
- `cancelarEdicion()` resetea todo al estado inicial

### Autocomplete de concepto

- Se activa al escribir ≥ 2 caracteres en el campo Concepto
- Busca en `patrones` (históricos) por concepto o centro
- Muestra hasta 6 resultados con: nombre, centro, frecuencia (Nx), promedio ($)
- Navegación por teclado: ↑↓ para moverse, Enter para seleccionar, Escape para cerrar
- Al seleccionar: autocompleta concepto, centro, tipo, método y muestra promedio como sugerencia
- Debounce de 120ms

### Patrones históricos (`procesarPatrones()`)

Analiza `allData` y genera:
- Mapa de **concepto+centro+moneda** → frecuencia, tipo habitual, método habitual, promedio de importe. Mismo concepto en ARS y USD son patrones distintos.
- Puebla datalists y selects de filtros (centros, métodos, meses)
- Combina datos históricos con tablas catálogo (`dbCentros`, `dbMetodos`)

### Fijos pendientes (`actualizarSugerencias()`)

Panel lateral que muestra gastos fijos del mes anterior que todavía no fueron cargados este mes.

**Lógica:**
1. Toma gastos tipo "F" del mes anterior
2. Excluye los que tienen método "pagado por el año"
3. Compara con los ya cargados en el mes actual (por concepto+centro+moneda)
4. Muestra los pendientes ordenados por importe descendente
5. Para cada fijo muestra: concepto, centro, importe (con su moneda), y variación % vs. 2 meses atrás (↑ rojo / ↓ verde). Los gastos en USD llevan un tag `U$S`.

**Acciones por fijo pendiente:**
- **Click en la card:** Precarga el formulario para revisión antes de guardar
- **Botón ⚡ (carga rápida):** `guardarFijoRapido()` — inserta directamente con fecha de hoy sin pasar por formulario

### Resumen del mes (`actualizarResumen()`)

Panel lateral con métricas del mes actual:
- **Total:** suma de importes en ARS (con línea adicional `U$S X` chica si hay gastos en USD)
- **Cantidad:** número de registros (suma de ambas monedas)
- **Promedio:** total/cantidad por moneda (ARS principal, USD chico debajo si aplica)

---

## 3. Historial (`historial.js`)

### Renderizado dual

- **Desktop (≥769px):** Tabla con columnas: Fecha, Centro, Concepto, Tipo (badge), Método, Importe (monospace), Acciones
- **Mobile (≤768px):** Cards con swipe, agrupadas por fecha

### Filtros combinados

| Filtro | Tipo | Opciones |
|--------|------|----------|
| Búsqueda texto | Input | Busca en concepto y centro |
| Centro | Select | Todos / cada centro |
| Tipo | Select | Todos / Fijos / Variables |
| Método | Select | Todos / cada método |
| Mes | Select | Todos / cada mes con datos |
| Moneda | Select | Todas / ARS / USD |

- Todos los filtros se aplican combinados (AND)
- Debounce de 200ms en búsqueda de texto
- Filtros persistidos en localStorage entre cambios de tab y recargas
- Botón "Limpiar" resetea todos a "todos"

### Paginación

Muestra los primeros 100 registros del resultado filtrado. Si hay más, indica "(100 mostrados)".

### Swipe cards (mobile)

Implementación con event delegation en el contenedor:
- **Swipe derecha → Editar:** abre el registro en el formulario de Carga
- **Swipe izquierda → Borrar:** confirmación modal, animación de salida
- Threshold: 80px, máximo: 120px
- Fondo revelado: azul (editar) / rojo (borrar)

### Agrupación temporal (mobile)

Las cards se agrupan por separadores con labels inteligentes:
- Hoy, Ayer, nombre del día (Lunes-Sábado), Semana pasada, nombre del mes, mes+año

### Visualización de importes

- Importes negativos (devoluciones) se muestran en **rojo con signo menos**
- Importes positivos: verde (fijo) o amber (variable) en cards mobile
- Registros pendientes de sincronización muestran badge "Pendiente"

### Exportación

- **Exportar filtrado:** `exportarHistorialFiltrado()` — CSV con los registros filtrados actualmente
- **Exportar completo:** `exportarCSV()` — CSV con todos los registros (desde Config)
- Formato CSV con escape de comillas y caracteres especiales

---

## 4. Dashboard (`dashboard.js`)

### KPIs (5 tarjetas con gradientes de color)

Cada KPI muestra el valor de **ARS** grande y debajo, en chico, el valor en **USD**.

| KPI | Cálculo (por moneda) | Color |
|-----|----------------------|-------|
| Mes Actual | Suma importes del mes en curso | Azul |
| Promedio Mensual | Total histórico / meses distintos | Verde |
| Gastos Fijos | % del total que es tipo "F" | Púrpura |
| Movimientos del Mes | Cantidad de registros del mes actual | Amber |
| Ticket Promedio | Total mes actual / movimientos del mes | Rosa |

### Gráficos

Selector de moneda (`#dash-moneda`, default ARS) que filtra los datos de **todos** los gráficos del dashboard. Pesos y dólares no se mezclan en una misma serie.

| Gráfico | Tipo | Descripción |
|---------|------|-------------|
| Evolución Mensual | Bar chart | Gasto total por mes, todos los meses. Eje Y en M/k según moneda |
| Por Centro de Gasto | Doughnut (cutout 58%) | Top 8 centros como % del total histórico (de la moneda activa) |
| Evolución por Centro | Bar chart + stats | Select de centro → evolución mensual. Stats: total, promedio, último mes |
| Evolución por Concepto | Bar chart + stats | Select de concepto → evolución mensual. Stats: total, promedio, meses |

Todos los gráficos se destruyen y recrean al cambiar datos o al re-renderizar (`destroyChart()`).

---

## 5. Comparar Meses (`comparar.js`)

### Inicialización

- Puebla selects con todos los meses disponibles
- Auto-selecciona: Mes A = mes anterior, Mes B = mes actual

### KPIs de comparación (4 tarjetas)

Cada KPI muestra el valor en **ARS** grande y debajo, en chico, el valor en **USD**.

| KPI | Color |
|-----|-------|
| Total Mes A | Azul (ARS) / violeta (USD) |
| Total Mes B | Amber (ARS) / violeta (USD) |
| Diferencia | Rojo si subió, verde si bajó |
| Variación (%) | Rojo si subió, verde si bajó |

Selector `#comp-moneda` (default ARS) que filtra **tabla detalle, barras, donuts y nuevos/eliminados** a la moneda elegida.

### Vistas de comparación

El select permite comparar por 4 dimensiones:
- **Por Centro** (default)
- **Por Concepto**
- **Por Tipo** (Fijo/Variable)
- **Por Método** de pago

### Componentes visuales

| Componente | Descripción |
|------------|-------------|
| Tabla detalle | Categoría, Mes A, Mes B, diferencia, %, barras proporcionales. Footer con TOTAL. Badge "NUEVO" para categorías nuevas |
| Barras comparativas | Bar chart agrupado top 10 categorías |
| Donuts distribución | Dos donuts lado a lado (top 6 + "Otros") |
| Nuevos en B | Categorías que aparecen solo en Mes B |
| Solo en A | Categorías que desaparecieron en Mes B |

---

## 6. ABM — Centros y Métodos (`abm.js`)

Módulo de Alta, Baja y Modificación para catálogos maestros, ubicado en la sección Config.

### Operaciones

| Operación | Función | Descripción |
|-----------|---------|-------------|
| Listar | `renderABMList()` | Muestra cada valor con: nombre, cantidad de registros, total acumulado |
| Agregar | `abmAdd()` | Inserta en tabla catálogo. Valida duplicados (case insensitive) |
| Renombrar | `abmRename()` | Prompt para nuevo nombre. Usa `bulk_rename()` RPC para actualizar registros históricos + tabla catálogo |
| Fusionar | `abmMerge()` | Prompt con opciones destino. `bulk_rename()` mueve registros, luego elimina origen del catálogo |
| Eliminar | `abmRemoveCustom()` | Solo para valores sin registros. Elimina de tabla catálogo |

### Fuente de datos unificada

`getAllValuesForField(field)` combina:
- Valores presentes en los datos históricos (`allData`)
- Valores de las tablas catálogo (`dbCentros`, `dbMetodos`)

Esto garantiza que se muestren centros/métodos recién creados aunque no tengan gastos asociados.

---

## 7. Configuración

| Elemento | Descripción |
|----------|-------------|
| Cuenta | Email del usuario + botón "Salir" (con confirmación) |
| Recargar | Ejecuta `cargarDatos()` manualmente |
| Exportar CSV | Descarga completa de todos los registros |
| Versión | Badge visual `APP_VERSION` (2.5.2) |
| Modo oscuro | Toggle switch con estado persistido |
| Instrucciones iOS | Guía para instalar PWA en iPhone vía Safari |
| ABM Centros | Panel de gestión de centros de gasto |
| ABM Métodos | Panel de gestión de métodos de pago |
