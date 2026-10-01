-- =====================================================================
-- Hogar compartido, libros, ingresos, aprobación y pases (v3.0.0)
--
-- Modelo:
--   hogar ─┬─ miembros (usuarios que ven todo el hogar, con alias y color del pill)
--          └─ libros   (de quién es el movimiento: Pablo, Raquel, Consultorio)
--   gastos / ingresos:
--     user_id  = quién lo cargó/pagó → pill
--     libro_id = a qué libro pertenece (NULL = usuario sin hogar, modelo viejo)
--     estado   = aprobado | pendiente | rechazado
--   Pase: un gasto del libro origen con pase_libro_id = libro destino.
--     Del lado destino se crea un movimiento pendiente con pase_origen_id
--     apuntando al gasto origen (ingreso = aporte, gasto = pago por cuenta).
--
-- Usuarios sin hogar (Ricardo, Marianne, etc.) siguen funcionando igual:
-- libro_id NULL y las políticas viejas por user_id.
-- =====================================================================

-- ── Tablas nuevas ────────────────────────────────────────────────────
create table public.hogares (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  created_at timestamptz not null default now()
);

create table public.hogar_miembros (
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  alias      text not null,
  color      text not null default '#64748b',
  created_at timestamptz not null default now(),
  primary key (hogar_id, user_id)
);

create table public.libros (
  id         uuid primary key default gen_random_uuid(),
  hogar_id   uuid not null references public.hogares(id) on delete cascade,
  nombre     text not null,
  tipo       text not null default 'personal' check (tipo in ('personal', 'negocio')),
  titular_id uuid not null references auth.users(id),
  orden      smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (hogar_id, nombre)
);

-- ── Helpers para RLS (security definer: evitan recursión en políticas) ─
create or replace function public.mis_hogares()
returns setof uuid language sql stable security definer set search_path = public as $$
  select hogar_id from public.hogar_miembros where user_id = auth.uid()
$$;

create or replace function public.libro_visible(p_libro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.libros l
    join public.hogar_miembros m on m.hogar_id = l.hogar_id
    where l.id = p_libro and m.user_id = auth.uid()
  )
$$;

create or replace function public.es_titular(p_libro uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.libros where id = p_libro and titular_id = auth.uid())
$$;

-- ── gastos: columnas nuevas ──────────────────────────────────────────
alter table public.gastos
  add column libro_id       uuid references public.libros(id),
  add column estado         text not null default 'aprobado'
                            check (estado in ('aprobado', 'pendiente', 'rechazado')),
  add column pase_libro_id  uuid references public.libros(id),
  add column pase_origen_id uuid references public.gastos(id) on delete set null,
  add column nota_revision  text;

create index gastos_libro_fecha_idx on public.gastos (libro_id, fecha desc);
create index gastos_pase_origen_idx on public.gastos (pase_origen_id) where pase_origen_id is not null;

-- ── ingresos ─────────────────────────────────────────────────────────
create table public.ingresos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  libro_id       uuid not null references public.libros(id),
  fecha          date not null,
  centro         text not null,
  concepto       text not null,
  metodo         text,
  importe        numeric(14,2) not null,
  moneda         text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  estado         text not null default 'aprobado'
                 check (estado in ('aprobado', 'pendiente', 'rechazado')),
  pase_origen_id uuid references public.gastos(id) on delete set null,
  nota_revision  text,
  created_at     timestamptz not null default now()
);

create index ingresos_libro_fecha_idx on public.ingresos (libro_id, fecha desc);
create index ingresos_pase_origen_idx on public.ingresos (pase_origen_id) where pase_origen_id is not null;

-- ── Guardas que RLS no puede expresar (comparan OLD vs NEW) ──────────
create or replace function public.movimiento_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar quién cargó el movimiento';
  end if;
  -- Solo el titular del libro aprueba o rechaza.
  if new.estado is distinct from old.estado and new.libro_id is not null
     and not public.es_titular(new.libro_id) then
    raise exception 'Solo el titular del libro puede aprobar o rechazar';
  end if;
  return new;
end $$;

-- Si la app no manda libro_id, el gasto va al libro personal de quien lo carga
-- (mantiene funcionando el frontend actual y los usuarios sin hogar quedan en NULL).
create or replace function public.gastos_libro_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.libro_id is null then
    select id into new.libro_id from public.libros
    where titular_id = new.user_id and tipo = 'personal'
    order by orden limit 1;
  end if;
  return new;
end $$;

create trigger gastos_libro_default before insert on public.gastos
  for each row execute function public.gastos_libro_default();

create trigger gastos_guard   before update on public.gastos   for each row execute function public.movimiento_guard();
create trigger ingresos_guard before update on public.ingresos for each row execute function public.movimiento_guard();

-- ── RLS: gastos (reemplaza las políticas por user_id) ────────────────
-- Lectura: lo propio, el owner que ve un viewer (modelo viejo), o cualquier libro del hogar.
-- Escritura: en un libro propio libremente; en el libro de otro miembro solo como pendiente.
-- Aprobar/editar después: el titular del libro, o quien cargó mientras siga pendiente.
drop policy "Read gastos own or viewed"  on public.gastos;
drop policy "Insert gastos owner only"   on public.gastos;
drop policy "Update gastos owner only"   on public.gastos;
drop policy "Delete gastos owner only"   on public.gastos;

create policy "gastos select" on public.gastos for select to authenticated using (
  auth.uid() = user_id or user_id = public.viewing_user_id()
  or (libro_id is not null and public.libro_visible(libro_id))
);
create policy "gastos insert" on public.gastos for insert to authenticated with check (
  auth.uid() = user_id and public.current_user_role() = 'owner'
  and (libro_id is null or public.es_titular(libro_id)
       or (estado = 'pendiente' and public.libro_visible(libro_id)))
);
create policy "gastos update" on public.gastos for update to authenticated
  using (
    (libro_id is null and auth.uid() = user_id and public.current_user_role() = 'owner')
    or (libro_id is not null and (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente')))
  )
  with check (
    (libro_id is null and auth.uid() = user_id and public.current_user_role() = 'owner')
    or (libro_id is not null and (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente')))
  );
create policy "gastos delete" on public.gastos for delete to authenticated using (
  (libro_id is null and auth.uid() = user_id and public.current_user_role() = 'owner')
  or (libro_id is not null and (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente')))
);

-- ── RLS: ingresos ────────────────────────────────────────────────────
alter table public.ingresos enable row level security;

create policy "ingresos select" on public.ingresos for select to authenticated
  using (public.libro_visible(libro_id));
create policy "ingresos insert" on public.ingresos for insert to authenticated with check (
  auth.uid() = user_id
  and (public.es_titular(libro_id) or (estado = 'pendiente' and public.libro_visible(libro_id)))
);
create policy "ingresos update" on public.ingresos for update to authenticated
  using      (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente'))
  with check (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente'));
create policy "ingresos delete" on public.ingresos for delete to authenticated
  using (public.es_titular(libro_id) or (auth.uid() = user_id and estado = 'pendiente'));

-- ── RLS: hogar (solo lectura desde la app; se administra por SQL) ────
alter table public.hogares        enable row level security;
alter table public.hogar_miembros enable row level security;
alter table public.libros         enable row level security;

create policy "hogares select" on public.hogares for select to authenticated
  using (id in (select public.mis_hogares()));
create policy "hogar_miembros select" on public.hogar_miembros for select to authenticated
  using (hogar_id in (select public.mis_hogares()));
create policy "libros select" on public.libros for select to authenticated
  using (hogar_id in (select public.mis_hogares()));

-- ── GRANTs explícitos (Supabase deja de darlos por default el 30-oct-2026) ─
grant select                         on public.hogares, public.hogar_miembros, public.libros to authenticated;
grant select, insert, update, delete on public.ingresos                                  to authenticated;
grant all                            on public.hogares, public.hogar_miembros, public.libros, public.ingresos to service_role;
grant execute on function public.mis_hogares(), public.libro_visible(uuid), public.es_titular(uuid) to authenticated;

-- ── Datos: hogar Settimini ───────────────────────────────────────────
do $$
declare
  v_pablo  uuid := (select id from auth.users where email = 'pablo@settimini.net');
  v_raquel uuid := (select id from auth.users where email = 'raquel@settimini.net');
  v_hogar  uuid;
  v_libro_pablo uuid;
begin
  if v_pablo is null or v_raquel is null then
    raise exception 'Faltan los usuarios de Pablo o Raquel';
  end if;

  insert into public.hogares (nombre) values ('Settimini') returning id into v_hogar;

  insert into public.hogar_miembros (hogar_id, user_id, alias, color) values
    (v_hogar, v_pablo,  'Pablo',  '#2563eb'),
    (v_hogar, v_raquel, 'Raquel', '#db2777');

  insert into public.libros (hogar_id, nombre, tipo, titular_id, orden) values
    (v_hogar, 'Pablo',       'personal', v_pablo,  1),
    (v_hogar, 'Raquel',      'personal', v_raquel, 2),
    (v_hogar, 'Consultorio', 'negocio',  v_raquel, 3);

  select id into v_libro_pablo from public.libros where hogar_id = v_hogar and nombre = 'Pablo';

  -- Todo lo histórico de Pablo pasa a su libro, aprobado.
  update public.gastos set libro_id = v_libro_pablo where user_id = v_pablo;

  -- Raquel deja de ser viewer: ahora es owner de sus libros y ve el hogar por membresía.
  update public.profiles set role = 'owner', viewer_of = null where id = v_raquel;
end $$;

-- ── Corrección (migración hogar_titular_pablo_blitos) ────────────────
-- Los gastos de Pablo viven en la cuenta blitos@me.com, no en pablo@settimini.net.
do $$
declare
  v_viejo uuid := (select id from auth.users where email = 'pablo@settimini.net');
  v_pablo uuid := (select id from auth.users where email = 'blitos@me.com');
  v_libro uuid;
begin
  update public.hogar_miembros set user_id = v_pablo where user_id = v_viejo;
  update public.libros set titular_id = v_pablo where titular_id = v_viejo returning id into v_libro;
  update public.gastos set libro_id = v_libro where user_id = v_pablo and libro_id is null;
end $$;
