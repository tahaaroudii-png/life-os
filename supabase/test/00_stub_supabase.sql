-- Reproduit le strict minimum de l'environnement Supabase pour éprouver
-- les migrations hors ligne : le schéma auth, auth.uid(), les rôles, et
-- les anciennes tables de budget-app, pour tester la reprise de données.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- Anciennes tables de budget-app.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'task_axis') then
    create type public.task_axis as enum
      ('spiritualite','sante','personnel','famille','social','business','finances');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_type') then
    create type public.task_type as enum ('habit','oneoff','progressive');
  end if;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  axis public.task_axis not null,
  title text not null,
  type public.task_type not null default 'habit',
  active boolean not null default true,
  start_value integer, daily_increment integer,
  start_date date, scheduled_time time,
  created_at timestamptz not null default now()
);

create table if not exists public.task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  log_date date not null,
  done boolean not null default false,
  target_value integer,
  created_at timestamptz not null default now(),
  unique (user_id, task_id, log_date)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount numeric not null,
  envelope text not null,
  note text,
  occurred_at timestamptz not null default now()
);

-- Les étapes et priorités ONCF sont en français dans l'ancienne base.
create table if not exists public.modifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  equipment text,
  stage text not null default 'identifie',
  priority text not null default 'moyenne',
  due_date date,
  next_action text,
  notes text,
  created_at timestamptz not null default now()
);
