-- =====================================================================
-- Life OS — Lot 1 · Migration 1/4 : noyau
--
-- Axes de vie, tâches, journal des tâches, état du jour, temps par axe.
-- Idempotente : peut être rejouée sans erreur.
--
-- POURQUOI UN SCHÉMA DÉDIÉ `life` ET PAS `public` :
-- l'ancienne app occupe déjà public.tasks et public.task_logs avec un
-- schéma différent (pas de cadence, pas de statuts). Les deux doivent
-- cohabiter le temps de la bascule, et `create table if not exists` sur
-- une table existante ne ferait rien — on se retrouverait avec l'ancien
-- schéma et des erreurs silencieuses. Le schéma `life` règle ça, et rend
-- la reprise des données triviale : un insert ... select depuis public.
--
-- À FAIRE UNE FOIS DANS SUPABASE : Settings → API → Exposed schemas,
-- ajouter `life`. Sans ça, PostgREST ne verra aucune de ces tables.
--
-- Trois règles tenues partout dans ce fichier :
--   1. toute ligne porte une date ou un horodatage, jamais de "non daté" ;
--   2. aucune colonne ne stocke un calcul dérivé ;
--   3. RLS active sur chaque table, quatre politiques, auth.uid() = user_id.
-- =====================================================================

create extension if not exists pgcrypto;

create schema if not exists life;

grant usage on schema life to authenticated, service_role;
alter default privileges in schema life
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema life
  grant all on tables to service_role;


-- Horodatage de mise à jour, réutilisé par toutes les tables qui en ont une.
create or replace function life.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

-- Applique les 4 politiques RLS standard à une table.
-- Évite 120 lignes de `do $$ ... $$` répétées dans les migrations suivantes.
create or replace function life.apply_owner_rls(tbl text)
returns void language plpgsql as $$
declare
  p text;
begin
  execute format('alter table life.%I enable row level security', tbl);
  foreach p in array array['select', 'insert', 'update', 'delete'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'life' and tablename = tbl
        and policyname = format('%s_%s_own', tbl, p)
    ) then
      if p = 'insert' then
        execute format(
          'create policy %I on life.%I for insert with check (auth.uid() = user_id)',
          format('%s_insert_own', tbl), tbl);
      elsif p = 'update' then
        execute format(
          'create policy %I on life.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
          format('%s_update_own', tbl), tbl);
      else
        execute format(
          'create policy %I on life.%I for %s using (auth.uid() = user_id)',
          format('%s_%s_own', tbl, p), tbl, p);
      end if;
    end if;
  end loop;
end$$;

-- Ajoute une table à la publication Realtime, sans échouer si elle n'existe pas.
create or replace function life.add_to_realtime(tbl text)
returns void language plpgsql as $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'life' and tablename = tbl
     ) then
    execute format('alter publication supabase_realtime add table life.%I', tbl);
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 1. axes — les 7 axes de vie, modifiables sans migration
-- ---------------------------------------------------------------------
create table if not exists life.axes (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  label      text not null,
  label_ar   text,
  icon       text,
  color      text not null default '#64748b',
  position   integer not null default 0,
  weekly_target_minutes integer,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

select life.apply_owner_rls('axes');

-- ---------------------------------------------------------------------
-- 2. tasks — habitudes, ponctuelles, progressives
--
-- `cadence` remplace l'hypothèse « tout est quotidien » de l'ancienne app.
-- Formes acceptées (validées par le CHECK ci-dessous) :
--   {"type":"daily"}
--   {"type":"weekly","times":4}
--   {"type":"weekdays","days":[1,2,3,4,5]}   -- 1 = lundi … 7 = dimanche
--   {"type":"monthly","day":1}
--   {"type":"once"}                           -- ponctuelle
-- ---------------------------------------------------------------------
create table if not exists life.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  axis_key        text not null,
  title           text not null,
  title_ar        text,
  kind            text not null default 'habit',
  cadence         jsonb not null default '{"type":"daily"}'::jsonb,
  scheduled_time  time,
  duration_minutes integer,
  start_value     numeric,
  daily_increment numeric,
  start_date      date,
  end_date        date,
  active          boolean not null default true,
  archived_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (user_id, axis_key) references life.axes(user_id, key) on delete restrict,
  constraint tasks_kind_chk check (kind in ('habit', 'oneoff', 'progressive', 'project_step')),
  constraint tasks_cadence_chk check (
    cadence ? 'type'
    and cadence->>'type' in ('daily', 'weekly', 'weekdays', 'monthly', 'once')
    and (cadence->>'type' <> 'weekly'   or (cadence->>'times')::int between 1 and 7)
    and (cadence->>'type' <> 'weekdays' or jsonb_typeof(cadence->'days') = 'array')
    and (cadence->>'type' <> 'monthly'  or (cadence->>'day')::int between 1 and 28)
  ),
  -- Une progressive n'a de sens qu'avec ses trois paramètres.
  constraint tasks_progressive_chk check (
    kind <> 'progressive'
    or (start_value is not null and daily_increment is not null and start_date is not null)
  )
);

create index if not exists tasks_user_active_idx on life.tasks (user_id, active);
create index if not exists tasks_user_axis_idx   on life.tasks (user_id, axis_key);

drop trigger if exists trg_tasks_updated_at on life.tasks;
create trigger trg_tasks_updated_at before update on life.tasks
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('tasks');
select life.add_to_realtime('tasks');

-- ---------------------------------------------------------------------
-- 3. task_logs — une ligne par (tâche, jour)
--
-- `status` remplace le booléen `done` : il distingue le raté du sauté,
-- ce qui est la condition pour qu'un streak veuille dire quelque chose.
--   pending   : occurrence posée, pas encore tranchée
--   done      : faite
--   missed    : pas faite — casse la série
--   skipped   : sautée volontairement — ne casse pas, n'avance pas
--   postponed : reportée à une autre date (la nouvelle ligne porte celle-ci)
-- ---------------------------------------------------------------------
create table if not exists life.task_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id       uuid not null references life.tasks(id) on delete cascade,
  log_date      date not null,
  status        text not null default 'pending',
  value         numeric,
  target_value  numeric,
  minutes       integer,
  skip_reason   text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, task_id, log_date),
  constraint task_logs_status_chk check (status in ('pending', 'done', 'missed', 'skipped', 'postponed'))
);

create index if not exists task_logs_user_date_idx on life.task_logs (user_id, log_date);
create index if not exists task_logs_task_date_idx on life.task_logs (task_id, log_date desc);
create index if not exists task_logs_done_idx      on life.task_logs (user_id, task_id, log_date desc)
  where status = 'done';

drop trigger if exists trg_task_logs_updated_at on life.task_logs;
create trigger trg_task_logs_updated_at before update on life.task_logs
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('task_logs');
select life.add_to_realtime('task_logs');

-- ---------------------------------------------------------------------
-- 4. day_states — une ligne par jour : énergie, humeur, clôture du soir
--
-- `closed_at` non nul = la journée a été arbitrée. C'est ce qui permet
-- à la fermeture automatique de minuit de savoir ce qu'il lui reste à faire.
-- ---------------------------------------------------------------------
create table if not exists life.day_states (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  energy      smallint,
  mood        smallint,
  sleep_hours numeric(3,1),
  note        text,
  miss_reason text,
  closed_at   timestamptz,
  auto_closed boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day),
  constraint day_states_energy_chk check (energy is null or energy between 1 and 5),
  constraint day_states_mood_chk   check (mood   is null or mood   between 1 and 5)
);

drop trigger if exists trg_day_states_updated_at on life.day_states;
create trigger trg_day_states_updated_at before update on life.day_states
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('day_states');
select life.add_to_realtime('day_states');

-- ---------------------------------------------------------------------
-- 5. axis_minutes — temps estimé par axe et par jour, en quarts d'heure
-- ---------------------------------------------------------------------
create table if not exists life.axis_minutes (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  axis_key   text not null,
  minutes    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, axis_key),
  foreign key (user_id, axis_key) references life.axes(user_id, key) on delete cascade,
  constraint axis_minutes_chk check (minutes >= 0 and minutes <= 1440)
);

drop trigger if exists trg_axis_minutes_updated_at on life.axis_minutes;
create trigger trg_axis_minutes_updated_at before update on life.axis_minutes
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('axis_minutes');
select life.add_to_realtime('axis_minutes');
