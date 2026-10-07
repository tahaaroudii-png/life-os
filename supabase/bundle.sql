-- 0001_core.sql
create extension if not exists pgcrypto;

create schema if not exists life;

grant usage on schema life to authenticated, service_role;
alter default privileges in schema life
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema life
  grant all on tables to service_role;

create or replace function life.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

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

-- 0002_goals.sql
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
  constraint goals_cumulative_chk check (kind <> 'cumulative' or target_total is not null)
);

create index if not exists goals_user_idx on life.goals (user_id, position);

drop trigger if exists trg_goals_updated_at on life.goals;
create trigger trg_goals_updated_at before update on life.goals
  for each row execute function life.tg_set_updated_at();

select life.apply_owner_rls('goals');
select life.add_to_realtime('goals');

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

create table if not exists life.goal_metric_bindings (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid primary key references life.goals(id) on delete cascade,
  source  text not null,
  params  jsonb not null default '{}'::jsonb
);

select life.apply_owner_rls('goal_metric_bindings');

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

-- 0003_views.sql
create or replace function life.f_day_expected(cadence jsonb, d date)
returns boolean language sql immutable set search_path = life, public as $$
  select case cadence->>'type'
    when 'daily'    then true
    when 'weekdays' then (cadence->'days') @> to_jsonb(extract(isodow from d)::int)
    when 'monthly'  then extract(day from d)::int = (cadence->>'day')::int
    else false
  end
$$;

create or replace function life.f_task_window(t life.tasks, from_d date, to_d date)
returns daterange language sql immutable set search_path = life, public as $$
  select daterange(
    greatest(from_d, coalesce(t.start_date, t.created_at::date)),
    least(to_d, coalesce(t.end_date, t.archived_at::date, to_d)) + 1,
    '[)'
  )
$$;

create or replace function life.f_expected_count(t life.tasks, from_d date, to_d date)
returns integer language plpgsql stable set search_path = life, public as $$
declare
  w daterange := life.f_task_window(t, from_d, to_d);
  lo date;
  hi date;
  n integer;
begin
  if isempty(w) then return 0; end if;
  lo := lower(w);
  hi := upper(w) - 1;

  if t.cadence->>'type' = 'weekly' then
    select count(distinct date_trunc('week', g))::int * (t.cadence->>'times')::int
      into n
      from generate_series(lo, hi, interval '1 day') g;
    return coalesce(n, 0);
  end if;

  if t.cadence->>'type' = 'once' then
    select count(*)::int into n
      from life.task_logs l
     where l.task_id = t.id and l.log_date between lo and hi;
    return coalesce(n, 0);
  end if;

  select count(*)::int into n
    from generate_series(lo, hi, interval '1 day') g
   where life.f_day_expected(t.cadence, g::date);
  return coalesce(n, 0);
end$$;

create or replace function life.f_task_streak_days(p_task uuid, p_upto date)
returns integer language plpgsql stable set search_path = life, public as $$
declare
  cur date := p_upto;
  st  text;
  streak integer := 0;
  skips_this_week integer := 0;
  week_of date := date_trunc('week', p_upto)::date;
begin
  select status into st from life.task_logs
   where task_id = p_task and log_date = cur;
  if st is distinct from 'done' then
    cur := cur - 1;                       -- tolérance du jour en cours
  end if;

  loop
    select status into st from life.task_logs
     where task_id = p_task and log_date = cur;

    if date_trunc('week', cur)::date <> week_of then
      week_of := date_trunc('week', cur)::date;
      skips_this_week := 0;
    end if;

    if st = 'done' then
      streak := streak + 1;
    elsif st = 'skipped' then
      skips_this_week := skips_this_week + 1;
      if skips_this_week > 1 then exit; end if;  -- le 2e saut vaut un raté
    else
      exit;                                      -- missed, pending ou rien
    end if;

    cur := cur - 1;
    if streak > 4000 then exit; end if;
  end loop;

  return streak;
end$$;

create or replace function life.f_task_streak_weeks(p_task uuid, p_times integer, p_upto date)
returns integer language plpgsql stable set search_path = life, public as $$
declare
  wk date := date_trunc('week', p_upto)::date;
  n integer;
  streak integer := 0;
begin
  select count(*) into n from life.task_logs
   where task_id = p_task and status = 'done'
     and log_date >= wk and log_date < wk + 7;
  if n < p_times then wk := wk - 7; end if;

  loop
    select count(*) into n from life.task_logs
     where task_id = p_task and status = 'done'
       and log_date >= wk and log_date < wk + 7;
    exit when n < p_times;
    streak := streak + 1;
    wk := wk - 7;
    if streak > 600 then exit; end if;
  end loop;

  return streak;
end$$;

create or replace view life.v_task_streaks with (security_invoker = true) as
  select
    t.id        as task_id,
    t.user_id,
    t.axis_key,
    t.title,
    t.cadence->>'type' as cadence_type,
    case when t.cadence->>'type' = 'weekly'
         then life.f_task_streak_weeks(t.id, (t.cadence->>'times')::int, current_date)
         else life.f_task_streak_days(t.id, current_date)
    end as streak,
    case when t.cadence->>'type' = 'weekly' then 'semaines' else 'jours' end as streak_unit
  from life.tasks t
  where t.active;

create or replace view life.v_task_adherence with (security_invoker = true) as
  select
    t.id as task_id,
    t.user_id,
    t.axis_key,
    w.days,
    life.f_expected_count(t, current_date - (w.days - 1), current_date) as expected,
    (select count(*) from life.task_logs l
      where l.task_id = t.id and l.status = 'done'
        and l.log_date > current_date - w.days and l.log_date <= current_date) as done
  from life.tasks t
  cross join (values (7), (30), (90)) as w(days)
  where t.active;

create or replace view life.v_axis_daily with (security_invoker = true) as
  select
    l.user_id,
    l.log_date as day,
    t.axis_key,
    count(*)                                        as total,
    count(*) filter (where l.status = 'done')       as done,
    count(*) filter (where l.status = 'missed')     as missed,
    count(*) filter (where l.status = 'skipped')    as skipped,
    count(*) filter (where l.status = 'pending')    as pending,
    coalesce(max(m.minutes), 0)                     as minutes
  from life.task_logs l
  join life.tasks t on t.id = l.task_id
  left join life.axis_minutes m
    on m.user_id = l.user_id and m.day = l.log_date and m.axis_key = t.axis_key
  group by l.user_id, l.log_date, t.axis_key;

create or replace view life.v_goal_day_values with (security_invoker = true) as
with linked as (
  select
    g.id as goal_id, g.user_id, g.kind, g.daily_max,
    k.contribution, k.weight, k.task_id, l.log_date, l.status, l.value
  from life.goals g
  join life.goal_task_links k on k.goal_id = g.id
  join life.tasks t on t.id = k.task_id and t.active
  join life.task_logs l on l.task_id = k.task_id and l.log_date >= g.starts_on
),
full_mode as (
  select goal_id, user_id, log_date, 1::numeric as v
  from linked
  where contribution = 'full' and status = 'done'
  group by goal_id, user_id, log_date
),
frac_mode as (
  select
    l.goal_id, l.user_id, l.log_date,
    case when count(*) filter (where l.status = 'done') >= (
           select count(*) from life.goal_task_links k2
           join life.tasks t2 on t2.id = k2.task_id and t2.active
           where k2.goal_id = l.goal_id and k2.contribution = 'fractional')
         then 1::numeric else 0::numeric end as v
  from linked l
  where l.contribution = 'fractional'
  group by l.goal_id, l.user_id, l.log_date
),
incr_mode as (
  select
    goal_id, user_id, log_date,
    least(
      coalesce(max(daily_max), 1e9),
      sum(coalesce(value, weight))
    ) as v
  from linked
  where contribution = 'increment' and status = 'done'
  group by goal_id, user_id, log_date
)
select goal_id, user_id, log_date, sum(v) as value
from (
  select * from full_mode
  union all select * from frac_mode
  union all select * from incr_mode
) u
where v > 0
group by goal_id, user_id, log_date;

create or replace view life.v_goal_progress with (security_invoker = true) as
with base as (
  select
    g.*,
    greatest(1, (g.deadline - g.starts_on) + 1)                              as days_total,
    greatest(1, least(g.deadline, current_date) - g.starts_on + 1)           as days_elapsed,
    coalesce((select sum(d.value) from life.v_goal_day_values d
               where d.goal_id = g.id and d.log_date <= current_date), 0)    as raw_sum,
    coalesce((select count(*) from life.v_goal_day_values d
               where d.goal_id = g.id and d.log_date <= current_date
                 and d.value >= coalesce(g.daily_target, 1)), 0)             as hit_days
  from life.goals g
),
shaped as (
  select
    b.*,
    case b.kind
      when 'cumulative' then b.raw_sum
      when 'habit'      then b.hit_days::numeric
      else null
    end as real_value,
    case b.kind
      when 'cumulative' then b.target_total
      when 'habit'      then coalesce(b.target_total, b.days_total::numeric)
      else b.target_total
    end as target_value
  from base b
)
select
  s.id as goal_id, s.user_id, s.slug, s.label, s.label_ar, s.domain, s.kind,
  s.unit, s.is_private, s.state, s.position, s.starts_on, s.deadline,
  s.days_total, s.days_elapsed,
  s.days_total - s.days_elapsed                                        as days_left,
  s.real_value,
  s.target_value,
  case when s.target_value > 0 then s.real_value / s.target_value end  as real_ratio,
  s.days_elapsed::numeric / s.days_total                               as expected_ratio,
  case when s.target_value > 0
       then s.target_value * s.days_elapsed / s.days_total end         as expected_value,
  case when s.days_elapsed > 0
       then s.real_value / s.days_elapsed * s.days_total end           as projected_value,
  case when s.target_value > 0 and s.days_elapsed > 0
       then (s.real_value / s.days_elapsed * s.days_total) / s.target_value end as projected_ratio,
  case
    when s.real_value is null or s.target_value is null then null
    when s.real_value >= s.target_value then 0::numeric
    when s.real_value = 0 then null                       -- rien à multiplier
    when s.days_total - s.days_elapsed <= 0 then null     -- échéance passée
    else ((s.target_value - s.real_value) / (s.days_total - s.days_elapsed))
         / (s.real_value / s.days_elapsed)
  end as pace_factor,
  case when s.days_total - s.days_elapsed > 0 and s.target_value is not null
       then greatest(0, s.target_value - s.real_value) / (s.days_total - s.days_elapsed)
  end as required_per_day
from shaped s;

create or replace function life.f_pace_verdict(factor numeric)
returns text language sql immutable set search_path = life, public as $$
  select case
    when factor is null   then 'unknown'
    when factor <= 1.1    then 'on_track'
    when factor <= 1.5    then 'catch_up'
    when factor <= 3      then 'drifting'
    else 'unreachable'
  end
$$;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;

-- 0004_seed.sql
create or replace function life.bootstrap()
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  n_axes int;
  n_goals int;
  g_hizb uuid;
  g_10k uuid;
begin
  if uid is null then
    raise exception 'life.bootstrap() demande une session authentifiée';
  end if;

  insert into life.axes (user_id, key, label, label_ar, icon, color, position)
  values
    (uid, 'spiritualite', 'ALLAH',          'الله',    '🕌', '#7c3aed', 1),
    (uid, 'sante',        'SAHTI',          'صحتي',    '🍎', '#dc2626', 2),
    (uid, 'personnel',    'ANA',            'أنا',     '🧘', '#0891b2', 3),
    (uid, 'famille',      '3A2ILTI',        'عائلتي',  '👨‍👩‍👧', '#ea580c', 4),
    (uid, 'social',       'Social',         'اجتماعي', '🤝', '#ca8a04', 5),
    (uid, 'business',     'BUSINESS DIALI', 'تجارتي',  '💼', '#4f46e5', 6),
    (uid, 'finances',     'Finances',       'ماليتي',  '💰', '#16a34a', 7)
  on conflict (user_id, key) do nothing;
  get diagnostics n_axes = row_count;

  insert into life.goals
    (user_id, slug, label, label_ar, subtitle, domain, kind, unit,
     target_total, daily_target, daily_max, starts_on, deadline, is_private, position)
  values
    (uid, 'salat', 'Prières', 'صلاة كاملة في وقتها', 'Les cinq, à l''heure',
     'spiritual', 'habit', 'jour', null, 1, null, '2026-01-01', '2026-12-31', false, 1),

    (uid, 'hizb', 'Hizb', 'حفظ ٣٠ حزب', '30 hizb, environ 1 800 versets',
     'spiritual', 'cumulative', 'verset', 1800, null, 6, '2026-01-01', '2026-12-31', false, 2),

    (uid, 'body', 'Corps', 'بنية قوية منحوتة', 'Bas du corps prioritaire',
     'body', 'habit', 'séance', null, 1, null, '2026-01-01', '2026-12-31', false, 3),

    (uid, 'sante', 'Santé', null, 'Contrôle médical daté',
     'body', 'milestone', null, null, 1, null, '2026-01-01', '2026-12-31', true, 4),

    (uid, 'marti', 'Marti', 'مرتي', 'نلقى المرا اللي غنتزوج بيها',
     'personal', 'milestone', null, null, 1, null, '2026-01-01', '2026-12-31', true, 5),

    (uid, 'ca-2026', 'CA 2026', null, '50 000 $ de chiffre d''affaires livré',
     'business', 'metric', 'USD', 50000, null, null, '2026-01-01', '2026-12-31', false, 6),

    (uid, 'profit-mois', 'Profit/mois', null, '10 000 $ net, trois mois consécutifs',
     'business', 'metric', 'USD', 10000, null, null, '2026-10-01', '2026-12-31', false, 7)
  on conflict (user_id, slug) do nothing;
  get diagnostics n_goals = row_count;

  select id into g_hizb from life.goals where user_id = uid and slug = 'hizb';
  select id into g_10k  from life.goals where user_id = uid and slug = 'profit-mois';

  if g_hizb is not null and not exists (
       select 1 from life.goal_milestones where goal_id = g_hizb) then
    insert into life.goal_milestones (user_id, goal_id, label, due_on, target_value)
    values
      (uid, g_hizb, '450 versets',   '2026-03-31', 450),
      (uid, g_hizb, '900 versets',   '2026-06-30', 900),
      (uid, g_hizb, '1 350 versets', '2026-09-30', 1350),
      (uid, g_hizb, '1 800 versets', '2026-12-31', 1800);
  end if;

  if g_10k is not null and not exists (
       select 1 from life.goal_gates where goal_id = g_10k) then
    insert into life.goal_gates (user_id, goal_id, label, check_key, is_manual, position)
    values
      (uid, g_10k, 'Un produit sous son plafond CPL, 7 jours de suite', 'ecom.cpl_under_cap_7d', true, 1),
      (uid, g_10k, 'Taux de livraison au moins 40 % sur 30 jours',      'ecom.delivery_rate_30d', true, 2),
      (uid, g_10k, 'Capital publicitaire mensuel au moins 11 700 $',    'cash.ad_capital',        true, 3),
      (uid, g_10k, 'Stock couvrant environ 855 unités livrées par mois','ecom.stock_coverage',    true, 4);
  end if;

  return jsonb_build_object('axes_created', n_axes, 'goals_created', n_goals);
end$$;

alter table life.tasks add column if not exists legacy_id uuid;
create unique index if not exists tasks_legacy_idx on life.tasks (user_id, legacy_id)
  where legacy_id is not null;

create or replace function life.import_legacy()
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  n_tasks int := 0;
  n_logs int := 0;
begin
  if uid is null then
    raise exception 'life.import_legacy() demande une session authentifiée';
  end if;
  if to_regclass('public.tasks') is null then
    return jsonb_build_object('skipped', 'aucune table public.tasks');
  end if;

  insert into life.tasks
    (user_id, axis_key, title, kind, cadence, scheduled_time,
     start_value, daily_increment, start_date, active, created_at, legacy_id)
  select
    uid,
    o.axis::text,
    o.title,
    case o.type::text when 'progressive' then 'progressive'
                      when 'oneoff'      then 'oneoff'
                      else 'habit' end,
    case o.type::text when 'oneoff' then '{"type":"once"}'::jsonb
                      else '{"type":"daily"}'::jsonb end,
    o.scheduled_time,
    o.start_value,
    o.daily_increment,
    o.start_date,
    coalesce(o.active, true),
    o.created_at,
    o.id
  from public.tasks o
  where o.user_id = uid
    and exists (select 1 from life.axes a where a.user_id = uid and a.key = o.axis::text)
  on conflict (user_id, legacy_id) where legacy_id is not null do nothing;
  get diagnostics n_tasks = row_count;

  insert into life.task_logs
    (user_id, task_id, log_date, status, target_value, completed_at, created_at)
  select
    uid,
    nt.id,
    o.log_date,
    case when o.done then 'done'
         when o.log_date >= current_date then 'pending'
         else 'missed' end,
    o.target_value,
    case when o.done then o.created_at end,
    o.created_at
  from public.task_logs o
  join life.tasks nt on nt.user_id = uid and nt.legacy_id = o.task_id
  where o.user_id = uid
  on conflict (user_id, task_id, log_date) do nothing;
  get diagnostics n_logs = row_count;

  return jsonb_build_object('tasks_imported', n_tasks, 'logs_imported', n_logs);
end$$;

grant execute on all functions in schema life to authenticated;

-- 0005_business.sql
create table if not exists life.markets (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  label      text not null,
  currency   text not null,
  lead_time_days integer not null default 21,   -- délai de réappro réel
  position   integer not null default 0,
  active     boolean not null default true,
  primary key (user_id, key)
);
select life.apply_owner_rls('markets');

create table if not exists life.fee_grids (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  valid_from date not null,
  grid       jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, valid_from)
);
select life.apply_owner_rls('fee_grids');

create table if not exists life.decision_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  valid_from date not null,
  rules      jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, valid_from)
);
select life.apply_owner_rls('decision_rules');

create table if not exists life.fx_rates (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day     date not null,
  pair    text not null,          -- 'USD/MAD', 'SAR/USD', …
  rate    numeric not null,
  primary key (user_id, day, pair)
);
select life.apply_owner_rls('fx_rates');

create table if not exists life.products (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null,
  name_ar       text,
  sku           text[] not null default '{}',
  category      text not null default 'gadget',
  market_key    text,
  cogs_usd      numeric not null default 0,
  weight_kg     numeric not null default 0.5,
  status        text not null default 'testing',
  status_since  date not null default current_date,
  launched_on   date,
  killed_on     date,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint products_status_chk check (status in ('testing','scaling','optimising','killed','archived'))
);
create index if not exists products_user_idx on life.products (user_id, active);
drop trigger if exists trg_products_updated_at on life.products;
create trigger trg_products_updated_at before update on life.products
  for each row execute function life.tg_set_updated_at();
select life.apply_owner_rls('products');
select life.add_to_realtime('products');

create table if not exists life.product_pricing (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references life.products(id) on delete cascade,
  variant    text not null default 'single',
  price      numeric not null,
  currency   text not null default 'USD',
  valid_from date not null default current_date,
  primary key (product_id, variant, valid_from),
  constraint pricing_variant_chk check (variant in ('single','bundle2','bundle3'))
);
select life.apply_owner_rls('product_pricing');

create table if not exists life.product_status_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  uuid not null references life.products(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_on  date not null default current_date,
  reason      text
);
create index if not exists psl_product_idx on life.product_status_log (product_id, changed_on desc);
select life.apply_owner_rls('product_status_log');

create or replace function life.tg_log_product_status()
returns trigger language plpgsql set search_path = life, public as $$
begin
  if new.status is distinct from old.status then
    new.status_since := current_date;
    insert into life.product_status_log (user_id, product_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return new;
end$$;

drop trigger if exists trg_product_status on life.products;
create trigger trg_product_status before update on life.products
  for each row execute function life.tg_log_product_status();

create table if not exists life.campaigns (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references life.products(id) on delete cascade,
  platform   text not null default 'meta',
  market_key text,
  name       text not null,
  status     text not null default 'active',
  started_on date not null default current_date,
  ended_on   date,
  constraint campaigns_status_chk check (status in ('active','paused','ended'))
);
create index if not exists campaigns_user_idx on life.campaigns (user_id, status);
select life.apply_owner_rls('campaigns');
select life.add_to_realtime('campaigns');

create table if not exists life.daily_ads (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day         date not null,
  campaign_id uuid not null references life.campaigns(id) on delete cascade,
  spend_usd   numeric not null default 0,
  leads       integer not null default 0,
  impressions integer,
  clicks      integer,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day, campaign_id)
);
create index if not exists daily_ads_day_idx on life.daily_ads (user_id, day desc);
drop trigger if exists trg_daily_ads_updated_at on life.daily_ads;
create trigger trg_daily_ads_updated_at before update on life.daily_ads
  for each row execute function life.tg_set_updated_at();
select life.apply_owner_rls('daily_ads');
select life.add_to_realtime('daily_ads');

create table if not exists life.fulfilment_rows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id   uuid references life.products(id) on delete set null,
  market_key   text,
  period_start date not null,
  period_end   date not null,
  confirmed    integer not null default 0,
  delivered    integer not null default 0,
  returned     integer not null default 0,
  revenue_usd  numeric not null default 0,
  fees_usd     numeric not null default 0,
  source       text not null default 'manual',
  import_hash  text,
  imported_at  timestamptz not null default now(),
  constraint fr_period_chk check (period_end >= period_start),
  constraint fr_source_chk check (source in ('codpartner','codnetwork','manual'))
);
create index if not exists fr_user_period_idx on life.fulfilment_rows (user_id, period_end desc);
create unique index if not exists fr_hash_idx on life.fulfilment_rows (user_id, import_hash)
  where import_hash is not null;
select life.apply_owner_rls('fulfilment_rows');

create table if not exists life.product_stock (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id    uuid not null references life.products(id) on delete cascade,
  market_key    text not null,
  quantity      integer not null default 0,
  unit_cost_usd numeric not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, product_id, market_key)
);
drop trigger if exists trg_stock_updated_at on life.product_stock;
create trigger trg_stock_updated_at before update on life.product_stock
  for each row execute function life.tg_set_updated_at();
select life.apply_owner_rls('product_stock');

create table if not exists life.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references life.products(id) on delete cascade,
  market_key text not null,
  delta      integer not null,
  reason     text not null default 'manual',
  note       text,
  moved_on   date not null default current_date,   -- une date nue, jamais un timestamp
  created_at timestamptz not null default now(),
  constraint sm_reason_chk check (reason in ('restock','delivered','returned','loss','transfer','manual'))
);
create index if not exists sm_product_idx on life.stock_movements (product_id, moved_on desc);
select life.apply_owner_rls('stock_movements');

create or replace function life.tg_apply_stock_movement()
returns trigger language plpgsql set search_path = life, public as $$
begin
  insert into life.product_stock (user_id, product_id, market_key, quantity)
  values (new.user_id, new.product_id, new.market_key, new.delta)
  on conflict (user_id, product_id, market_key)
  do update set quantity = life.product_stock.quantity + excluded.quantity;
  return new;
end$$;

drop trigger if exists trg_stock_movement on life.stock_movements;
create trigger trg_stock_movement after insert on life.stock_movements
  for each row execute function life.tg_apply_stock_movement();

-- 0006_business_views.sql
create or replace function life.f_fee_grid(p_user uuid, p_on date)
returns jsonb language sql stable set search_path = life, public as $$
  select coalesce(
    (select grid from life.fee_grids
      where user_id = p_user and valid_from <= p_on
      order by valid_from desc limit 1),
    '{"leadFee":0.50,"confirmFee":1.00,"deliveredFee":2.00,"returnFee":4.99,
      "fulfilmentFee":0.00,"codCommission":0.05,"fxFee":0.015,
      "shipping":{"KSA":2.99,"UAE":4.99,"default":5.99}}'::jsonb)
$$;

create or replace function life.f_decision_rules(p_user uuid, p_on date)
returns jsonb language sql stable set search_path = life, public as $$
  select coalesce(
    (select rules from life.decision_rules
      where user_id = p_user and valid_from <= p_on
      order by valid_from desc limit 1),
    '{"winner":{"ctrMin":0.02,"confMin":0.40,"cplMax":4,"netPerDelivMin":10},
      "kill":{"ctrMax":0.015,"cpdMax":15,"confMax":0.30},
      "minLeadsForVerdict":20,"minDaysForVerdict":7}'::jsonb)
$$;

create or replace function life.f_price(p_product uuid, p_variant text, p_on date)
returns numeric language sql stable set search_path = life, public as $$
  select price from life.product_pricing
   where product_id = p_product and variant = p_variant and valid_from <= p_on
   order by valid_from desc limit 1
$$;

create or replace function life.f_cogs(p_cogs numeric, p_variant text)
returns numeric language sql immutable set search_path = life, public as $$
  select p_cogs * case p_variant when 'bundle2' then 2 when 'bundle3' then 3 else 1 end
$$;

create or replace function life.f_cpl_cap(
  p_product uuid, p_variant text, p_conf numeric, p_deliv numeric, p_on date default current_date)
returns table (price numeric, cogs numeric, shipping numeric, margin numeric, cpl_cap numeric)
language plpgsql stable set search_path = life, public as $$
declare
  pr life.products%rowtype;
  g jsonb;
  P numeric; F numeric; E numeric; M numeric;
  c numeric := greatest(0, least(1, coalesce(p_conf, 0)));
  d numeric := greatest(0, least(1, coalesce(p_deliv, 0)));
begin
  select * into pr from life.products where id = p_product;
  if not found then return; end if;

  g := life.f_fee_grid(pr.user_id, p_on);
  P := coalesce(life.f_price(p_product, p_variant, p_on), 0);
  F := life.f_cogs(pr.cogs_usd, p_variant);
  E := coalesce(
         (g->'shipping'->>coalesce(pr.market_key, 'default'))::numeric,
         (g->'shipping'->>'default')::numeric, 0);

  M := P - F - E
       - (g->>'deliveredFee')::numeric
       - ((g->>'codCommission')::numeric + (g->>'fxFee')::numeric) * P
       - coalesce((g->>'fulfilmentFee')::numeric, 0);

  return query select
    round(P, 2), round(F, 2), round(E, 2), round(M, 2),
    round(
      c * d * M
      - (g->>'leadFee')::numeric
      - c * (g->>'confirmFee')::numeric
      - c * (1 - d) * (g->>'returnFee')::numeric
    , 2);
end$$;

create or replace function life.f_product_kpis(p_product uuid, p_days integer default 7)
returns table (
  leads integer, spend numeric, confirmed integer, delivered integer,
  returned integer, revenue numeric,
  cpl numeric, cpd numeric, conf_rate numeric, deliv_rate numeric, net_per_deliv numeric
) language sql stable set search_path = life, public as $$
  with win as (select (current_date - (p_days - 1))::date as d0, current_date as d1),
  ads as (
    select coalesce(sum(a.leads), 0)::integer as leads,
           coalesce(sum(a.spend_usd), 0)      as spend
    from life.daily_ads a
    join life.campaigns c on c.id = a.campaign_id
    cross join win
    where c.product_id = p_product and a.day between win.d0 and win.d1
  ),
  ful as (
    select coalesce(sum(f.confirmed), 0)::integer   as confirmed,
           coalesce(sum(f.delivered), 0)::integer   as delivered,
           coalesce(sum(f.returned), 0)::integer    as returned,
           coalesce(sum(f.revenue_usd), 0)          as revenue
    from life.fulfilment_rows f
    cross join win
    where f.product_id = p_product and f.period_end between win.d0 and win.d1
  )
  select
    ads.leads, round(ads.spend, 2), ful.confirmed, ful.delivered, ful.returned,
    round(ful.revenue, 2),
    case when ads.leads > 0 then round(ads.spend / ads.leads, 2) end,
    case when ful.delivered > 0 then round(ads.spend / ful.delivered, 2) end,
    case when ads.leads > 0 then round(ful.confirmed::numeric / ads.leads, 4) end,
    case when ful.confirmed > 0 then round(ful.delivered::numeric / ful.confirmed, 4) end,
    case when ful.delivered > 0 then round((ful.revenue - ads.spend) / ful.delivered, 2) end
  from ads, ful
$$;

create or replace function life.f_verdict(p_product uuid, p_days integer default 7)
returns table (verdict text, reason text, wins integer, kills integer)
language plpgsql stable set search_path = life, public as $$
declare
  k record;
  r jsonb;
  uid uuid;
  ctr numeric;
  min_leads integer;
  w integer; kl integer;
begin
  select user_id into uid from life.products where id = p_product;
  r := life.f_decision_rules(uid, current_date);
  min_leads := (r->>'minLeadsForVerdict')::integer;
  select * into k from life.f_product_kpis(p_product, p_days);

  select case when sum(a.impressions) > 0
              then sum(a.clicks)::numeric / sum(a.impressions) end
    into ctr
    from life.daily_ads a join life.campaigns c on c.id = a.campaign_id
   where c.product_id = p_product and a.day > current_date - p_days;

  if coalesce(k.leads, 0) < min_leads or coalesce(k.confirmed, 0) < min_leads then
    return query select 'testing',
      format('Échantillon insuffisant : %s confirmés sur %s requis',
             coalesce(k.confirmed, 0), min_leads), 0, 0;
    return;
  end if;

  w := (case when coalesce(ctr, 0) >= (r->'winner'->>'ctrMin')::numeric then 1 else 0 end)
     + (case when coalesce(k.conf_rate, 0) >= (r->'winner'->>'confMin')::numeric then 1 else 0 end)
     + (case when coalesce(k.cpl, 0) > 0 and k.cpl <= (r->'winner'->>'cplMax')::numeric then 1 else 0 end)
     + (case when coalesce(k.net_per_deliv, 0) >= (r->'winner'->>'netPerDelivMin')::numeric then 1 else 0 end);

  kl := (case when coalesce(ctr, 0) > 0 and ctr < (r->'kill'->>'ctrMax')::numeric then 1 else 0 end)
      + (case when coalesce(k.cpd, 0) > (r->'kill'->>'cpdMax')::numeric then 1 else 0 end)
      + (case when coalesce(k.conf_rate, 0) > 0 and k.conf_rate < (r->'kill'->>'confMax')::numeric then 1 else 0 end);

  if w >= 3 then
    return query select 'scale', 'Monter le budget de 20 % et re-mesurer dans 3 jours', w, kl;
  elsif kl >= 2 then
    return query select 'kill', 'Couper, et solder le stock restant', w, kl;
  else
    return query select 'optimise', 'Travailler le critère le plus faible', w, kl;
  end if;
end$$;

create or replace view life.v_product_kpis with (security_invoker = true) as
  select p.id as product_id, p.user_id, p.name, p.name_ar, p.status, p.status_since,
         p.market_key, w.days, k.*
  from life.products p
  cross join (values (7), (14), (30)) as w(days)
  cross join lateral life.f_product_kpis(p.id, w.days) k
  where p.active;

create or replace view life.v_product_verdicts with (security_invoker = true) as
  select p.id as product_id, p.user_id, p.name, p.status, p.status_since,
         current_date - p.status_since as days_in_status,
         v.verdict as computed_verdict, v.reason, v.wins, v.kills,
         (v.verdict <> p.status and v.verdict <> 'testing') as needs_action
  from life.products p
  cross join lateral life.f_verdict(p.id, 7) v
  where p.active;

create or replace view life.v_stock_coverage with (security_invoker = true) as
  select
    s.user_id, s.product_id, p.name, s.market_key, s.quantity,
    round(s.quantity * s.unit_cost_usd, 2) as value_locked,
    coalesce(m.lead_time_days, 21) as lead_time_days,
    d.delivered_30,
    case when d.delivered_30 > 0
         then (s.quantity / (d.delivered_30 / 30.0))::integer end as coverage_days,
    (select max(moved_on) from life.stock_movements sm
      where sm.product_id = s.product_id and sm.market_key = s.market_key) as last_movement
  from life.product_stock s
  join life.products p on p.id = s.product_id
  left join life.markets m on m.user_id = s.user_id and m.key = s.market_key
  left join lateral (
    select coalesce(sum(f.delivered), 0) as delivered_30
    from life.fulfilment_rows f
    where f.product_id = s.product_id
      and f.period_end > current_date - 30
  ) d on true;

create or replace view life.v_stock_alerts with (security_invoker = true) as
  select user_id, product_id, name, market_key, quantity, coverage_days, value_locked,
    case
      when coverage_days is not null and coverage_days < lead_time_days then 'rupture'
      when coverage_days is not null and coverage_days > 90 then 'dormant'
      when last_movement is not null and current_date - last_movement > 30 then 'inactif'
    end as alert,
    case
      when coverage_days is not null and coverage_days < lead_time_days
        then format('Rupture dans %s jours, le réappro en prend %s — commander maintenant',
                    coverage_days, lead_time_days)
      when coverage_days is not null and coverage_days > 90
        then format('%s unités dormantes, %s $ immobilisés', quantity, value_locked)
      when last_movement is not null and current_date - last_movement > 30
        then format('Aucun mouvement depuis %s jours', current_date - last_movement)
    end as message
  from life.v_stock_coverage
  where (coverage_days is not null and (coverage_days < lead_time_days or coverage_days > 90))
     or (last_movement is not null and current_date - last_movement > 30);

create or replace function life.f_net_period(p_user uuid, p_from date, p_to date)
returns table (revenue numeric, ad_spend numeric, fees numeric, net numeric)
language sql stable set search_path = life, public as $$
  with r as (
    select coalesce(sum(revenue_usd), 0) rev, coalesce(sum(fees_usd), 0) fee
    from life.fulfilment_rows
    where user_id = p_user and period_end between p_from and p_to
  ), a as (
    select coalesce(sum(spend_usd), 0) spend
    from life.daily_ads
    where user_id = p_user and day between p_from and p_to
  )
  select round(r.rev, 2), round(a.spend, 2), round(r.fee, 2),
         round(r.rev - a.spend - r.fee, 2)
  from r, a
$$;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;

-- 0007_finance.sql
create table if not exists life.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name            text not null,
  kind            text not null default 'bank',
  currency        text not null default 'MAD',
  opening_balance numeric not null default 0,
  opened_on       date not null default current_date,
  is_business     boolean not null default false,
  active          boolean not null default true,
  position        integer not null default 0,
  constraint accounts_kind_chk check (kind in ('bank','cash','platform','credit'))
);
select life.apply_owner_rls('accounts');

create table if not exists life.envelopes (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key      text not null,
  label    text not null,
  label_ar text,
  resets   boolean not null default true,
  position integer not null default 0,
  primary key (user_id, key)
);
select life.apply_owner_rls('envelopes');

create table if not exists life.allocation_versions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  valid_from     date not null,
  monthly_income numeric not null default 0,
  shares         jsonb not null default '{}'::jsonb,   -- { "vie": 50, "reinvest": 25, … }
  emergency_goal numeric not null default 0,
  unique (user_id, valid_from)
);
select life.apply_owner_rls('allocation_versions');

create table if not exists life.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id    uuid references life.accounts(id) on delete set null,
  occurred_on   date not null,
  amount        numeric not null,
  currency      text not null default 'MAD',
  direction     text not null default 'out',
  envelope_key  text,
  category      text,
  counterparty  text,
  is_loan       boolean not null default false,
  loan_due_on   date,
  product_id    uuid references life.products(id) on delete set null,
  note          text,
  legacy_id     uuid,
  created_at    timestamptz not null default now(),
  constraint tx_direction_chk check (direction in ('in','out'))
);
create index if not exists tx_user_date_idx on life.transactions (user_id, occurred_on desc);
create index if not exists tx_env_idx on life.transactions (user_id, envelope_key, occurred_on);
create unique index if not exists tx_legacy_idx on life.transactions (user_id, legacy_id)
  where legacy_id is not null;
select life.apply_owner_rls('transactions');
select life.add_to_realtime('transactions');

create table if not exists life.account_statements (
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id    uuid not null references life.accounts(id) on delete cascade,
  as_of         date not null,
  real_balance  numeric not null,
  reconciled_at timestamptz not null default now(),
  primary key (account_id, as_of)
);
select life.apply_owner_rls('account_statements');

create or replace function life.f_allocation(p_user uuid, p_on date)
returns life.allocation_versions language sql stable set search_path = life, public as $$
  select * from life.allocation_versions
   where user_id = p_user and valid_from <= p_on
   order by valid_from desc limit 1
$$;

create or replace view life.v_envelope_states with (security_invoker = true) as
  select
    e.user_id, e.key, e.label, e.position,
    date_trunc('month', current_date)::date as month,
    round(coalesce((v.shares->>e.key)::numeric, 0) * v.monthly_income / 100, 2) as allocated,
    round(coalesce(s.spent, 0), 2) as spent,
    round(coalesce((v.shares->>e.key)::numeric, 0) * v.monthly_income / 100
          - coalesce(s.spent, 0), 2) as remaining
  from life.envelopes e
  left join lateral life.f_allocation(e.user_id, current_date) v on true
  left join lateral (
    select sum(t.amount) as spent
    from life.transactions t
    where t.user_id = e.user_id and t.envelope_key = e.key and t.direction = 'out'
      and t.occurred_on >= date_trunc('month', current_date)::date
  ) s on true;

create table if not exists life.cash_settings (
  user_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  payout_lag_days  integer not null default 14,
  salary_day       integer not null default 27,
  salary_amount    numeric not null default 0,
  salary_currency  text not null default 'MAD',
  ad_capital_floor numeric not null default 11700,
  usd_to_mad       numeric not null default 10
);
select life.apply_owner_rls('cash_settings');

create table if not exists life.planned_flows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  due_on     date not null,
  label      text not null,
  amount_usd numeric not null,
  kind       text not null default 'other',
  constraint pf_kind_chk check (kind in ('restock','credit','tax','other'))
);
create index if not exists pf_user_idx on life.planned_flows (user_id, due_on);
select life.apply_owner_rls('planned_flows');

create or replace view life.v_cash_position with (security_invoker = true) as
  select
    a.user_id, a.id as account_id, a.name, a.kind, a.currency, a.is_business,
    round(a.opening_balance
      + coalesce(sum(case when t.direction = 'in' then t.amount else -t.amount end), 0), 2) as computed_balance,
    (select st.real_balance from life.account_statements st
      where st.account_id = a.id order by st.as_of desc limit 1) as last_real_balance,
    (select st.as_of from life.account_statements st
      where st.account_id = a.id order by st.as_of desc limit 1) as last_reconciled_on
  from life.accounts a
  left join life.transactions t on t.account_id = a.id
  where a.active
  group by a.user_id, a.id, a.name, a.kind, a.currency, a.is_business, a.opening_balance;

create or replace function life.f_cash_forecast(p_user uuid, p_weeks integer default 13)
returns table (
  week_start date, salary numeric, cod_in numeric, ad_out numeric,
  planned_out numeric, envelopes_out numeric, net numeric, running numeric
) language plpgsql stable set search_path = life, public as $$
declare
  cs life.cash_settings%rowtype;
  v life.allocation_versions%rowtype;
  start_w date := date_trunc('week', current_date)::date;
  bal numeric;
  ad_rate numeric;
  deliv_rate numeric;
begin
  select * into cs from life.cash_settings where user_id = p_user;
  if not found then
    cs.payout_lag_days := 14; cs.salary_day := 27; cs.salary_amount := 0;
    cs.usd_to_mad := 10;
  end if;
  v := life.f_allocation(p_user, current_date);

  select coalesce(sum(case when currency = 'MAD'
                           then computed_balance / nullif(cs.usd_to_mad, 0)
                           else computed_balance end), 0)
    into bal from life.v_cash_position where user_id = p_user;

  select coalesce(sum(spend_usd), 0) / 30 * 7 into ad_rate
    from life.daily_ads where user_id = p_user and day > current_date - 30;
  select coalesce(sum(revenue_usd - fees_usd), 0) / 30 * 7 into deliv_rate
    from life.fulfilment_rows where user_id = p_user and period_end > current_date - 30;

  for i in 0 .. p_weeks - 1 loop
    week_start := start_w + (7 * i);
    salary := case when exists (
                     select 1 from generate_series(week_start, week_start + 6, interval '1 day') g
                      where extract(day from g)::int = cs.salary_day)
                   then cs.salary_amount / nullif(cs.usd_to_mad, 0) else 0 end;
    cod_in := deliv_rate;
    ad_out := ad_rate;
    select coalesce(sum(amount_usd), 0) into planned_out
      from life.planned_flows
     where user_id = p_user and due_on between week_start and week_start + 6;
    envelopes_out := coalesce(v.monthly_income, 0) / nullif(cs.usd_to_mad, 0) / 4.33;
    net := coalesce(salary, 0) + cod_in - ad_out - planned_out - envelopes_out;
    bal := bal + net;
    running := round(bal, 2);
    salary := round(coalesce(salary, 0), 2); cod_in := round(cod_in, 2);
    ad_out := round(ad_out, 2); planned_out := round(planned_out, 2);
    envelopes_out := round(envelopes_out, 2); net := round(net, 2);
    return next;
  end loop;
end$$;

create or replace function life.f_ad_capital_available(p_user uuid)
returns numeric language sql stable set search_path = life, public as $$
  select round(min(running), 2)
  from life.f_cash_forecast(p_user, 4)
$$;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;

-- 0008_oncf_hifz_insights.sql
create table if not exists life.modifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null,
  engine     text,
  stage      text not null default 'identified',
  priority   text not null default 'normal',
  due_on     date,
  owner      text,
  closed_on  date,
  legacy_id  uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modif_stage_chk check (stage in
    ('identified','study','validation','procurement','execution','testing','closed')),
  constraint modif_priority_chk check (priority in ('low','normal','high','critical'))
);
create index if not exists modif_user_idx on life.modifications (user_id, stage, due_on);
create unique index if not exists modif_legacy_idx on life.modifications (user_id, legacy_id)
  where legacy_id is not null;
drop trigger if exists trg_modif_updated_at on life.modifications;
create trigger trg_modif_updated_at before update on life.modifications
  for each row execute function life.tg_set_updated_at();
select life.apply_owner_rls('modifications');

create table if not exists life.modification_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modification_id uuid not null references life.modifications(id) on delete cascade,
  happened_on     date not null default current_date,
  kind            text not null default 'note',
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint me_kind_chk check (kind in ('note','stage_change','call','document','blocker'))
);
create index if not exists me_modif_idx on life.modification_events (modification_id, happened_on desc);
select life.apply_owner_rls('modification_events');

create or replace function life.f_stage_progress(p_stage text)
returns numeric language sql immutable set search_path = life, public as $$
  select case p_stage
    when 'identified'  then 0.05 when 'study'       then 0.20
    when 'validation'  then 0.40 when 'procurement' then 0.60
    when 'execution'   then 0.80 when 'testing'     then 0.95
    when 'closed'      then 1.00 else 0 end
$$;

create or replace view life.v_modifications with (security_invoker = true) as
  select m.*,
    life.f_stage_progress(m.stage) as progress,
    case when m.due_on is null or m.stage = 'closed' then null
         else m.due_on - current_date end as days_to_due,
    case
      when m.stage = 'closed' then 'closed'
      when m.due_on is null then 'undated'
      when m.due_on < current_date then 'late'
      when m.due_on - current_date <= 7 then 'imminent'
      else 'ahead'
    end as bucket,
    (select count(*) from life.modification_events e where e.modification_id = m.id) as event_count,
    (select max(happened_on) from life.modification_events e where e.modification_id = m.id) as last_event_on
  from life.modifications m;

create table if not exists life.hifz_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  mode         text not null default 'new',
  hizb         integer,
  surah        integer,
  from_ayah    integer,
  to_ayah      integer,
  verses_count integer not null default 0,
  quality      smallint,
  note         text,
  created_at   timestamptz not null default now(),
  constraint hs_mode_chk check (mode in ('new','review','consolidation')),
  constraint hs_quality_chk check (quality is null or quality between 1 and 5)
);
create index if not exists hs_user_date_idx on life.hifz_sessions (user_id, session_date desc);
select life.apply_owner_rls('hifz_sessions');

create table if not exists life.hifz_portions (
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hizb                 integer not null,
  memorised_on         date,
  last_reviewed_on     date,
  review_interval_days integer not null default 7,
  strength             smallint not null default 1,
  primary key (user_id, hizb),
  constraint hp_hizb_chk check (hizb between 1 and 60)
);
select life.apply_owner_rls('hifz_portions');

drop function if exists life.record_hifz(text, integer, integer, smallint, date);

create or replace function life.record_hifz(
  p_mode text, p_hizb integer, p_verses integer, p_quality integer default null,
  p_date date default current_date)
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  cur life.hifz_portions%rowtype;
  next_interval integer;
begin
  insert into life.hifz_sessions (user_id, session_date, mode, hizb, verses_count, quality)
  values (uid, p_date, p_mode, p_hizb, p_verses, p_quality);

  if p_hizb is null then return jsonb_build_object('ok', true); end if;

  select * into cur from life.hifz_portions where user_id = uid and hizb = p_hizb;
  if not found then
    insert into life.hifz_portions (user_id, hizb, memorised_on, last_reviewed_on,
                                    review_interval_days, strength)
    values (uid, p_hizb,
            case when p_mode = 'new' then p_date end, p_date, 7, 1);
    return jsonb_build_object('created', true, 'next_review', p_date + 7);
  end if;

  next_interval := case
    when p_quality is null then cur.review_interval_days
    when p_quality >= 4 then least(180, cur.review_interval_days * 2)
    when p_quality = 3 then cur.review_interval_days
    else 3
  end;

  update life.hifz_portions set
    memorised_on = coalesce(memorised_on, case when p_mode = 'new' then p_date end),
    last_reviewed_on = p_date,
    review_interval_days = next_interval,
    strength = greatest(1, least(5, coalesce(p_quality, strength)))
  where user_id = uid and hizb = p_hizb;

  return jsonb_build_object('next_review', p_date + next_interval);
end$$;

create or replace view life.v_hifz_due with (security_invoker = true) as
  select user_id, hizb, memorised_on, last_reviewed_on, review_interval_days, strength,
         last_reviewed_on + review_interval_days as due_on,
         current_date - (last_reviewed_on + review_interval_days) as days_overdue
  from life.hifz_portions
  where memorised_on is not null
    and last_reviewed_on + review_interval_days <= current_date;

create or replace view life.v_hifz_summary with (security_invoker = true) as
  select
    p.user_id,
    count(*) filter (where p.memorised_on is not null) as hizb_memorised,
    (select coalesce(sum(verses_count), 0) from life.hifz_sessions s
      where s.user_id = p.user_id and s.mode = 'new') as verses_new,
    (select coalesce(sum(verses_count), 0) from life.hifz_sessions s
      where s.user_id = p.user_id and s.mode = 'review') as verses_reviewed,
    (select count(*) from life.v_hifz_due d where d.user_id = p.user_id) as due_count
  from life.hifz_portions p
  group by p.user_id;

create table if not exists life.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key           text not null,
  label         text not null,
  at_time       time not null,
  rrule         text not null default 'FREQ=DAILY',
  condition     text,
  active        boolean not null default true,
  snoozed_until timestamptz,
  last_fired_on date,
  unique (user_id, key)
);
select life.apply_owner_rls('reminders');

create table if not exists life.notifications_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reminder_key text,
  fired_at    timestamptz not null default now(),
  shown       boolean not null default false,
  acted       boolean not null default false
);
create index if not exists nl_user_idx on life.notifications_log (user_id, fired_at desc);
select life.apply_owner_rls('notifications_log');

create or replace view life.v_reminder_health with (security_invoker = true) as
  select r.user_id, r.key, r.label, r.active,
    count(n.*) filter (where n.fired_at > now() - interval '14 days') as fired_14d,
    count(n.*) filter (where n.fired_at > now() - interval '14 days' and n.acted) as acted_14d,
    bool_and(not n.acted) filter (where n.fired_at > now() - interval '3 days') as ignored_3d
  from life.reminders r
  left join life.notifications_log n on n.user_id = r.user_id and n.reminder_key = r.key
  group by r.user_id, r.key, r.label, r.active;

create table if not exists life.insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  computed_on  date not null default current_date,
  kind         text not null,
  subject      text not null,
  body         text not null,
  effect       numeric,
  sample_size  integer,
  confidence   numeric,
  dismissed_at timestamptz,
  acted_at     timestamptz,
  unique (user_id, kind, subject, computed_on)
);
create index if not exists insights_user_idx on life.insights (user_id, computed_on desc);
select life.apply_owner_rls('insights');

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;

-- 0009_engine.sql
drop function if exists life.close_day(date, smallint, smallint, text, jsonb, jsonb);

create or replace function life.close_day(
  p_day date default current_date,
  p_energy integer default null,
  p_mood integer default null,
  p_reason text default null,
  p_minutes jsonb default '{}'::jsonb,       -- { "business": 120, "famille": 45 }
  p_decisions jsonb default '{}'::jsonb      -- { "<task_id>": "missed" | "skipped" | "postponed:2026-10-09" }
) returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  k text; v text;
  n_decided integer := 0;
  n_auto integer := 0;
begin
  if uid is null then raise exception 'close_day() demande une session authentifiée'; end if;

  for k, v in select * from jsonb_each_text(p_minutes) loop
    insert into life.axis_minutes (user_id, day, axis_key, minutes)
    values (uid, p_day, k, v::integer)
    on conflict (user_id, day, axis_key) do update set minutes = excluded.minutes;
  end loop;

  for k, v in select * from jsonb_each_text(p_decisions) loop
    if v like 'postponed:%' then
      update life.task_logs set status = 'postponed'
       where user_id = uid and task_id = k::uuid and log_date = p_day;
      insert into life.task_logs (user_id, task_id, log_date, status)
      values (uid, k::uuid, split_part(v, ':', 2)::date, 'pending')
      on conflict (user_id, task_id, log_date) do nothing;
    else
      insert into life.task_logs (user_id, task_id, log_date, status)
      values (uid, k::uuid, p_day, v)
      on conflict (user_id, task_id, log_date) do update set status = excluded.status;
    end if;
    n_decided := n_decided + 1;
  end loop;

  update life.task_logs set status = 'missed'
   where user_id = uid and log_date = p_day and status = 'pending';
  get diagnostics n_auto = row_count;

  insert into life.day_states (user_id, day, energy, mood, miss_reason, closed_at)
  values (uid, p_day, p_energy, p_mood, p_reason, now())
  on conflict (user_id, day) do update set
    energy = coalesce(excluded.energy, life.day_states.energy),
    mood = coalesce(excluded.mood, life.day_states.mood),
    miss_reason = coalesce(excluded.miss_reason, life.day_states.miss_reason),
    closed_at = now();

  return jsonb_build_object('decided', n_decided, 'auto_missed', n_auto);
end$$;

create or replace function life.autoclose_days()
returns integer language plpgsql security definer set search_path = life, public as $$
declare n integer;
begin
  update life.task_logs l set status = 'missed'
    from life.day_states d
   where l.user_id = d.user_id and l.log_date = d.day
     and d.day < current_date and d.closed_at is null and l.status = 'pending';

  with closed as (
    update life.day_states set closed_at = now(), auto_closed = true
     where day < current_date and closed_at is null
    returning 1
  ) select count(*) into n from closed;
  return n;
end$$;

create or replace view life.v_today_focus with (security_invoker = true) as
  select
    t.user_id, t.id as task_id, t.title, t.axis_key,
    g.label as goal_label,
    p.pace_factor,
    coalesce(l.status, 'pending') as status,
    row_number() over (partition by t.user_id order by p.pace_factor desc nulls last) as rank
  from life.tasks t
  join life.goal_task_links k on k.task_id = t.id
  join life.goals g on g.id = k.goal_id
  join life.v_goal_progress p on p.goal_id = g.id
  left join life.task_logs l on l.task_id = t.id and l.log_date = current_date
  where t.active and g.state = 'in_progress'
    and coalesce(l.status, 'pending') = 'pending'
    and coalesce(p.pace_factor, 0) > 1.1;

create or replace function life.compute_insights(p_user uuid default auth.uid())
returns integer language plpgsql security invoker set search_path = life, public as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    with daily as (
      select d.day, a.axis_key,
             coalesce(a.done, 0)::numeric / nullif(a.total, 0) as rate,
             extract(isodow from d.day)::int as dow
      from life.day_states d
      join life.v_axis_daily a on a.user_id = d.user_id and a.day = d.day
      where d.user_id = p_user and d.day > current_date - 90
    ),
    per_dow as (
      select axis_key, dow, avg(rate) as rate, count(*) as n from daily group by axis_key, dow
    ),
    overall as (
      select axis_key, avg(rate) as rate from daily group by axis_key
    )
    select p.axis_key, p.dow, p.rate, p.n, o.rate as overall_rate,
           abs(p.rate - o.rate) as gap
    from per_dow p join overall o using (axis_key)
    where p.n >= 8 and abs(p.rate - o.rate) >= 0.25
    order by gap desc limit 3
  loop
    insert into life.insights (user_id, kind, subject, body, effect, sample_size)
    values (p_user, 'weekday_axis', r.axis_key || '-' || r.dow,
      format('Le %s, ton axe %s tombe à %s %% contre %s %% le reste de la semaine, sur %s occasions.',
        (array['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])[r.dow],
        r.axis_key, round(r.rate * 100), round(r.overall_rate * 100), r.n),
      round(r.gap, 3), r.n)
    on conflict (user_id, kind, subject, computed_on) do nothing;
    n := n + 1;
  end loop;

  for r in
    with daily as (
      select d.energy,
             sum(a.done)::numeric / nullif(sum(a.total), 0) as rate
      from life.day_states d
      join life.v_axis_daily a on a.user_id = d.user_id and a.day = d.day
      where d.user_id = p_user and d.day > current_date - 90 and d.energy is not null
      group by d.day, d.energy
    )
    select
      avg(rate) filter (where energy <= 2) as low_rate,
      avg(rate) filter (where energy >= 4) as high_rate,
      count(*) filter (where energy <= 2) as n_low,
      count(*) filter (where energy >= 4) as n_high
    from daily
  loop
    if r.n_low >= 8 and r.n_high >= 8 and abs(r.high_rate - r.low_rate) >= 0.25 then
      insert into life.insights (user_id, kind, subject, body, effect, sample_size)
      values (p_user, 'energy_completion', 'global',
        format('Les jours où tu démarres fatigué, tu tiens %s %% de tes tâches contre %s %% les jours en forme.',
          round(r.low_rate * 100), round(r.high_rate * 100)),
        round(abs(r.high_rate - r.low_rate), 3), r.n_low + r.n_high)
      on conflict (user_id, kind, subject, computed_on) do nothing;
      n := n + 1;
    end if;
  end loop;

  for r in
    with pairs as (
      select d.day,
             extract(hour from d.closed_at at time zone 'Africa/Casablanca') as h,
             (select sum(a.done)::numeric / nullif(sum(a.total), 0)
                from life.v_axis_daily a
               where a.user_id = d.user_id and a.day = d.day + 1) as next_rate
      from life.day_states d
      where d.user_id = p_user and d.closed_at is not null and d.day > current_date - 90
    )
    select avg(next_rate) filter (where h >= 23 or h < 4) as late_rate,
           avg(next_rate) filter (where h between 20 and 22) as early_rate,
           count(*) filter (where h >= 23 or h < 4) as n_late,
           count(*) filter (where h between 20 and 22) as n_early
    from pairs where next_rate is not null
  loop
    if r.n_late >= 8 and r.n_early >= 8 and abs(r.early_rate - r.late_rate) >= 0.25 then
      insert into life.insights (user_id, kind, subject, body, effect, sample_size)
      values (p_user, 'late_close', 'global',
        format('Quand tu clôtures après 23 h, le lendemain tombe à %s %% contre %s %% après une clôture avant 22 h.',
          round(r.late_rate * 100), round(r.early_rate * 100)),
        round(abs(r.early_rate - r.late_rate), 3), r.n_late + r.n_early)
      on conflict (user_id, kind, subject, computed_on) do nothing;
      n := n + 1;
    end if;
  end loop;

  return n;
end$$;

create or replace view life.v_advice with (security_invoker = true) as
  with candidates as (
    select u.user_id, 1 as rank, 'cash' as kind,
      format('Trésorerie projetée à %s $ dans les 4 semaines. Rien ne se scale avant.',
             life.f_ad_capital_available(u.user_id)) as body
    from (select distinct user_id from life.cash_settings) u
    where life.f_ad_capital_available(u.user_id) < 0

    union all
    select user_id, 2, 'stock', message from life.v_stock_alerts where alert = 'rupture'

    union all
    select user_id, 3, 'goal_unreachable',
      format('« %s » est hors d''atteinte au rythme actuel : il faudrait %s par jour. Revois la cible ou l''échéance.',
             label, round(required_per_day, 2))
    from life.v_goal_progress
    where pace_factor > 3 and state = 'in_progress' and not is_private

    union all
    select user_id, 4, 'goal_pace',
      format('« %s » : %s par jour pour tenir la cible.', label, round(required_per_day, 2))
    from life.v_goal_progress
    where pace_factor between 1.1 and 3 and state = 'in_progress' and not is_private

    union all
    select user_id, 5, 'product',
      format('%s passe en %s. %s', name, computed_verdict, reason)
    from life.v_product_verdicts where needs_action

    union all
    select user_id, 6, 'hifz',
      format('%s hizb à réviser, le plus ancien depuis %s jours.',
             count(*), max(days_overdue))
    from life.v_hifz_due group by user_id

    union all
    select user_id, 7, 'insight', body
    from life.insights
    where dismissed_at is null and computed_on > current_date - 7
  )
  select distinct on (user_id) user_id, rank, kind, body
  from candidates
  order by user_id, rank, body;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;

-- 0010_bootstrap_full.sql
create table if not exists life.goal_manual_entries (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id    uuid not null references life.goals(id) on delete cascade,
  entry_date date not null,
  value      numeric not null,
  source     text not null default 'legacy',
  primary key (goal_id, entry_date)
);
create index if not exists gme_user_idx on life.goal_manual_entries (user_id, entry_date);
select life.apply_owner_rls('goal_manual_entries');

alter table life.products  add column if not exists legacy_key text;
alter table life.campaigns add column if not exists legacy_key text;
create unique index if not exists products_legacy_idx  on life.products  (user_id, legacy_key) where legacy_key is not null;
create unique index if not exists campaigns_legacy_idx on life.campaigns (user_id, legacy_key) where legacy_key is not null;

create or replace function life.bootstrap_full()
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  out_json jsonb;
begin
  if uid is null then raise exception 'session authentifiée requise'; end if;

  out_json := life.bootstrap();   -- axes + objectifs + jalons + verrous

  insert into life.markets (user_id, key, label, currency, lead_time_days, position) values
    (uid, 'KSA', 'Arabie saoudite', 'SAR', 25, 1),
    (uid, 'UAE', 'Émirats',         'AED', 20, 2),
    (uid, 'KWT', 'Koweït',          'KWD', 25, 3),
    (uid, 'OMA', 'Oman',            'OMR', 25, 4),
    (uid, 'QAT', 'Qatar',           'QAR', 25, 5),
    (uid, 'BAH', 'Bahreïn',         'BHD', 25, 6),
    (uid, 'MAR', 'Maroc',           'MAD', 10, 7)
  on conflict (user_id, key) do nothing;

  insert into life.envelopes (user_id, key, label, label_ar, resets, position) values
    (uid, 'vie',            'Vie',              'المعيشة',   true,  1),
    (uid, 'reinvest',       'Réinvestissement', 'إعادة استثمار', true, 2),
    (uid, 'urgence',        'Fond d''urgence',  'الطوارئ',   false, 3),
    (uid, 'divertissement', 'Divertissement',   'الترفيه',   true,  4)
  on conflict (user_id, key) do nothing;

  insert into life.fee_grids (user_id, name, valid_from, grid) values
    (uid, 'COD Partner — plan courant', '2026-01-01',
     '{"leadFee":0.50,"confirmFee":1.00,"deliveredFee":2.00,"returnFee":4.99,
       "fulfilmentFee":0.00,"codCommission":0.05,"fxFee":0.015,
       "shipping":{"KSA":2.99,"UAE":4.99,"default":5.99}}'::jsonb)
  on conflict (user_id, valid_from) do nothing;

  insert into life.decision_rules (user_id, valid_from, rules) values
    (uid, '2026-01-01',
     '{"winner":{"ctrMin":0.02,"confMin":0.40,"cplMax":4,"netPerDelivMin":10},
       "kill":{"ctrMax":0.015,"cpdMax":15,"confMax":0.30},
       "minLeadsForVerdict":20,"minDaysForVerdict":7}'::jsonb)
  on conflict (user_id, valid_from) do nothing;

  insert into life.cash_settings (user_id) values (uid) on conflict do nothing;

  insert into life.reminders (user_id, key, label, at_time, rrule, condition) values
    (uid, 'evening_ads',  'Saisie du soir — dépense et leads', '21:00', 'FREQ=DAILY', 'no_ads_today'),
    (uid, 'close_day',    'Clôture de la journée',             '21:30', 'FREQ=DAILY', 'day_not_closed'),
    (uid, 'open_habits',  'Habitudes encore ouvertes',         '22:00', 'FREQ=DAILY', 'tasks_pending'),
    (uid, 'weekly_import','Coller les relevés de la semaine',  '09:00', 'FREQ=WEEKLY;BYDAY=MO', 'no_import_7d'),
    (uid, 'monthly_close','Clôture du mois',                   '09:00', 'FREQ=MONTHLY;BYMONTHDAY=1', null),
    (uid, 'hifz_due',     'Révisions de mémorisation dues',    '07:00', 'FREQ=DAILY', 'hifz_due')
  on conflict (user_id, key) do nothing;

  return out_json || jsonb_build_object('markets', 7, 'envelopes', 4, 'reminders', 6);
end$$;

create or replace function life.import_legacy_sql()
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  n_tx integer := 0;
  n_modif integer := 0;
  tasks_json jsonb;
begin
  if uid is null then raise exception 'session authentifiée requise'; end if;
  tasks_json := life.import_legacy();

  if to_regclass('public.transactions') is not null then
    insert into life.transactions
      (user_id, occurred_on, amount, currency, direction, envelope_key, is_loan, note, legacy_id)
    select uid, o.occurred_at::date, o.amount, 'MAD', 'out', o.envelope,
           coalesce(o.note, '') like '[PRÊT]%',
           nullif(regexp_replace(coalesce(o.note, ''), '^\[PRÊT\]\s*', ''), ''),
           o.id
    from public.transactions o
    where o.user_id = uid
    on conflict do nothing;
    get diagnostics n_tx = row_count;
  end if;

  if to_regclass('public.modifications') is not null then
    insert into life.modifications (user_id, title, stage, priority, due_on, legacy_id, created_at)
    select uid, o.title,
           case o.stage::text
             when 'identifie'   then 'identified' when 'etude'      then 'study'
             when 'validation'  then 'validation' when 'appro'      then 'procurement'
             when 'execution'   then 'execution'  when 'essais'     then 'testing'
             when 'cloture'     then 'closed'     else 'identified' end,
           coalesce(nullif(o.priority::text, ''), 'normal'),
           o.due_date, o.id, o.created_at
    from public.modifications o
    where o.user_id = uid
    on conflict do nothing;
    get diagnostics n_modif = row_count;
  end if;

  return tasks_json || jsonb_build_object('transactions', n_tx, 'modifications', n_modif);
end$$;

create or replace function life.import_legacy_json(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  g jsonb; e jsonb; d jsonb;
  k text; v text;
  gid uuid; pid uuid; cid uuid;
  n_entries integer := 0; n_products integer := 0; n_ads integer := 0; n_stock integer := 0;
begin
  if uid is null then raise exception 'session authentifiée requise'; end if;

  for g in select * from jsonb_array_elements(coalesce(payload->'goals'->'goals', '[]'::jsonb)) loop
    select id into gid from life.goals
     where user_id = uid and slug = replace(replace(g->>'id', 'goal_', ''), '_', '-');
    if gid is null then continue; end if;

    for k, v in select * from jsonb_each_text(coalesce(g->'entries', '{}'::jsonb)) loop
      insert into life.goal_manual_entries (user_id, goal_id, entry_date, value)
      values (uid, gid, k::date, v::numeric)
      on conflict (goal_id, entry_date) do nothing;
      n_entries := n_entries + 1;
    end loop;

    for k, v in select * from jsonb_each_text(coalesce(g->'habit'->'entries', '{}'::jsonb)) loop
      insert into life.goal_manual_entries (user_id, goal_id, entry_date, value)
      values (uid, gid, k::date, v::numeric)
      on conflict (goal_id, entry_date) do nothing;
      n_entries := n_entries + 1;
    end loop;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(payload->'ecom'->'products', '[]'::jsonb)) loop
    insert into life.products (user_id, name, sku, category, market_key, cogs_usd, status, legacy_key)
    values (uid, e->>'name',
            coalesce((select array_agg(x) from jsonb_array_elements_text(e->'sku') x), '{}'),
            coalesce(e->>'category', 'gadget'),
            coalesce(e->>'market', 'KSA'),
            coalesce((e->>'cogs')::numeric, 0),
            case e->>'status' when 'winner' then 'scaling' when 'killed' then 'killed'
                              else 'testing' end,
            e->>'id')
    on conflict (user_id, legacy_key) do nothing;
    select id into pid from life.products where user_id = uid and legacy_key = e->>'id';
    n_products := n_products + 1;

    for k in select jsonb_object_keys(coalesce(e->'pricing', '{}'::jsonb)) loop
      insert into life.product_pricing (user_id, product_id, variant, price, currency, valid_from)
      values (uid, pid, k, (e->'pricing'->k->>'price')::numeric,
              coalesce(e->'pricing'->k->>'currency', 'USD'), '2026-01-01')
      on conflict do nothing;
    end loop;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(payload->'ecom'->'campaigns', '[]'::jsonb)) loop
    select id into pid from life.products where user_id = uid and legacy_key = e->>'productId';
    if pid is null then continue; end if;
    insert into life.campaigns (user_id, product_id, platform, name, status, legacy_key)
    values (uid, pid, coalesce(e->>'platform', 'meta'), coalesce(e->>'name', 'Campagne'),
            coalesce(e->>'status', 'active'), e->>'id')
    on conflict (user_id, legacy_key) do nothing;
  end loop;

  for d in select * from jsonb_array_elements(coalesce(payload->'ecom'->'daily', '[]'::jsonb)) loop
    select id into cid from life.campaigns where user_id = uid and legacy_key = d->>'campaignId';
    if cid is null or (d->>'date') is null then continue; end if;
    insert into life.daily_ads (user_id, day, campaign_id, spend_usd, leads)
    values (uid, (d->>'date')::date, cid,
            coalesce((d->>'spend')::numeric, 0), coalesce((d->>'leads')::integer, 0))
    on conflict (user_id, day, campaign_id) do nothing;
    n_ads := n_ads + 1;
  end loop;

  for e in select * from jsonb_array_elements(
             coalesce(payload->'ecom'->'positions'->'stock', '[]'::jsonb)) loop
    select id into pid from life.products
     where user_id = uid and (e->>'sku') = any(sku) limit 1;
    if pid is null then continue; end if;
    insert into life.product_stock (user_id, product_id, market_key, quantity, unit_cost_usd)
    values (uid, pid, coalesce(e->>'warehouse', 'KSA'),
            coalesce((e->>'units')::integer, 0), coalesce((e->>'unitCost')::numeric, 0))
    on conflict (user_id, product_id, market_key) do update
      set quantity = excluded.quantity, unit_cost_usd = excluded.unit_cost_usd;
    n_stock := n_stock + 1;
  end loop;

  return jsonb_build_object('goal_entries', n_entries, 'products', n_products,
                            'daily_ads', n_ads, 'stock_rows', n_stock);
end$$;

grant execute on all functions in schema life to authenticated;

-- 0011_progress_patch.sql
create or replace view life.v_goal_day_values with (security_invoker = true) as
with linked as (
  select
    g.id as goal_id, g.user_id, g.kind, g.daily_max,
    k.contribution, k.weight, k.task_id, l.log_date, l.status, l.value
  from life.goals g
  join life.goal_task_links k on k.goal_id = g.id
  join life.tasks t on t.id = k.task_id and t.active
  join life.task_logs l on l.task_id = k.task_id and l.log_date >= g.starts_on
),
full_mode as (
  select goal_id, user_id, log_date, 1::numeric as v
  from linked where contribution = 'full' and status = 'done'
  group by goal_id, user_id, log_date
),
frac_mode as (
  select
    l.goal_id, l.user_id, l.log_date,
    case when count(*) filter (where l.status = 'done') >= (
           select count(*) from life.goal_task_links k2
           join life.tasks t2 on t2.id = k2.task_id and t2.active
           where k2.goal_id = l.goal_id and k2.contribution = 'fractional')
         then 1::numeric else 0::numeric end as v
  from linked l
  where l.contribution = 'fractional'
  group by l.goal_id, l.user_id, l.log_date
),
incr_mode as (
  select goal_id, user_id, log_date,
         least(coalesce(max(daily_max), 1e9), sum(coalesce(value, weight))) as v
  from linked where contribution = 'increment' and status = 'done'
  group by goal_id, user_id, log_date
),
manual as (
  select m.goal_id, m.user_id, m.entry_date as log_date, m.value as v
  from life.goal_manual_entries m
  join life.goals g on g.id = m.goal_id
  where m.entry_date >= g.starts_on
)
select goal_id, user_id, log_date, max(v) as value
from (
  select * from full_mode
  union all select * from frac_mode
  union all select * from incr_mode
  union all select * from manual
) u
where v > 0
group by goal_id, user_id, log_date;

grant select on all tables in schema life to authenticated;
