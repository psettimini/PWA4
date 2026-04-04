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
| `created_at` | `timestamptz` | No | Timestamp de creación |

**Notas:**
- El importe acepta valores negativos para representar devoluciones. Estos se muestran en rojo con signo menos en la UI.
- El campo `tipo` solo admite dos valores: `"F"` para gastos fijos y `"V"` para gastos variables.
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

Todas las tablas tienen RLS habilitado. Las políticas aseguran aislamiento total entre usuarios.

| Tabla | Operación | Política |
|-------|-----------|----------|
| `gastos` | SELECT | `user_id = auth.uid()` |
| `gastos` | INSERT | `user_id = auth.uid()` |
| `gastos` | UPDATE | `user_id = auth.uid()` |
| `gastos` | DELETE | `user_id = auth.uid()` |
| `centros` | SELECT/INSERT/UPDATE/DELETE | `user_id = auth.uid()` |
| `metodos_pago` | SELECT/INSERT/UPDATE/DELETE | `user_id = auth.uid()` |
| `profiles` | SELECT/UPDATE | `id = auth.uid()` |

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
      └──────────── metodos_pago (1:N)
```

No hay foreign keys entre `gastos` y `centros`/`metodos_pago`. La relación es por nombre (text), lo que permite flexibilidad en el ABM (renombrar y fusionar sin restricciones de FK).

---

## Notas Técnicas

- **Índices:** Se usa un índice compuesto simple (no funcional) porque `to_char()` no es IMMUTABLE en PostgreSQL.
- **Cliente Supabase:** La variable debe llamarse `sb` (no `supabase`) para evitar un error de shadowing en Safari.
- **Lock contention:** Se usa `setTimeout(() => cargarDatos(), 100)` en el auth listener en vez de llamar `cargarDatos()` directamente, para evitar `AbortError: Lock was stolen` que ocurre al competir con `getSession()`.
