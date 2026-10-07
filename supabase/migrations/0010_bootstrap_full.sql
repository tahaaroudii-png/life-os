-- =====================================================================
-- Life OS — Amorçage complet et reprise de budget-app
--
--   life.bootstrap_full()     axes, objectifs, marchés, enveloppes,
--                             grille de frais, rappels — tout d'un coup
--   life.import_legacy_sql()  reprend ce qui est déjà en Postgres
--   life.import_legacy_json() reprend ce qui dormait dans localStorage
-- =====================================================================

-- Les entrées d'objectif saisies à la main, sans tâche derrière.
-- L'historique de l'ancienne app en est plein : des mois de progression
-- qui n'ont pas de log Planning correspondant. Les jeter reviendrait à
-- repartir de zéro sur des objectifs déjà à moitié faits.
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

-- Clés d'origine, pour que les reprises soient rejouables sans doublon.
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

  -- Marchés du Golfe, avec leur délai de réappro réel. C'est ce délai,
  -- pas 14 jours en dur, qui déclenche l'alerte de rupture.
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

-- ---------------------------------------------------------------------
-- Reprise des tables Postgres de budget-app : transactions et ONCF,
-- en plus des tâches déjà reprises par life.import_legacy().
-- ---------------------------------------------------------------------
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

  -- Transactions : le préfixe '[PRÊT] ' devient une vraie colonne.
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

  -- ONCF : le journal en texte libre devient des lignes datées.
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

-- ---------------------------------------------------------------------
-- Reprise de ce qui dormait dans localStorage
--
-- `goals.v1` et `ecom.v2` n'ont jamais quitté le navigateur. L'app
-- exporte les deux en un seul JSON, et cette fonction l'avale.
-- Idempotente : un second appel ne duplique rien.
-- ---------------------------------------------------------------------
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

  -- a) goals.v1 : les entrées quotidiennes des habitudes, par slug.
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

  -- b) ecom.v2 : produits, prix, campagnes, saisie quotidienne, stock.
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
