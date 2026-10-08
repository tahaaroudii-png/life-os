-- Bilan quotidien : à 21h30 l'app propose de saisir la raison des tâches
-- non faites (habitudes / défis / ponctuelles). Une ligne par jour et par
-- utilisateur — la contrainte d'unicité évite les doublons multi-appareils.

create table if not exists public.daily_reviews (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  review_date       date not null,
  reason            text,
  incomplete_count  integer,
  total_count       integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, review_date)
);

create index if not exists daily_reviews_user_date_idx on public.daily_reviews (user_id, review_date desc);

alter table public.daily_reviews enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_reviews' and policyname='daily_reviews_select_own') then
    create policy daily_reviews_select_own on public.daily_reviews for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_reviews' and policyname='daily_reviews_insert_own') then
    create policy daily_reviews_insert_own on public.daily_reviews for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_reviews' and policyname='daily_reviews_update_own') then
    create policy daily_reviews_update_own on public.daily_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_reviews' and policyname='daily_reviews_delete_own') then
    create policy daily_reviews_delete_own on public.daily_reviews for delete using (auth.uid() = user_id);
  end if;
end$$;

-- updated_at auto (réutilise la fonction publique si elle existe déjà via
-- la migration ONCF ; on la crée par défensivement au cas où).
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

drop trigger if exists trg_daily_reviews_updated_at on public.daily_reviews;
create trigger trg_daily_reviews_updated_at
  before update on public.daily_reviews
  for each row execute function public.tg_set_updated_at();

-- Realtime (non bloquant côté app)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='daily_reviews'
    ) then
      execute 'alter publication supabase_realtime add table public.daily_reviews';
    end if;
  end if;
end$$;
