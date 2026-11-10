-- =====================================================================
-- Expensas del consorcio (v3.3.0)
--
-- Una fila por boleta: unidad funcional (UF) + período. Los conceptos se
-- guardan tal como vienen en la boleta (jsonb), con su motivo y, para luz y
-- agua, las lecturas del medidor:
--   [{ "concepto": "CONSUMO KW", "motivo": null, "importe": 768743.39,
--      "lectura": { "ant": 119874, "act": 122117, "consumo": 2243 } }, …]
-- La app clasifica los conceptos (ordinarias, extraordinarias, luz, agua…)
-- al mostrarlos, así una boleta con un concepto nuevo no rompe nada.
--
-- Subir de nuevo la misma boleta la reemplaza (unique user_id+uf+periodo).
-- Lectura: quien la cargó y los miembros de su hogar. Escritura: solo quien
-- la cargó.
-- =====================================================================

create table public.expensas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  uf             text not null,
  periodo        date not null check (extract(day from periodo) = 1),
  vencimiento    date,
  saldo_anterior numeric not null default 0,
  total          numeric not null,
  conceptos      jsonb not null check (jsonb_typeof(conceptos) = 'array'),
  archivo        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, uf, periodo)
);

create index expensas_periodo_idx on public.expensas (periodo);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.expensas enable row level security;

create policy "expensas select" on public.expensas for select to authenticated using (
  auth.uid() = user_id
  or user_id in (select m.user_id from public.hogar_miembros m
                 where m.hogar_id in (select public.mis_hogares()))
);
create policy "expensas insert" on public.expensas for insert to authenticated
  with check (auth.uid() = user_id);
create policy "expensas update" on public.expensas for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expensas delete" on public.expensas for delete to authenticated
  using (auth.uid() = user_id);

-- ── GRANTs explícitos (Supabase deja de darlos por default el 30-oct-2026) ─
grant select, insert, update, delete on public.expensas to authenticated;
grant all                            on public.expensas to service_role;
