-- Épreuve fonctionnelle du lot 1 : amorçage, cadences, séries,
-- adhérence, progression. Chaque bloc affiche ce qu'il attend.
\set QUIET on
\pset border 2

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111')
  on conflict do nothing;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

\echo '--- 1. bootstrap (attendu : 7 axes, 7 objectifs) ---'
select life.bootstrap();
\echo '--- rejeu (attendu : 0 et 0) ---'
select life.bootstrap();

\echo ''
\echo '--- 2. cadences : jour attendu ou non ---'
-- 2026-10-05 est un lundi, 2026-10-10 un samedi.
select
  life.f_day_expected('{"type":"daily"}', date '2026-10-10')                as daily_sam,
  life.f_day_expected('{"type":"weekdays","days":[1,2,3,4,5]}', date '2026-10-10') as semaine_sam,
  life.f_day_expected('{"type":"weekdays","days":[1,2,3,4,5]}', date '2026-10-05') as semaine_lun,
  life.f_day_expected('{"type":"monthly","day":1}', date '2026-10-01')      as mensuel_1,
  life.f_day_expected('{"type":"weekly","times":4}', date '2026-10-05')     as hebdo_jour;
\echo '   attendu : t | f | t | t | f'

\echo ''
\echo '--- 3. tâches de test ---'
insert into life.tasks (user_id, axis_key, title, cadence, start_date)
values
  ('11111111-1111-1111-1111-111111111111', 'spiritualite', 'Fajr',  '{"type":"daily"}', '2026-09-01'),
  ('11111111-1111-1111-1111-111111111111', 'spiritualite', 'Dohr',  '{"type":"daily"}', '2026-09-01'),
  ('11111111-1111-1111-1111-111111111111', 'sante', 'Séance', '{"type":"weekly","times":3}', '2026-09-01'),
  ('11111111-1111-1111-1111-111111111111', 'spiritualite', 'Versets', '{"type":"daily"}', '2026-09-01')
on conflict do nothing;

-- Fajr : 10 jours de suite jusqu'à hier, avec un saut au milieu.
insert into life.task_logs (user_id, task_id, log_date, status)
select '11111111-1111-1111-1111-111111111111', t.id, d::date,
       case when d::date = current_date - 4 then 'skipped' else 'done' end
from life.tasks t, generate_series(current_date - 10, current_date - 1, interval '1 day') d
where t.title = 'Fajr';

-- Dohr : coupé il y a 3 jours par un raté.
insert into life.task_logs (user_id, task_id, log_date, status)
select '11111111-1111-1111-1111-111111111111', t.id, d::date,
       case when d::date = current_date - 3 then 'missed' else 'done' end
from life.tasks t, generate_series(current_date - 10, current_date - 1, interval '1 day') d
where t.title = 'Dohr';

-- Séance : 3 fois par semaine, tenues sur les 3 dernières semaines.
insert into life.task_logs (user_id, task_id, log_date, status)
select '11111111-1111-1111-1111-111111111111', t.id, d::date, 'done'
from life.tasks t,
     generate_series(date_trunc('week', current_date)::date - 21,
                     date_trunc('week', current_date)::date - 1, interval '1 day') d
where t.title = 'Séance'
  and extract(isodow from d) in (1, 3, 5);

\echo '--- séries (attendu : Fajr 9 jours malgré le saut, Dohr 2, Séance 3 semaines) ---'
select title, cadence_type, streak, streak_unit
from life.v_task_streaks order by title;

\echo ''
\echo '--- 4. adhérence sur 30 jours ---'
select t.title, a.expected, a.done
from life.v_task_adherence a join life.tasks t on t.id = a.task_id
where a.days = 30 order by t.title;

\echo ''
\echo '--- 5. liaison vers un objectif cumulatif (Hizb) ---'
insert into life.goal_task_links (user_id, goal_id, task_id, contribution)
select '11111111-1111-1111-1111-111111111111', g.id, t.id, 'increment'
from life.goals g, life.tasks t
where g.slug = 'hizb' and t.title = 'Versets'
on conflict do nothing;

-- 3 versets par jour sur 10 jours, et un jour à 99 pour éprouver daily_max = 6.
insert into life.task_logs (user_id, task_id, log_date, status, value)
select '11111111-1111-1111-1111-111111111111', t.id, d::date, 'done',
       case when d::date = current_date - 2 then 99 else 3 end
from life.tasks t, generate_series(current_date - 9, current_date, interval '1 day') d
where t.title = 'Versets';

\echo '--- valeurs par jour (attendu : 3 partout, 6 le jour plafonné) ---'
select log_date, value from life.v_goal_day_values
where goal_id = (select id from life.goals where slug = 'hizb')
order by log_date desc limit 4;

\echo ''
\echo '--- 6. liaison tout-ou-rien vers les prières ---'
insert into life.goal_task_links (user_id, goal_id, task_id, contribution)
select '11111111-1111-1111-1111-111111111111', g.id, t.id, 'fractional'
from life.goals g, life.tasks t
where g.slug = 'salat' and t.title in ('Fajr', 'Dohr')
on conflict do nothing;

\echo '--- progression (réel, attendu à date, projection, facteur) ---'
select slug, kind,
       round(real_value, 1)       as reel,
       round(target_value, 0)     as cible,
       round(expected_value, 0)   as attendu,
       round(projected_value, 0)  as projete,
       round(pace_factor, 2)      as facteur,
       life.f_pace_verdict(pace_factor) as verdict,
       round(required_per_day, 2) as par_jour
from life.v_goal_progress
where kind in ('habit', 'cumulative')
order by slug;

\echo ''
\echo '--- 7. reprise depuis l''ancienne app ---'
insert into public.tasks (id, user_id, axis, title, type, created_at)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'famille', 'Appeler maman', 'habit', now() - interval '30 days')
on conflict do nothing;
insert into public.task_logs (user_id, task_id, log_date, done)
select '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', d::date, true
from generate_series(current_date - 5, current_date - 1, interval '1 day') d
on conflict do nothing;

select life.import_legacy();
\echo '--- rejeu (attendu : 0 et 0) ---'
select life.import_legacy();
select title, cadence->>'type' as cadence from life.tasks where legacy_id is not null;
