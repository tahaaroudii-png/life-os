-- Module PLANNING : tâches quotidiennes par axe + logs journaliers.
--
-- Cette migration est additive : elle ne touche à AUCUNE table existante
-- (transactions, settings, auth) et ne casse rien du module budget.
--
-- Idempotente : peut être ré-exécutée sans erreur.

-- ============================================================
-- 1. Types énumérés
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_axis') then
    create type public.task_axis as enum (
      'spiritualite',
      'sante',
      'personnel',
      'famille',
      'social',
      'business',
      'finances'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type public.task_type as enum ('habit', 'oneoff', 'progressive');
  end if;
end$$;

-- ============================================================
-- 2. Table tasks
-- ============================================================
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  axis             public.task_axis not null,
  title            text not null,
  type             public.task_type not null default 'habit',
  active           boolean not null default true,
  start_value      integer,
  daily_increment  integer,
  start_date       date,
  scheduled_time   time,                                        -- heure prévue (optionnelle)
  created_at       timestamptz not null default now()
);

-- Rattrapage idempotent pour les projets qui ont créé `tasks` avant l'ajout de scheduled_time.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tasks' and column_name = 'scheduled_time'
  ) then
    alter table public.tasks add column scheduled_time time;
  end if;
end$$;

create index if not exists tasks_user_active_idx on public.tasks (user_id, active);
create index if not exists tasks_user_type_idx   on public.tasks (user_id, type);

alter table public.tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_select_own') then
    create policy tasks_select_own on public.tasks
      for select using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_insert_own') then
    create policy tasks_insert_own on public.tasks
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_update_own') then
    create policy tasks_update_own on public.tasks
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'tasks_delete_own') then
    create policy tasks_delete_own on public.tasks
      for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 3. Table task_logs
-- ============================================================
create table if not exists public.task_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id       uuid not null references public.tasks(id) on delete cascade,
  log_date      date not null,
  done          boolean not null default false,
  target_value  integer,
  created_at    timestamptz not null default now(),
  unique (user_id, task_id, log_date)
);

create index if not exists task_logs_user_date_idx on public.task_logs (user_id, log_date);
create index if not exists task_logs_task_date_idx on public.task_logs (task_id, log_date);

alter table public.task_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_logs' and policyname = 'task_logs_select_own') then
    create policy task_logs_select_own on public.task_logs
      for select using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_logs' and policyname = 'task_logs_insert_own') then
    create policy task_logs_insert_own on public.task_logs
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_logs' and policyname = 'task_logs_update_own') then
    create policy task_logs_update_own on public.task_logs
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_logs' and policyname = 'task_logs_delete_own') then
    create policy task_logs_delete_own on public.task_logs
      for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 4. Realtime
-- ============================================================
-- On ajoute les deux tables à la publication `supabase_realtime`.
-- Non bloquant côté app : si Realtime tombe, l'app continue de fonctionner
-- via React Query (fetch + refetch manuel).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
    ) then
      execute 'alter publication supabase_realtime add table public.tasks';
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_logs'
    ) then
      execute 'alter publication supabase_realtime add table public.task_logs';
    end if;
  end if;
end$$;
