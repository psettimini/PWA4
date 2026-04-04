# Seguridad

[← Volver al índice](README.md)

---

## Prevención XSS

Toda interpolación de datos del usuario en HTML dinámico pasa por funciones de escape:

| Función | Uso | Escapa |
|---------|-----|--------|
| `escapeHtml(s)` | Contenido de texto | `&`, `<`, `>`, `"`, `'` |
| `escapeAttr(s)` | Atributos HTML | Mismos que `escapeHtml` |

Estas funciones se aplican en:
- Renderizado de tablas (historial, comparar, ABM)
- Cards mobile
- Sugerencias de autocomplete
- Fijos pendientes
- Selects y datalists dinámicos
- Mensajes de modal de confirmación

---

## Prevención de CSV Injection

```javascript
const csvEscape = v => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
```

Se aplica a todos los campos al exportar CSV (historial filtrado y completo).

---

## Row Level Security (RLS)

Todas las tablas tienen RLS habilitado en Supabase. Ver [Base de Datos → RLS](base-de-datos.md#row-level-security-rls) para detalle completo.

Punto clave: **todo INSERT incluye `user_id: currentUserId`** explícitamente para satisfacer las políticas. Omitirlo causa error 403.

---

## Gestión de Sesión

- **Auth tokens:** gestionados automáticamente por el cliente Supabase JS
- **Auth listener:** `sb.auth.onAuthStateChange()` escucha cambios de sesión en tiempo real
- **Logout completo:** al cerrar sesión se limpia:
  - `allData`, `dbCentros`, `dbMetodos`, `currentUserId` (memoria)
  - `gastos_data_cache_v3` (localStorage)
  - `gastos_data_cache_meta_v3` (localStorage)
  - `gastos_pending_queue_v2` (localStorage)

---

## Protección de Contraseñas

- Mínimo 6 caracteres en registro (validación client-side)
- Passwords nunca se almacenan localmente
- Campo password soporta Enter para submit (evita double-click)
- Reset de password vía email de Supabase Auth

---

## Supabase Anon Key

La `SUPABASE_ANON_KEY` es una clave pública diseñada para ser expuesta en el frontend. Su seguridad depende de:
- RLS policies correctamente configuradas
- El usuario solo puede operar sobre sus propios datos
- No otorga acceso administrativo a la base de datos

---

## Safe Area y Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
```

- `viewport-fit=cover` + `env(safe-area-inset-*)` para iPhones con notch
- `user-scalable=no` para evitar zoom accidental en inputs
- Font-size 16px en inputs mobile para prevenir auto-zoom de Safari
