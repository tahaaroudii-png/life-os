-- Module MODIFICATIONS ONCF : suivi de modifications techniques par étapes.
--
-- Additive et idempotente : ne touche à AUCUNE table existante (transactions,
-- settings, tasks, task_logs) et peut être rejouée sans erreur.

-- ============================================================
-- 1. Types énumérés
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'modif_stage') then
    create type public.modif_stage as enum (
      'identifie',
      'etude',
      'dossier_redige',
      'validation',
      'prototype',
      'deploiement_serie',
      'cloture'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'modif_priority') then
    create type public.modif_priority as enum ('haute', 'moyenne', 'basse');
  end if;
end$$;

-- ============================================================
-- 2. Table modifications
-- ============================================================
create table if not exists public.modifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null,
  equipment   text,
  stage       public.modif_stage not null default 'identifie',
  priority    public.modif_priority not null default 'moyenne',
  due_date    date,
  next_action text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists modifications_user_stage_idx    on public.modifications (user_id, stage);
create index if not exists modifications_user_priority_idx on public.modifications (user_id, priority);
create index if not exists modifications_user_due_idx      on public.modifications (user_id, due_date);

alter table public.modifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modifications' and policyname='modifications_select_own') then
    create policy modifications_select_own on public.modifications for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modifications' and policyname='modifications_insert_own') then
    create policy modifications_insert_own on public.modifications for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modifications' and policyname='modifications_update_own') then
    create policy modifications_update_own on public.modifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modifications' and policyname='modifications_delete_own') then
    create policy modifications_delete_own on public.modifications for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 3. Table modification_history
-- ============================================================
create table if not exists public.modification_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modification_id uuid not null references public.modifications(id) on delete cascade,
  from_stage      public.modif_stage,  -- null à la création
  to_stage        public.modif_stage not null,
  changed_at      timestamptz not null default now()
);

create index if not exists modification_history_modif_idx on public.modification_history (modification_id, changed_at);
create index if not exists modification_history_user_idx  on public.modification_history (user_id, changed_at desc);

alter table public.modification_history enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modification_history' and policyname='modification_history_select_own') then
    create policy modification_history_select_own on public.modification_history for select using (auth.uid() = user_id);
  end if;
  -- Insertion contrôlée : uniquement via le trigger (le user peut aussi insérer
  -- lui-même, mais ça n'a aucun intérêt fonctionnel — on autorise pour rester
  -- souple).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='modification_history' and policyname='modification_history_insert_own') then
    create policy modification_history_insert_own on public.modification_history for insert with check (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 4. Trigger auto-updated_at
-- ============================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_modifications_updated_at on public.modifications;
create trigger trg_modifications_updated_at
  before update on public.modifications
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- 5. Trigger auto-historique sur changement d'étape
-- ============================================================
-- SECURITY DEFINER : le trigger doit pouvoir écrire dans modification_history
-- même si un jour une politique restreint l'insert direct — mais on garde
-- `search_path = public` pour éviter les injections classiques.
create or replace function public.tg_log_modif_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.modification_history (user_id, modification_id, from_stage, to_stage)
    values (new.user_id, new.id, null, new.stage);
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.stage is distinct from new.stage) then
    insert into public.modification_history (user_id, modification_id, from_stage, to_stage)
    values (new.user_id, new.id, old.stage, new.stage);
    return new;
  end if;
  return new;
end$$;

drop trigger if exists trg_modifications_stage_history_ins on public.modifications;
create trigger trg_modifications_stage_history_ins
  after insert on public.modifications
  for each row execute function public.tg_log_modif_stage_change();

drop trigger if exists trg_modifications_stage_history_upd on public.modifications;
create trigger trg_modifications_stage_history_upd
  after update of stage on public.modifications
  for each row execute function public.tg_log_modif_stage_change();

-- ============================================================
-- 6. Realtime
-- ============================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='modifications'
    ) then
      execute 'alter publication supabase_realtime add table public.modifications';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='modification_history'
    ) then
      execute 'alter publication supabase_realtime add table public.modification_history';
    end if;
  end if;
end$$;
