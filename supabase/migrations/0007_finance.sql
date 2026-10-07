-- =====================================================================
-- Life OS — Lot 4 · Argent, du salaire ONCF au cash COD
--
-- Le module Budget de l'ancienne app était juste mais isolé : le salaire
-- et les enveloppes d'un côté, le cash du business de l'autre, et aucune
-- rencontre. C'est pourtant le même portefeuille. Trois corrections :
--   1. les pourcentages d'allocation sont historisés — l'ancienne app
--      appliquait le taux courant rétroactivement à tous les mois passés,
--      ce que son propre code appelait une « simplification assumée » ;
--   2. un prêt est une colonne, plus un préfixe '[PRÊT] ' dans une note,
--      où un espace de trop le faisait disparaître des totaux ;
--   3. un plan de trésorerie à 13 semaines, qui est ce qui doit ouvrir ou
--      fermer le verrou « capital publicitaire » au lieu d'une case cochée.
-- =====================================================================

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

-- Chaque mois utilise la version en vigueur ce mois-là.
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

-- ---------------------------------------------------------------------
-- Enveloppes : alloué, dépensé, restant — avec la version du mois
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Trésorerie à 13 semaines
--
-- C'est le chiffre qui doit t'empêcher de scaler un produit rentable avec
-- de l'argent que tu n'as pas encore encaissé.
--
-- Encaissements COD : les livraisons de la semaine, décalées du délai de
-- versement de la plateforme (paramètre `payout_lag_days`).
-- ---------------------------------------------------------------------
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

  -- Solde de départ : tous les comptes, convertis en dollars.
  select coalesce(sum(case when currency = 'MAD'
                           then computed_balance / nullif(cs.usd_to_mad, 0)
                           else computed_balance end), 0)
    into bal from life.v_cash_position where user_id = p_user;

  -- Rythme hebdomadaire observé sur 30 jours : dépense pub et livraisons.
  select coalesce(sum(spend_usd), 0) / 30 * 7 into ad_rate
    from life.daily_ads where user_id = p_user and day > current_date - 30;
  select coalesce(sum(revenue_usd - fees_usd), 0) / 30 * 7 into deliv_rate
    from life.fulfilment_rows where user_id = p_user and period_end > current_date - 30;

  for i in 0 .. p_weeks - 1 loop
    week_start := start_w + (7 * i);
    -- Un test sur les bornes de la semaine rate le salaire dès qu'elle
    -- chevauche deux mois : on regarde chacun de ses sept jours.
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

-- Le verrou « capital publicitaire » : calculé, plus coché à la main.
create or replace function life.f_ad_capital_available(p_user uuid)
returns numeric language sql stable set search_path = life, public as $$
  select round(min(running), 2)
  from life.f_cash_forecast(p_user, 4)
$$;

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;
