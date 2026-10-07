-- =====================================================================
-- Life OS — Lot 3 · Business COD
--
-- Reprend la logique de lib/ecom.js, qui était juste, et corrige trois
-- choses qu'un état localStorage ne pouvait pas porter :
--   1. la grille de frais est historisée — changer de plan COD Partner ne
--      doit pas réécrire rétroactivement les marges passées ;
--   2. le verdict est persisté avec sa date de bascule, pour pouvoir
--      répondre à « combien de temps ce produit est resté en SCALE » ;
--   3. plus aucun mouvement « non daté » : ils étaient invisibles dans
--      toutes les fenêtres glissantes, donc dans tous les KPI.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Référentiels
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 2. Produits et prix
-- ---------------------------------------------------------------------
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

-- Historisé : un changement de prix n'invalide plus les marges passées.
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

-- Journal des bascules de verdict : sans lui, impossible de mesurer sa
-- propre vitesse de décision.
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

-- ---------------------------------------------------------------------
-- 3. Campagnes et saisie du soir
--
-- La saisie du soir ne porte QUE ce que Meta et TikTok montrent :
-- dépense et leads. Les confirmés et livrés viennent du relevé
-- hebdomadaire, jamais de la mémoire du soir.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 4. Relevés hebdomadaires — la seule source des confirmés et livrés
-- ---------------------------------------------------------------------
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
-- Rejouer le même relevé ne crée pas de doublon.
create unique index if not exists fr_hash_idx on life.fulfilment_rows (user_id, import_hash)
  where import_hash is not null;
select life.apply_owner_rls('fulfilment_rows');

-- ---------------------------------------------------------------------
-- 5. Stock
-- ---------------------------------------------------------------------
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

-- Le stock suit automatiquement ses mouvements : deux chiffres qui peuvent
-- diverger finissent toujours par diverger.
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
