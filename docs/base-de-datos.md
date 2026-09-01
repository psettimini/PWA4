# Base de Datos

[← Volver al índice](README.md)

---

## Proveedor

**Supabase** (PostgreSQL gestionado + Auth + Row Level Security)  
URL: `https://vljwkvtivthwwerqxisc.supabase.co`

---

## Esquema de Tablas

### `profiles`

Creada automáticamente por trigger al registrar un usuario.

| Columna | Tipo | PK/FK | Descripción |
|---------|------|-------|-------------|
| `id` | `uuid` | PK, FK → `auth.users.id` | ID del usuario |
| `email` | `text` | — | Email del usuario |
| `display_name` | `text` | — | Nombre visible |
| `plan` | `text` | — | `trial` / `active` / `expired` / `cancelled`. Default `'trial'` |
| `trial_ends_at` | `timestamptz` | — | Default `now() + 14 días` |
| `subscription_id` | `text` | — | ID de la suscripción externa |
| `role` | `text` | — | `owner` o `viewer`. Default `'owner'` |
| `viewer_of` | `uuid` | FK → `auth.users.id` | Si es `viewer`, de qué owner ve los datos |
| `created_at` | `timestamptz` | — | Fecha de creación |

---

### `gastos`

Tabla principal de registros de gastos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | `uuid` | No | PK, auto-generado |
| `user_id` | `uuid` | No | FK → `auth.users.id` |
| `fecha` | `date` | No | Fecha del gasto |
| `centro` | `text` | No | Centro de gasto (categoría) |
| `tipo` | `text` | No | `"F"` (Fijo) o `"V"` (Variable) |
| `concepto` | `text` | No | Descripción del gasto |
| `metodo` | `text` | No | Método de pago utilizado |
| `importe` | `numeric` | No | Monto (admite negativos para devoluciones) |
| `moneda` | `text` | No | `"ARS"` (pesos) o `"USD"` (dólares). Default `'ARS'`. CHECK constraint. |
| `created_at` | `timestamptz` | No | Timestamp de creación |

**Notas:**
- El importe acepta valores negativos para representar devoluciones. Estos se muestran en rojo con signo menos en la UI.
- El campo `tipo` solo admite dos valores: `"F"` para gastos fijos y `"V"` para gastos variables.
- El campo `moneda` solo admite `"ARS"` o `"USD"`. **Pesos y dólares no se mezclan** en agregaciones: KPIs y gráficos los muestran por separado.
- Todo INSERT requiere `user_id` explícito para satisfacer las políticas RLS.

---

### `centros`

Catálogo de centros de gasto por usuario.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | `uuid` | No | PK, auto-generado |
| `user_id` | `uuid` | No | FK → `auth.users.id` |
| `nombre` | `text` | No | Nombre del centro de gasto |
| `created_at` | `timestamptz` | No | Timestamp de creación |

---

### `metodos_pago`

Catálogo de métodos de pago por usuario.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | `uuid` | No | PK, auto-generado |
| `user_id` | `uuid` | No | FK → `auth.users.id` |
| `nombre` | `text` | No | Nombre del método de pago |
| `created_at` | `timestamptz` | No | Timestamp de creación |

---

### `presupuesto_fijos`

Presupuesto de gastos fijos: una fila por ítem recurrente. Es la fuente de verdad del **costo fijo mensual** y el baseline contra el que se comparan los meses.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | `uuid` | No | PK, auto-generado |
| `user_id` | `uuid` | No | FK → `auth.users.id` (ON DELETE CASCADE) |
| `concepto` | `text` | No | Debe coincidir con `gastos.concepto` para poder cruzarlos |
| `centro` | `text` | No | Debe coincidir con `gastos.centro` |
| `moneda` | `text` | No | `"ARS"` o `"USD"`. Default `'ARS'`. CHECK constraint |
| `metodo` | `text` | Sí | Método de pago sugerido al precargar el formulario |
| `importe` | `numeric(14,2)` | No | Monto **por ocurrencia**, no mensualizado. Default `0` |
| `frecuencia` | `text` | No | `mensual`, `bimestral`, `trimestral`, `cuatrimestral`, `semestral`, `anual`. Default `'mensual'`. CHECK constraint |
| `mes_ancla` | `smallint` | Sí | 1-12. Mes en que vence un ítem no mensual |
| `dia_vencimiento` | `smallint` | Sí | 1-31 |
| `cuotas_restantes` | `smallint` | Sí | Para gastos en cuotas |
| `activo` | `boolean` | No | Default `true`. Dar de baja sin borrar historia |
| `notas` | `text` | Sí | Texto libre |
| `created_at` / `updated_at` | `timestamptz` | No | `updated_at` lo mantiene un trigger |

**Constraints e índices:**
- `UNIQUE (user_id, concepto, centro, moneda)` — la clave de un ítem es esa terna, la misma que usa la app para cruzar presupuesto contra gastos.
- Índice `(user_id, activo)`.
- Trigger `presupuesto_fijos_updated_at` → `presupuesto_fijos_touch_updated_at()`.

**Notas:**
- Todas las frecuencias son divisores de 12, por eso `mes_ancla` (1-12) alcanza para saber si un ítem vence en un mes dado: `(mes - mes_ancla) mod meses_de_frecuencia === 0`.
- El **costo fijo mensual** es `importe / meses_de_frecuencia` sumado sobre los ítems activos: un anual de $120.000 aporta $10.000 por mes.
- Un ítem no mensual **sin `mes_ancla`** cuenta para el devengado pero nunca se avisa como pendiente, porque no se puede saber cuándo vence. La UI lo señala.
- No hay FK contra `gastos`: la relación es por nombre, igual que con `centros` y `metodos_pago`.

---

## Función RPC: `bulk_rename`

Función PostgreSQL para renombrar masivamente un campo en todos los registros del usuario autenticado.

**Signatura:**
```sql
bulk_rename(p_field text, p_old_value text, p_new_value text)
→ json { count, error }
```

**Parámetros:**

| Parámetro | Tipo | Valores válidos | Descripción |
|-----------|------|-----------------|-------------|
| `p_field` | text | `'centro'`, `'metodo'` | Campo a renombrar |
| `p_old_value` | text | — | Valor actual a reemplazar |
| `p_new_value` | text | — | Nuevo valor |

**Comportamiento:**
- Actualiza todos los registros de la tabla `gastos` del usuario autenticado (`auth.uid()`) donde el campo indicado tenga el valor `p_old_value`
- Retorna la cantidad de registros afectados en `count`
- Si `p_field` no es `'centro'` ni `'metodo'`, retorna error

**Uso desde el frontend:**
```javascript
const { data, error } = await sb.rpc('bulk_rename', {
  p_field: 'centro',
  p_old_value: 'Nombre Viejo',
  p_new_value: 'Nombre Nuevo'
});
```

---

## Row Level Security (RLS)

Todas las tablas tienen RLS habilitado. El modelo tiene dos roles (`profiles.role`): el **owner**, que lee y escribe lo suyo, y el **viewer**, que solo lee los datos del owner al que apunta `profiles.viewer_of`.

Dos funciones de apoyo resuelven eso en las políticas:

| Función | Devuelve |
|---------|----------|
| `current_user_role()` | `'owner'` o `'viewer'` del usuario autenticado |
| `viewing_user_id()` | El `user_id` del owner que el viewer puede leer |

| Tabla | Operación | Política |
|-------|-----------|----------|
| `gastos`, `centros`, `metodos_pago`, `presupuesto_fijos` | SELECT | `auth.uid() = user_id OR user_id = viewing_user_id()` |
| `gastos`, `centros`, `metodos_pago`, `presupuesto_fijos` | INSERT/UPDATE/DELETE | `auth.uid() = user_id AND current_user_role() = 'owner'` |
| `profiles` | SELECT/UPDATE | `id = auth.uid()` |

**GRANTs explícitos:**  
Desde el **30-oct-2026** Supabase deja de otorgar privilegios por default a los objetos nuevos del schema `public`. Toda tabla o vista nueva debe incluir sus `GRANT` explícitos (`authenticated`, `service_role` según corresponda) o PostgREST devuelve error `42501`.

**Regla crítica de implementación:**  
Todo `INSERT` en el frontend debe incluir `user_id: currentUserId` de forma explícita. Si se omite, Supabase retorna error 403 (forbidden) porque la política de INSERT valida que `user_id` coincida con el usuario autenticado.

---

## Diagrama Entidad-Relación

```
  auth.users
      │
      │ 1
      ├──────────── profiles (1:1)
      │
      │ 1
      ├──────────── gastos (1:N)
      │
      │ 1
      ├──────────── centros (1:N)
      │
      │ 1
      ├──────────── metodos_pago (1:N)
      │
      │ 1
      └──────────── presupuesto_fijos (1:N)
```

No hay foreign keys entre `gastos` y `centros`/`metodos_pago`/`presupuesto_fijos`. La relación es por nombre (text), lo que permite flexibilidad en el ABM (renombrar y fusionar sin restricciones de FK).

---

## Notas Técnicas

- **Índices:** Se usa un índice compuesto simple (no funcional) porque `to_char()` no es IMMUTABLE en PostgreSQL.
- **Cliente Supabase:** La variable debe llamarse `sb` (no `supabase`) para evitar un error de shadowing en Safari.
- **Lock contention:** Se usa `setTimeout(() => cargarDatos(), 100)` en el auth listener en vez de llamar `cargarDatos()` directamente, para evitar `AbortError: Lock was stolen` que ocurre al competir con `getSession()`.
