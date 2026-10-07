-- =====================================================================
-- Life OS — La progression tient compte de l'historique repris
--
-- v_goal_day_values ne voyait que les tâches cochées. L'historique de
-- l'ancienne app, lui, est fait d'entrées saisies à la main sans tâche
-- derrière. Les ignorer ferait repartir à zéro des objectifs déjà à
-- moitié faits — la progression doit additionner les deux.
-- =====================================================================

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
  -- L'historique repris. Une date déjà couverte par une tâche n'est pas
  -- comptée deux fois : le `max` plus bas tranche en faveur de la plus
  -- grande des deux valeurs du jour, jamais de leur somme.
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
