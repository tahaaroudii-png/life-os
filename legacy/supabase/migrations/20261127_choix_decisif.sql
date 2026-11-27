-- Choix décisif : le cadre de décision pour le choix de l'épouse.
--
-- Trois tables seulement, et une règle qui n'est PAS dans le schéma mais dans
-- src/lib/mariage.js : un critère éliminatoire répondu NON ferme le dossier,
-- quel que soit le score. Le score ne départage que les dossiers qui passent
-- tous les éliminatoires.
--
-- Les éliminatoires portent weight = 0 et max_score = 1 : ils ne donnent pas
-- de points, ils ouvrent ou ils ferment.

create table if not exists public.marriage_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  category text not null check (category in ('eliminatoire', 'decisif', 'bonus')),
  label text not null,
  weight int not null default 1,
  max_score int not null default 5,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.marriage_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  status text not null default 'en_cours'
    check (status in ('en_cours', 'eliminee', 'retenue', 'fermee')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- La contrainte unique est ce qui rend l'upsert possible : recocher un critère
-- corrige la réponse au lieu d'empiler des lignes.
create table if not exists public.marriage_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_id uuid not null references public.marriage_candidates(id) on delete cascade,
  criterion_id uuid not null references public.marriage_criteria(id) on delete cascade,
  passed boolean,
  score int,
  updated_at timestamptz not null default now(),
  unique (candidate_id, criterion_id)
);

alter table public.marriage_criteria enable row level security;
alter table public.marriage_candidates enable row level security;
alter table public.marriage_scores enable row level security;

create policy "own criteria" on public.marriage_criteria
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own candidates" on public.marriage_candidates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own scores" on public.marriage_scores
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
