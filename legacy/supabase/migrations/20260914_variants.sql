-- Produits → variants (SKUs).
--
-- Modèle : 1 produit (concept, ex. "Speaker 5-in-1") peut avoir 1..N variants
-- (SKUs distincts, ex. Black / White) qui portent chacun leur stock, leur
-- coût/prix/poids, et sont ce à quoi les daily_sales font référence.
--
-- Backward compat : un produit existant sans variant est auto-migré en
-- variant unique reprenant ses champs (sku/coût/prix/poids). Rien à faire
-- côté app pour les produits déjà là.
--
-- Additive et idempotente.

-- ============================================================
-- 1. product_variants
-- ============================================================
create table if not exists public.product_variants (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id        uuid not null references public.products(id) on delete cascade,
  sku               text,                        -- SKU unique dans la portée user
  label             text,                        -- "Black", "White", "L", "XL", "Défaut"
  cost_per_unit_usd numeric,                     -- override (nullable → fallback produit)
  sell_price_usd    numeric,
  weight_kg         numeric,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create unique index if not exists product_variants_user_sku_uidx on public.product_variants (user_id, sku) where sku is not null;
create index if not exists product_variants_product_idx on public.product_variants (product_id);

alter table public.product_variants enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_variants' and policyname='pv_select') then
    create policy pv_select on public.product_variants for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_variants' and policyname='pv_insert') then
    create policy pv_insert on public.product_variants for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_variants' and policyname='pv_update') then
    create policy pv_update on public.product_variants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_variants' and policyname='pv_delete') then
    create policy pv_delete on public.product_variants for delete using (auth.uid() = user_id);
  end if;
end$$;

-- ============================================================
-- 2. Ajouter variant_id aux tables qui référencent un produit vendable
-- ============================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='product_stock' and column_name='variant_id') then
    alter table public.product_stock add column variant_id uuid references public.product_variants(id) on delete cascade;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='daily_sales' and column_name='variant_id') then
    alter table public.daily_sales add column variant_id uuid references public.product_variants(id) on delete cascade;
  end if;
end$$;

-- ============================================================
-- 3. Backfill : pour chaque produit existant qui n'a pas encore de variant,
--    créer un "Défaut" reprenant les infos du produit. Idempotent.
-- ============================================================
insert into public.product_variants (id, user_id, product_id, sku, label, cost_per_unit_usd, sell_price_usd, weight_kg, active)
select gen_random_uuid(), p.user_id, p.id, p.sku,
       coalesce(nullif(p.sku, ''), 'Défaut'),
       p.cost_per_unit_usd, p.sell_price_usd, p.weight_kg, p.active
from public.products p
where not exists (select 1 from public.product_variants v where v.product_id = p.id);

-- ============================================================
-- 4. Backfill : lier chaque row product_stock / daily_sales existante
--    au variant "Défaut" de son produit
-- ============================================================
update public.product_stock ps
set variant_id = v.id
from public.product_variants v
where v.product_id = ps.product_id
  and v.user_id = ps.user_id
  and ps.variant_id is null;

update public.daily_sales ds
set variant_id = v.id
from public.product_variants v
where v.product_id = ds.product_id
  and v.user_id = ds.user_id
  and ds.variant_id is null;

-- ============================================================
-- 5. Contraintes d'unicité au niveau variant (permet plusieurs SKU
--    par (produit, pays) pour supporter les vraies variantes).
--    Les anciennes contraintes product_id-based restent pour ne pas casser
--    les inserts legacy — l'app cible variant_id désormais.
-- ============================================================
create unique index if not exists product_stock_variant_country_uidx
  on public.product_stock (user_id, variant_id, country)
  where variant_id is not null;

create unique index if not exists daily_sales_variant_date_uidx
  on public.daily_sales (user_id, variant_id, country, sale_date)
  where variant_id is not null;

-- ============================================================
-- 6. Realtime
-- ============================================================
do $$
declare
  tbl text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['product_variants'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end$$;
