-- =====================================================================
-- Life OS — Lot 2 et 5 · Les moteurs
--
--   life.close_day()        la clôture du soir, avec arbitrage
--   life.autoclose_days()   la fermeture de minuit, jouée par cron
--   life.compute_insights() les corrélations, jouées la nuit
--   life.v_advice           le conseil unique du jour, par rang
--   life.v_today_focus      les trois actions prioritaires du matin
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Clôture du soir
--
-- Rien ne traverse la nuit sans décision : chaque tâche encore ouverte
-- reçoit un statut. C'est ce qui sépare un journal d'un système.
-- ---------------------------------------------------------------------
-- La signature change entre versions : il faut retirer l'ancienne avant.
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

  -- Temps par axe
  for k, v in select * from jsonb_each_text(p_minutes) loop
    insert into life.axis_minutes (user_id, day, axis_key, minutes)
    values (uid, p_day, k, v::integer)
    on conflict (user_id, day, axis_key) do update set minutes = excluded.minutes;
  end loop;

  -- Arbitrage explicite
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

  -- Ce qui reste ouvert après l'arbitrage est compté comme raté : une
  -- clôture qui laisse des tâches en suspens ne clôt rien.
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

-- Minuit : une journée non close se ferme seule, tâches ouvertes en raté.
-- `auto_closed` garde la trace que ce n'est pas toi qui as tranché.
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

-- ---------------------------------------------------------------------
-- 2. Le bloc des trois — ce qui, fait aujourd'hui, redresse le plus
--
-- Classement : la tâche qui alimente l'objectif le plus en dérive passe
-- devant. Un écran qui liste 18 tâches ne décide rien.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3. Les corrélations
--
-- Une par nuit, sur 90 jours glissants, avec un seuil : au moins 8
-- observations et 25 points d'écart. En dessous, c'est du bruit présenté
-- comme une vérité, et une app qui dit n'importe quoi une fois n'est
-- plus crue ensuite.
-- ---------------------------------------------------------------------
create or replace function life.compute_insights(p_user uuid default auth.uid())
returns integer language plpgsql security invoker set search_path = life, public as $$
declare
  n integer := 0;
  r record;
begin
  -- a) Jour de la semaine × axe : quel axe tombe quel jour.
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

  -- b) Énergie × complétion : ce que la fatigue coûte réellement.
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

  -- c) Heure de clôture × complétion du lendemain.
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

-- ---------------------------------------------------------------------
-- 4. Le conseil unique du jour
--
-- Un seul, choisi par rang. L'app dit quoi faire ; elle ne déverse pas
-- une liste de choses à regarder.
-- ---------------------------------------------------------------------
create or replace view life.v_advice with (security_invoker = true) as
  with candidates as (
    -- Rang 1 : trésorerie projetée sous zéro dans les 4 semaines.
    select u.user_id, 1 as rank, 'cash' as kind,
      format('Trésorerie projetée à %s $ dans les 4 semaines. Rien ne se scale avant.',
             life.f_ad_capital_available(u.user_id)) as body
    from (select distinct user_id from life.cash_settings) u
    where life.f_ad_capital_available(u.user_id) < 0

    union all
    -- Rang 2 : rupture de stock sous le délai de réappro.
    select user_id, 2, 'stock', message from life.v_stock_alerts where alert = 'rupture'

    union all
    -- Rang 3 : objectif hors d'atteinte — à renégocier, pas à subir.
    select user_id, 3, 'goal_unreachable',
      format('« %s » est hors d''atteinte au rythme actuel : il faudrait %s par jour. Revois la cible ou l''échéance.',
             label, round(required_per_day, 2))
    from life.v_goal_progress
    where pace_factor > 3 and state = 'in_progress' and not is_private

    union all
    -- Rang 4 : écart de rythme rattrapable.
    select user_id, 4, 'goal_pace',
      format('« %s » : %s par jour pour tenir la cible.', label, round(required_per_day, 2))
    from life.v_goal_progress
    where pace_factor between 1.1 and 3 and state = 'in_progress' and not is_private

    union all
    -- Rang 5 : verdict produit à appliquer.
    select user_id, 5, 'product',
      format('%s passe en %s. %s', name, computed_verdict, reason)
    from life.v_product_verdicts where needs_action

    union all
    -- Rang 6 : révision de mémorisation en retard.
    select user_id, 6, 'hifz',
      format('%s hizb à réviser, le plus ancien depuis %s jours.',
             count(*), max(days_overdue))
    from life.v_hifz_due group by user_id

    union all
    -- Rang 7 : une corrélation nouvellement significative.
    select user_id, 7, 'insight', body
    from life.insights
    where dismissed_at is null and computed_on > current_date - 7
  )
  select distinct on (user_id) user_id, rank, kind, body
  from candidates
  order by user_id, rank, body;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;
