\set QUIET on
\pset border 2
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111') on conflict do nothing;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\set U '11111111-1111-1111-1111-111111111111'

\echo '--- 1. bootstrap complet ---'
select life.bootstrap_full();

\echo ''
\echo '--- 2. produit, prix, plafond CPL ---'
insert into life.products (user_id, name, sku, market_key, cogs_usd, status)
values (:'U', 'Speaker à induction', '{SPK-01}', 'KSA', 6.5, 'testing')
on conflict do nothing;
insert into life.product_pricing (user_id, product_id, variant, price, currency, valid_from)
select :'U', id, 'single', 49, 'USD', '2026-01-01' from life.products where name like 'Speaker%'
on conflict do nothing;

\echo 'plafond CPL à 55 % de confirmation et 45 % de livraison :'
select round(price,2) prix, round(cogs,2) cout, round(shipping,2) port,
       round(margin,2) marge, round(cpl_cap,2) plafond
from life.products p, lateral life.f_cpl_cap(p.id, 'single', 0.55, 0.45)
where p.name like 'Speaker%';

\echo ''
\echo '--- 3. campagne, saisie du soir, relevé hebdo ---'
insert into life.campaigns (user_id, product_id, platform, name)
select :'U', id, 'meta', 'SPK KSA' from life.products where name like 'Speaker%'
on conflict do nothing;

insert into life.daily_ads (user_id, day, campaign_id, spend_usd, leads, impressions, clicks)
select :'U', d::date, c.id, 40, 18, 9000, 230
from life.campaigns c, generate_series(current_date - 6, current_date, interval '1 day') d
where c.name = 'SPK KSA'
on conflict do nothing;

insert into life.fulfilment_rows
  (user_id, product_id, market_key, period_start, period_end, confirmed, delivered, returned, revenue_usd, fees_usd)
select :'U', id, 'KSA', current_date - 6, current_date, 62, 31, 9, 1519, 180
from life.products where name like 'Speaker%';

\echo 'KPI sur 7 jours :'
select leads, spend, confirmed, delivered, cpl, cpd,
       round(conf_rate,3) taux_conf, round(deliv_rate,3) taux_liv, net_per_deliv
from life.products p, lateral life.f_product_kpis(p.id, 7) where p.name like 'Speaker%';

\echo 'verdict :'
select verdict, wins, kills, reason
from life.products p, lateral life.f_verdict(p.id, 7) where p.name like 'Speaker%';

\echo ''
\echo '--- 4. stock : le mouvement met à jour la quantité, l''alerte suit le délai de réappro ---'
insert into life.stock_movements (user_id, product_id, market_key, delta, reason)
select :'U', id, 'KSA', 120, 'restock' from life.products where name like 'Speaker%';
update life.product_stock set unit_cost_usd = 6.5 where market_key = 'KSA';
select quantity, coverage_days, lead_time_days, value_locked from life.v_stock_coverage;
select alert, message from life.v_stock_alerts;

\echo ''
\echo '--- 5. bascule de verdict : persistée avec sa date ---'
update life.products set status = 'scaling' where name like 'Speaker%';
select from_status, to_status, changed_on from life.product_status_log;

\echo ''
\echo '--- 6. argent : enveloppes avec la version du mois ---'
insert into life.allocation_versions (user_id, valid_from, monthly_income, shares, emergency_goal)
values (:'U', '2026-01-01', 8000, '{"vie":50,"reinvest":25,"urgence":15,"divertissement":10}', 30000)
on conflict do nothing;
insert into life.accounts (user_id, name, kind, currency, opening_balance)
values (:'U', 'Compte courant', 'bank', 'MAD', 12000) on conflict do nothing;
insert into life.transactions (user_id, account_id, occurred_on, amount, envelope_key, direction, note)
select :'U', a.id, current_date, 1200, 'vie', 'out', 'Courses' from life.accounts a limit 1;
select key, allocated, spent, remaining from life.v_envelope_states order by position;

\echo ''
\echo '--- 7. trésorerie à 13 semaines (4 premières) ---'
update life.cash_settings set salary_amount = 9000, usd_to_mad = 10 where user_id = :'U';
select week_start, salary, cod_in, ad_out, net, running
from life.f_cash_forecast(:'U', 13) limit 4;
\echo 'capital publicitaire disponible (minimum sur 4 semaines) :'
select life.f_ad_capital_available(:'U');

\echo ''
\echo '--- 8. clôture du soir : arbitrage explicite ---'
insert into life.tasks (user_id, axis_key, title, cadence)
values (:'U', 'sante', 'Marche', '{"type":"daily"}') on conflict do nothing;
insert into life.task_logs (user_id, task_id, log_date, status)
select :'U', id, current_date, 'pending' from life.tasks where title = 'Marche'
on conflict do nothing;
select life.close_day(current_date, 3, 4, 'Journée ONCF chargée',
  '{"sante": 45, "business": 120}'::jsonb,
  (select jsonb_build_object(id::text, 'skipped') from life.tasks where title = 'Marche'));
select status from life.task_logs l join life.tasks t on t.id = l.task_id where t.title = 'Marche';
select energy, mood, closed_at is not null as close, auto_closed from life.day_states where day = current_date;
select axis_key, minutes from life.axis_minutes where day = current_date order by axis_key;

\echo ''
\echo '--- 9. mémorisation : révision espacée ---'
select life.record_hifz('new', 1, 60, 5);
select life.record_hifz('review', 1, 60, 5);
select hizb, review_interval_days, last_reviewed_on + review_interval_days as prochaine
from life.hifz_portions;
\echo 'après une révision ratée, l''intervalle retombe à 3 jours :'
select life.record_hifz('review', 1, 60, 2);
select hizb, review_interval_days from life.hifz_portions;

\echo ''
\echo '--- 10. ONCF ---'
insert into life.modifications (user_id, title, engine, stage, priority, due_on)
values (:'U', 'Déflecteurs E1400', 'E1400', 'dossier_redige', 'haute', current_date - 3)
on conflict do nothing;
insert into life.modification_events (user_id, modification_id, kind, body)
select :'U', id, 'call', 'Relancé le fournisseur' from life.modifications;
select title, stage, progress, days_to_due, bucket, event_count from life.v_modifications;

\echo ''
\echo '--- 11. le conseil unique du jour ---'
select rank, kind, body from life.v_advice;
