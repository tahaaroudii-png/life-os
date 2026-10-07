-- =====================================================================
-- Life OS — Lot 1 · Migration 2/4 : objectifs et liaisons
--
-- Les sept objectifs 2026 cessent d'être du code (`buildSeed()`) pour
-- devenir des lignes. Conséquence directe : en ajouter un en 2027 ne
-- demande aucun redéploiement, et aucune fonction de migration de forme.
--
-- La liaison tâche → objectif cesse d'être une expression régulière sur
-- le titre pour devenir une ligne de `goal_task_links`. Renommer une
-- tâche n'a plus aucun effet sur une progression.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. goals
--
-- `kind` décide du moteur de calcul :
--   habit      : une cible par jour, on compte les jours atteints
--   cumulative : on somme les valeurs jusqu'à `target_total` (hizb)
--   metric     : la valeur vient d'un calcul externe (binding)
--   milestone  : pas de nombre, un état et des jalons
-- ---------------------------------------------------------------------
create table if not exists life.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug          text not null,
  label         text not null,
  label_ar      text,
  subtitle      text,
  domain        text not null default 'personal',
  kind          text not null,
  unit          text,
  target_total  numeric,
  daily_target  numeric,
  daily_max     numeric,
  starts_on     date not null default date_trunc('year', now())::date,
  deadline      date not null,
  is_private    boolean not null default false,
  state         text not null default 'in_progress',
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, slug),
  constraint goals_kind_chk   check (kind in ('habit', 'cumulative', 'metric', 'milestone')),
  constraint goals_state_chk  check (state in ('in_progress', 'done', 'abandoned', 'renegotiated')),
  constraint goals_domain_chk check (domain in ('spiritual', 'body', 'business', 'personal', 'work')),
  constraint goals_window_chk check (deadline > starts_on),
  -- Un cumulatif sans total visé ne peut pas être projeté.
  constraint goals_cumulative_chk check (kind <> 'cumulative' or target_total is not null)
);

create index if not exists goals_user_idx on life.goals (user_id, position);

drop trigger if exists trg_goals_updated_at on life.goals;
create trigger trg_goals_updated_at before update on life.goals
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('goals');
select life.add_to_realtime('goals');

-- ---------------------------------------------------------------------
-- 2. goal_milestones — les jalons trimestriels
--
-- Sans eux, un objectif annuel ne se corrige qu'en décembre.
-- ---------------------------------------------------------------------
create table if not exists life.goal_milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id      uuid not null references life.goals(id) on delete cascade,
  label        text not null,
  due_on       date not null,
  target_value numeric,
  reached_on   date,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists goal_milestones_goal_idx on life.goal_milestones (goal_id, due_on);

select life.apply_owner_rls('goal_milestones');

-- ---------------------------------------------------------------------
-- 3. goal_task_links — ce qui alimente quoi
--
-- `contribution` dit ce qu'une tâche cochée apporte ce jour-là :
--   full       une seule tâche liée cochée suffit à valider la journée
--   fractional la journée ne compte que si TOUTES les liées sont cochées
--   increment  chaque tâche ajoute sa valeur, plafonnée par goals.daily_max
--   minutes    les minutes de l'axe alimentent une cible de temps
-- ---------------------------------------------------------------------
create table if not exists life.goal_task_links (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id      uuid not null references life.goals(id) on delete cascade,
  task_id      uuid not null references life.tasks(id) on delete cascade,
  contribution text not null default 'full',
  weight       numeric not null default 1,
  created_at   timestamptz not null default now(),
  primary key (goal_id, task_id),
  constraint gtl_contribution_chk check (contribution in ('full', 'fractional', 'increment', 'minutes'))
);

create index if not exists gtl_task_idx on life.goal_task_links (task_id);
create index if not exists gtl_user_idx on life.goal_task_links (user_id);

select life.apply_owner_rls('goal_task_links');
select life.add_to_realtime('goal_task_links');

-- ---------------------------------------------------------------------
-- 4. goal_metric_bindings — branchement d'un objectif sur un calcul nommé
--
-- Le lot 1 ne déclare aucune source : les sources business arrivent au
-- lot 3. La table existe pour que les objectifs métriques puissent être
-- amorcés dès maintenant sans valeur, et affichés comme « en attente ».
-- ---------------------------------------------------------------------
create table if not exists life.goal_metric_bindings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid primary key references life.goals(id) on delete cascade,
  source  text not null,
  params  jsonb not null default '{}'::jsonb
);

select life.apply_owner_rls('goal_metric_bindings');

-- ---------------------------------------------------------------------
-- 5. goal_gates — les verrous
-- ---------------------------------------------------------------------
create table if not exists life.goal_gates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id      uuid not null references life.goals(id) on delete cascade,
  label        text not null,
  check_key    text,
  is_manual    boolean not null default true,
  manual_state boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists goal_gates_goal_idx on life.goal_gates (goal_id, position);

select life.apply_owner_rls('goal_gates');

-- ---------------------------------------------------------------------
-- 6. goal_history — journal daté par objectif
-- ---------------------------------------------------------------------
create table if not exists life.goal_history (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id      uuid not null references life.goals(id) on delete cascade,
  happened_on  date not null default current_date,
  note         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists goal_history_goal_idx on life.goal_history (goal_id, happened_on desc);

select life.apply_owner_rls('goal_history');
