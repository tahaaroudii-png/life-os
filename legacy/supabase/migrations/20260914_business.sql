-- Module BUSINESS — e-commerce COD (COD Partner + autres).
--
-- Additive et idempotente : ne touche à AUCUNE table existante.
--
-- 4 tables :
--   business_settings   — plan CODP, devise, taux de change
--   products            — catalogue (nom, catégorie, prix, coût, poids)
--   product_stock       — quantité par (produit, pays)
--   stock_movements     — journal des mouvements
--   daily_sales         — saisie journalière (leads/confirmés/livrés/…)
--   business_expenses   — charges annexes (pub, agence, tools, …)

-- ============================================================
-- 1. business_settings — 1 ligne par utilisateur
-- ============================================================
create table if not exists public.business_settings (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  plan          text not null default 'free',   -- 'free' | 'free_return' | ...
  currency      text not null default 'USD',    -- devise d'affichage principale
  fx_usd_to_mad numeric default 10,             -- taux optionnel pour double-affichage
  updated_at    timestamptz not null default now()
);

alter table public.business_settings enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_settings' and policyname='bs_select') then
    create policy bs_select on public.business_settings for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_settings' and policyname='bs_insert') then
    create policy bs_insert on public.business_settings for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_settings' and policyname='bs_update') then
    create policy bs_update on public.business_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 2. products
-- ============================================================
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name              text not null,
  sku               text,
  category          text not null default 'gadget',   -- 'gadget'|'cosmetic'|'subscription'
  cost_per_unit_usd numeric,
  sell_price_usd    numeric,
  weight_kg         numeric default 0.5,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists products_user_idx on public.products (user_id, active);

alter table public.products enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_select') then
    create policy products_select on public.products for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_insert') then
    create policy products_insert on public.products for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_update') then
    create policy products_update on public.products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_delete') then
    create policy products_delete on public.products for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 3. product_stock — quantité par produit × pays
-- ============================================================
create table if not exists public.product_stock (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  country    text not null,   -- 'uae'|'ksa'|'kwt'|'qat'|'oma'|'bah'|'irq'
  quantity   integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, product_id, country)
);

create index if not exists product_stock_user_idx on public.product_stock (user_id, product_id);

alter table public.product_stock enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_stock' and policyname='ps_select') then
    create policy ps_select on public.product_stock for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_stock' and policyname='ps_insert') then
    create policy ps_insert on public.product_stock for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_stock' and policyname='ps_update') then
    create policy ps_update on public.product_stock for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_stock' and policyname='ps_delete') then
    create policy ps_delete on public.product_stock for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 4. stock_movements — journal
-- ============================================================
create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  country    text not null,
  delta      integer not null,      -- + réappro, - livraison / casse
  reason     text not null default 'manual',  -- 'restock'|'delivered'|'returned'|'loss'|'transfer'|'manual'
  note       text,
  moved_at   timestamptz not null default now()
);

create index if not exists stock_movements_prod_idx on public.stock_movements (product_id, moved_at desc);

alter table public.stock_movements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stock_movements' and policyname='sm_select') then
    create policy sm_select on public.stock_movements for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='stock_movements' and policyname='sm_insert') then
    create policy sm_insert on public.stock_movements for insert with check (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 5. daily_sales — saisie journalière
-- ============================================================
create table if not exists public.daily_sales (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  country       text not null,
  sale_date     date not null,
  leads         integer not null default 0,
  confirmed     integer not null default 0,
  delivered     integer not null default 0,
  returned      integer not null default 0,
  upsell_count  integer not null default 0,
  ad_spend_usd  numeric not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  unique (user_id, product_id, country, sale_date)
);

create index if not exists daily_sales_user_date_idx on public.daily_sales (user_id, sale_date desc);

alter table public.daily_sales enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_sales' and policyname='ds_select') then
    create policy ds_select on public.daily_sales for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_sales' and policyname='ds_insert') then
    create policy ds_insert on public.daily_sales for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_sales' and policyname='ds_update') then
    create policy ds_update on public.daily_sales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_sales' and policyname='ds_delete') then
    create policy ds_delete on public.daily_sales for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 6. business_expenses — charges annexes (pub, tools, etc.)
-- ============================================================
create table if not exists public.business_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  spent_at    date not null,
  category    text not null default 'other',   -- 'ads_meta'|'ads_tiktok'|'agency'|'tools'|'other'
  amount_usd  numeric not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists be_user_date_idx on public.business_expenses (user_id, spent_at desc);

alter table public.business_expenses enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_expenses' and policyname='be_select') then
    create policy be_select on public.business_expenses for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_expenses' and policyname='be_insert') then
    create policy be_insert on public.business_expenses for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_expenses' and policyname='be_update') then
    create policy be_update on public.business_expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='business_expenses' and policyname='be_delete') then
    create policy be_delete on public.business_expenses for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 7. Trigger auto updated_at (réutilise si déjà défini par une migration précédente)
-- ============================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_business_settings_updated_at on public.business_settings;
create trigger trg_business_settings_updated_at
  before update on public.business_settings
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_product_stock_updated_at on public.product_stock;
create trigger trg_product_stock_updated_at
  before update on public.product_stock
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- 8. Realtime (non bloquant côté app)
-- ============================================================
do $$
declare
  tbl text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['business_settings','products','product_stock','stock_movements','daily_sales','business_expenses'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end$$;
