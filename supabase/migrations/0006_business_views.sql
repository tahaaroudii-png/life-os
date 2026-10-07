-- =====================================================================
-- Life OS — Lot 3 · Le calcul business
--
-- Les formules de lib/ecom.js, descendues en SQL. Elles ne changent pas
-- de valeur ; elles changent de place, pour que le téléphone et le
-- portable lisent le même chiffre et qu'un chiffre devienne testable
-- par une requête.
-- =====================================================================

-- La grille de frais en vigueur à une date. C'est la correction clé :
-- une marge de juin se calcule avec la grille de juin.
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

-- Prix en vigueur d'une variante à une date.
create or replace function life.f_price(p_product uuid, p_variant text, p_on date)
returns numeric language sql stable set search_path = life, public as $$
  select price from life.product_pricing
   where product_id = p_product and variant = p_variant and valid_from <= p_on
   order by valid_from desc limit 1
$$;

-- Coût produit d'une livraison : un lot de 2 coûte deux fois le produit.
create or replace function life.f_cogs(p_cogs numeric, p_variant text)
returns numeric language sql immutable set search_path = life, public as $$
  select p_cogs * case p_variant when 'bundle2' then 2 when 'bundle3' then 3 else 1 end
$$;

-- ---------------------------------------------------------------------
-- Marge par livraison et plafond CPL
--
--   M       = P - F - E - L - (k + x)·P - A
--   plafond = c·d·M - f_lead - c·f_conf - c·(1-d)·f_retour
--
-- Au-dessus du plafond, chaque lead acheté coûte de l'argent.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- KPI produit sur une fenêtre glissante
--
-- Les leads et la dépense viennent de la saisie du soir ; les confirmés,
-- livrés et revenus des relevés hebdomadaires. Jamais l'inverse.
-- ---------------------------------------------------------------------
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
    -- Un relevé couvre une période : on ne garde que ceux qui finissent
    -- dans la fenêtre, pour ne pas compter deux fois un chevauchement.
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

-- ---------------------------------------------------------------------
-- Verdict : SCALE / OPTIMISER / KILL / EN TEST
--
-- En dessous de l'échantillon minimum, le verdict reste EN TEST et aucune
-- décision n'est proposée. Trancher sur 6 confirmés, c'est du bruit.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Vues de lecture
-- ---------------------------------------------------------------------
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

-- Couverture stock : l'alerte se déclenche au délai de réappro du marché,
-- pas à 14 jours en dur. Si le réappro prend 25 jours, 14 arrive trop tard.
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

-- Le net d'une période : revenus des relevés moins dépense pub et frais.
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
