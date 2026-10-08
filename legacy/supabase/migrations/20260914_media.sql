-- Media buying — campagnes, creatives, stats journalières par créative.
-- Additive et idempotente. Ne touche pas aux tables existantes.

-- 1. campaigns
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  platform    text not null default 'meta',   -- 'meta'|'tiktok'|'google'|'snap'|'other'
  country     text,                            -- pays cible (facultatif)
  product_id  uuid references public.products(id) on delete set null,
  currency    text not null default 'USD',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists campaigns_user_idx on public.campaigns (user_id, active);

alter table public.campaigns enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='camp_select') then
    create policy camp_select on public.campaigns for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='camp_insert') then
    create policy camp_insert on public.campaigns for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='camp_update') then
    create policy camp_update on public.campaigns for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='camp_delete') then
    create policy camp_delete on public.campaigns for delete using (auth.uid() = user_id);
  end if;
end$$;

-- 2. creatives
create table if not exists public.creatives (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id  uuid references public.campaigns(id) on delete set null,
  product_id   uuid references public.products(id) on delete set null,
  name         text not null,
  kind         text not null default 'video',   -- 'video'|'image'|'carousel'|'other'
  hook_text    text,                             -- accroche courte pour se rappeler
  thumb_url    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists creatives_user_idx on public.creatives (user_id, active);
create index if not exists creatives_camp_idx on public.creatives (campaign_id);

alter table public.creatives enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creatives' and policyname='cr_select') then
    create policy cr_select on public.creatives for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creatives' and policyname='cr_insert') then
    create policy cr_insert on public.creatives for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creatives' and policyname='cr_update') then
    create policy cr_update on public.creatives for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creatives' and policyname='cr_delete') then
    create policy cr_delete on public.creatives for delete using (auth.uid() = user_id);
  end if;
end$$;

-- 3. creative_daily — stats journalières par créative
--    (spend + funnel + revenus attribués optionnels)
create table if not exists public.creative_daily (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,
  creative_id            uuid not null references public.creatives(id) on delete cascade,
  stat_date              date not null,
  spend_usd              numeric not null default 0,
  impressions            integer not null default 0,
  clicks                 integer not null default 0,
  leads                  integer not null default 0,
  -- Colonnes d'attribution optionnelles — si tu as un système de tracking
  -- (UTM + landing page → CODP), sinon laisse à 0 et l'attribution se
  -- fait au niveau produit/pays via daily_sales.
  confirmed_attributed   integer not null default 0,
  delivered_attributed   integer not null default 0,
  returned_attributed    integer not null default 0,
  revenue_attributed_usd numeric not null default 0,
  note                   text,
  created_at             timestamptz not null default now(),
  unique (user_id, creative_id, stat_date)
);
create index if not exists cd_user_date_idx on public.creative_daily (user_id, stat_date desc);
create index if not exists cd_creative_idx on public.creative_daily (creative_id, stat_date desc);

alter table public.creative_daily enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_daily' and policyname='cd_select') then
    create policy cd_select on public.creative_daily for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_daily' and policyname='cd_insert') then
    create policy cd_insert on public.creative_daily for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_daily' and policyname='cd_update') then
    create policy cd_update on public.creative_daily for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='creative_daily' and policyname='cd_delete') then
    create policy cd_delete on public.creative_daily for delete using (auth.uid() = user_id);
  end if;
end$$;

-- Realtime
do $$
declare
  tbl text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach tbl in array array['campaigns','creatives','creative_daily'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=tbl
      ) then
        execute format('alter publication supabase_realtime add table public.%I', tbl);
      end if;
    end loop;
  end if;
end$$;
