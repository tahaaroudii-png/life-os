-- =====================================================================
-- Life OS — Lot 1 · Migration 3/4 : le calcul
--
-- Tout ce que l'ancienne app calculait dans lib/goals.js descend ici.
-- Rien de ce qui suit n'est stocké : ce sont des vues et des fonctions,
-- donc le téléphone et le portable lisent le même nombre, toujours à jour.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La cadence : un jour est-il attendu pour cette tâche ?
--
-- `weekly` renvoie false : sa cible porte sur la semaine, pas sur le jour.
-- C'est f_expected_count qui en tient compte.
-- extract(isodow) : 1 = lundi … 7 = dimanche.
-- ---------------------------------------------------------------------
create or replace function life.f_day_expected(cadence jsonb, d date)
returns boolean language sql immutable set search_path = life, public as $$
  select case cadence->>'type'
    when 'daily'    then true
    when 'weekdays' then (cadence->'days') @> to_jsonb(extract(isodow from d)::int)
    when 'monthly'  then extract(day from d)::int = (cadence->>'day')::int
    else false
  end
$$;

-- Fenêtre réellement active d'une tâche sur [from, to].
create or replace function life.f_task_window(t life.tasks, from_d date, to_d date)
returns daterange language sql immutable set search_path = life, public as $$
  select daterange(
    greatest(from_d, coalesce(t.start_date, t.created_at::date)),
    least(to_d, coalesce(t.end_date, t.archived_at::date, to_d)) + 1,
    '[)'
  )
$$;

-- Nombre d'occurrences attendues sur une période, cadence comprise.
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
    -- Nombre de semaines ISO entamées × le nombre de fois visé.
    select count(distinct date_trunc('week', g))::int * (t.cadence->>'times')::int
      into n
      from generate_series(lo, hi, interval '1 day') g;
    return coalesce(n, 0);
  end if;

  if t.cadence->>'type' = 'once' then
    -- Une ponctuelle n'est attendue que les jours où une occurrence existe.
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

-- ---------------------------------------------------------------------
-- 2. Les séries
--
-- Règles tenues ici, et nulle part ailleurs :
--   · `missed` casse la série ; `skipped` la traverse sans l'allonger ;
--   · le jour en cours ne casse rien tant qu'il n'est pas clos :
--     si aujourd'hui n'est pas fait, on démarre le décompte à hier ;
--   · au-delà d'un `skipped` par semaine, le deuxième compte comme un raté.
-- ---------------------------------------------------------------------
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

-- Série en semaines pour une cadence hebdomadaire : une semaine compte
-- si elle atteint son nombre de fois. La semaine en cours est tolérée.
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

-- ---------------------------------------------------------------------
-- 3. Adhérence — fait sur attendu, sur 7, 30 et 90 jours
--
-- Une habitude « 4 fois par semaine » est jugée sur la semaine, jamais
-- sur le jour. C'est ce que l'ancienne app ne savait pas exprimer.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. La journée par axe — ce qui remplit les anneaux de l'écran du jour
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 5. La valeur qu'un objectif reçoit chaque jour
--
-- Une ligne par (objectif, jour) où quelque chose a été apporté :
--   full       au moins une tâche liée faite → 1
--   fractional toutes les tâches liées faites → 1, sinon 0 (tout ou rien,
--              assumé : trois prières sur cinq n'est pas 60 % d'une journée)
--   increment  la somme des valeurs saisies, plafonnée par daily_max
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. La progression annuelle — réel, attendu à date, projection
--
-- Les trois nombres sortent toujours ensemble. Un chiffre nu ne déclenche
-- aucune décision : 40 % en octobre est bon pour un objectif démarré en
-- septembre et catastrophique pour un objectif annuel.
-- ---------------------------------------------------------------------
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
  -- Par combien multiplier le rythme observé pour tenir la cible.
  case
    when s.real_value is null or s.target_value is null then null
    when s.real_value >= s.target_value then 0::numeric
    when s.real_value = 0 then null                       -- rien à multiplier
    when s.days_total - s.days_elapsed <= 0 then null     -- échéance passée
    else ((s.target_value - s.real_value) / (s.days_total - s.days_elapsed))
         / (s.real_value / s.days_elapsed)
  end as pace_factor,
  -- Ce qu'il faut faire par jour, désormais, pour arriver à la cible.
  case when s.days_total - s.days_elapsed > 0 and s.target_value is not null
       then greatest(0, s.target_value - s.real_value) / (s.days_total - s.days_elapsed)
  end as required_per_day
from shaped s;

-- Verdict de rythme, dans le même ordre que la hiérarchie des conseils.
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

-- ---------------------------------------------------------------------
-- 7. Droits — explicites, après la création de tout l'objet du schéma.
-- `alter default privileges` ne couvre pas ce qui précède son exécution.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;
