-- =====================================================================
-- Life OS — Lots 5 et 6 · ONCF, mémorisation, insights, rappels
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ONCF — le journal devient des lignes, pas du texte parsé
-- ---------------------------------------------------------------------
create table if not exists life.modifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null,
  engine     text,
  stage      text not null default 'identified',
  priority   text not null default 'normal',
  due_on     date,
  owner      text,
  closed_on  date,
  legacy_id  uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modif_stage_chk check (stage in
    ('identified','study','validation','procurement','execution','testing','closed')),
  constraint modif_priority_chk check (priority in ('low','normal','high','critical'))
);
create index if not exists modif_user_idx on life.modifications (user_id, stage, due_on);
create unique index if not exists modif_legacy_idx on life.modifications (user_id, legacy_id)
  where legacy_id is not null;
drop trigger if exists trg_modif_updated_at on life.modifications;
create trigger trg_modif_updated_at before update on life.modifications
  for each row execute function life.tg_set_updated_at();
select life.apply_owner_rls('modifications');

create table if not exists life.modification_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  modification_id uuid not null references life.modifications(id) on delete cascade,
  happened_on     date not null default current_date,
  kind            text not null default 'note',
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint me_kind_chk check (kind in ('note','stage_change','call','document','blocker'))
);
create index if not exists me_modif_idx on life.modification_events (modification_id, happened_on desc);
select life.apply_owner_rls('modification_events');

-- Les 7 étapes, et le pourcentage d'avancement qu'elles valent.
create or replace function life.f_stage_progress(p_stage text)
returns numeric language sql immutable set search_path = life, public as $$
  select case p_stage
    when 'identified'  then 0.05 when 'study'       then 0.20
    when 'validation'  then 0.40 when 'procurement' then 0.60
    when 'execution'   then 0.80 when 'testing'     then 0.95
    when 'closed'      then 1.00 else 0 end
$$;

create or replace view life.v_modifications with (security_invoker = true) as
  select m.*,
    life.f_stage_progress(m.stage) as progress,
    case when m.due_on is null or m.stage = 'closed' then null
         else m.due_on - current_date end as days_to_due,
    case
      when m.stage = 'closed' then 'closed'
      when m.due_on is null then 'undated'
      when m.due_on < current_date then 'late'
      when m.due_on - current_date <= 7 then 'imminent'
      else 'ahead'
    end as bucket,
    (select count(*) from life.modification_events e where e.modification_id = m.id) as event_count,
    (select max(happened_on) from life.modification_events e where e.modification_id = m.id) as last_event_on
  from life.modifications m;

-- ---------------------------------------------------------------------
-- 2. Mémorisation — nouveau et révision séparés
--
-- 1 800 versets mémorisés sans plan de révision, ce sont 1 800 versets
-- perdus. Un compteur qui ne mesure que l'accumulation ment.
-- ---------------------------------------------------------------------
create table if not exists life.hifz_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  mode         text not null default 'new',
  hizb         integer,
  surah        integer,
  from_ayah    integer,
  to_ayah      integer,
  verses_count integer not null default 0,
  quality      smallint,
  note         text,
  created_at   timestamptz not null default now(),
  constraint hs_mode_chk check (mode in ('new','review','consolidation')),
  constraint hs_quality_chk check (quality is null or quality between 1 and 5)
);
create index if not exists hs_user_date_idx on life.hifz_sessions (user_id, session_date desc);
select life.apply_owner_rls('hifz_sessions');

create table if not exists life.hifz_portions (
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  hizb                 integer not null,
  memorised_on         date,
  last_reviewed_on     date,
  review_interval_days integer not null default 7,
  strength             smallint not null default 1,
  primary key (user_id, hizb),
  constraint hp_hizb_chk check (hizb between 1 and 60)
);
select life.apply_owner_rls('hifz_portions');

-- Révision espacée : l'intervalle double quand la qualité est bonne,
-- revient à 3 jours quand elle ne l'est pas.
-- integer et non smallint : PostgREST envoie des nombres JSON, et
-- Postgres ne convertit pas implicitement integer en smallint pour
-- choisir une fonction — l'appel échouerait depuis l'app.
drop function if exists life.record_hifz(text, integer, integer, smallint, date);

create or replace function life.record_hifz(
  p_mode text, p_hizb integer, p_verses integer, p_quality integer default null,
  p_date date default current_date)
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  cur life.hifz_portions%rowtype;
  next_interval integer;
begin
  insert into life.hifz_sessions (user_id, session_date, mode, hizb, verses_count, quality)
  values (uid, p_date, p_mode, p_hizb, p_verses, p_quality);

  if p_hizb is null then return jsonb_build_object('ok', true); end if;

  select * into cur from life.hifz_portions where user_id = uid and hizb = p_hizb;
  if not found then
    insert into life.hifz_portions (user_id, hizb, memorised_on, last_reviewed_on,
                                    review_interval_days, strength)
    values (uid, p_hizb,
            case when p_mode = 'new' then p_date end, p_date, 7, 1);
    return jsonb_build_object('created', true, 'next_review', p_date + 7);
  end if;

  next_interval := case
    when p_quality is null then cur.review_interval_days
    when p_quality >= 4 then least(180, cur.review_interval_days * 2)
    when p_quality = 3 then cur.review_interval_days
    else 3
  end;

  update life.hifz_portions set
    memorised_on = coalesce(memorised_on, case when p_mode = 'new' then p_date end),
    last_reviewed_on = p_date,
    review_interval_days = next_interval,
    strength = greatest(1, least(5, coalesce(p_quality, strength)))
  where user_id = uid and hizb = p_hizb;

  return jsonb_build_object('next_review', p_date + next_interval);
end$$;

create or replace view life.v_hifz_due with (security_invoker = true) as
  select user_id, hizb, memorised_on, last_reviewed_on, review_interval_days, strength,
         last_reviewed_on + review_interval_days as due_on,
         current_date - (last_reviewed_on + review_interval_days) as days_overdue
  from life.hifz_portions
  where memorised_on is not null
    and last_reviewed_on + review_interval_days <= current_date;

create or replace view life.v_hifz_summary with (security_invoker = true) as
  select
    p.user_id,
    count(*) filter (where p.memorised_on is not null) as hizb_memorised,
    (select coalesce(sum(verses_count), 0) from life.hifz_sessions s
      where s.user_id = p.user_id and s.mode = 'new') as verses_new,
    (select coalesce(sum(verses_count), 0) from life.hifz_sessions s
      where s.user_id = p.user_id and s.mode = 'review') as verses_reviewed,
    (select count(*) from life.v_hifz_due d where d.user_id = p.user_id) as due_count
  from life.hifz_portions p
  group by p.user_id;

-- ---------------------------------------------------------------------
-- 3. Rappels et journal des notifications
-- ---------------------------------------------------------------------
create table if not exists life.reminders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key           text not null,
  label         text not null,
  at_time       time not null,
  rrule         text not null default 'FREQ=DAILY',
  condition     text,
  active        boolean not null default true,
  snoozed_until timestamptz,
  last_fired_on date,
  unique (user_id, key)
);
select life.apply_owner_rls('reminders');

create table if not exists life.notifications_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reminder_key text,
  fired_at    timestamptz not null default now(),
  shown       boolean not null default false,
  acted       boolean not null default false
);
create index if not exists nl_user_idx on life.notifications_log (user_id, fired_at desc);
select life.apply_owner_rls('notifications_log');

-- Un rappel ignoré trois jours de suite est mis en sommeil : soit la
-- tâche n'est pas la bonne, soit l'heure ne l'est pas. Insister ne sert
-- à rien, et une notification qu'on ignore entraîne à ignorer les autres.
create or replace view life.v_reminder_health with (security_invoker = true) as
  select r.user_id, r.key, r.label, r.active,
    count(n.*) filter (where n.fired_at > now() - interval '14 days') as fired_14d,
    count(n.*) filter (where n.fired_at > now() - interval '14 days' and n.acted) as acted_14d,
    bool_and(not n.acted) filter (where n.fired_at > now() - interval '3 days') as ignored_3d
  from life.reminders r
  left join life.notifications_log n on n.user_id = r.user_id and n.reminder_key = r.key
  group by r.user_id, r.key, r.label, r.active;

-- ---------------------------------------------------------------------
-- 4. Insights — les corrélations, avec leur taille d'effet
-- ---------------------------------------------------------------------
create table if not exists life.insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  computed_on  date not null default current_date,
  kind         text not null,
  subject      text not null,
  body         text not null,
  effect       numeric,
  sample_size  integer,
  confidence   numeric,
  dismissed_at timestamptz,
  acted_at     timestamptz,
  unique (user_id, kind, subject, computed_on)
);
create index if not exists insights_user_idx on life.insights (user_id, computed_on desc);
select life.apply_owner_rls('insights');

grant select, insert, update, delete on all tables in schema life to authenticated;
grant execute on all functions in schema life to authenticated;
