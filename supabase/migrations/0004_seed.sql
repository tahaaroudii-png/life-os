-- =====================================================================
-- Life OS — Lot 1 · Migration 4/4 : amorçage et reprise
--
-- Deux fonctions, appelées par l'app, jamais par une migration :
--   life.bootstrap()      crée les axes et les objectifs 2026 s'ils manquent
--   life.import_legacy()  reprend tâches et journaux de l'ancienne app
--
-- Les deux sont idempotentes : les rejouer ne duplique rien.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. bootstrap — les 7 axes et les 7 objectifs, pour l'utilisateur courant
-- ---------------------------------------------------------------------
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

  -- Les objectifs de la carte manuscrite « What do I want to achieve by end 2026 ».
  -- starts_on est au 1er janvier : c'est la fenêtre de l'objectif, pas celle
  -- du suivi. À corriger objectif par objectif si le suivi a commencé plus tard,
  -- sinon l'attendu à date est calculé sur une période où rien n'était mesuré.
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

  -- Jalons : ce qui permet de corriger en avril plutôt qu'en décembre.
  if g_hizb is not null and not exists (
       select 1 from life.goal_milestones where goal_id = g_hizb) then
    insert into life.goal_milestones (user_id, goal_id, label, due_on, target_value)
    values
      (uid, g_hizb, '450 versets',   '2026-03-31', 450),
      (uid, g_hizb, '900 versets',   '2026-06-30', 900),
      (uid, g_hizb, '1 350 versets', '2026-09-30', 1350),
      (uid, g_hizb, '1 800 versets', '2026-12-31', 1800);
  end if;

  -- Les verrous de l'objectif profit : manuels au lot 1, calculés au lot 4.
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

-- ---------------------------------------------------------------------
-- 2. import_legacy — reprise depuis les tables de l'ancienne app
--
-- Les anciennes `public.tasks` / `public.task_logs` n'ont ni cadence ni
-- statut : on traduit. `done = true` devient `done`, `done = false`
-- devient `missed` pour un jour passé et `pending` pour aujourd'hui —
-- un jour non clos ne doit pas casser une série rétroactivement.
--
-- La correspondance des tâches se fait sur l'identifiant d'origine, gardé
-- dans `legacy_id`, pour que la fonction puisse être rejouée.
-- ---------------------------------------------------------------------
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
