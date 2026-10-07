-- =====================================================================
-- Life OS — Correctif : le vocabulaire ONCF reste en français
--
-- Les étapes et priorités déjà saisies dans budget-app sont en français :
--   identifie · etude · prototype · validation · dossier_redige ·
--   deploiement_serie · cloture
--   basse · moyenne · haute · critique
--
-- On garde CE vocabulaire plutôt que de le traduire vers un jeu anglais.
-- Traduire un domaine métier qu'on ne possède pas fait perdre de
-- l'information et oblige à retraduire dans l'autre sens à chaque lecture.
-- =====================================================================

alter table life.modifications drop constraint if exists modif_stage_chk;
alter table life.modifications drop constraint if exists modif_priority_chk;

alter table life.modifications add constraint modif_stage_chk check (stage in
  ('identifie','etude','prototype','validation','dossier_redige','deploiement_serie','cloture'));
alter table life.modifications add constraint modif_priority_chk check (priority in
  ('basse','moyenne','haute','critique'));
alter table life.modifications alter column stage set default 'identifie';
alter table life.modifications alter column priority set default 'moyenne';

create or replace function life.f_stage_progress(p_stage text)
returns numeric language sql immutable set search_path = life, public as $$
  select case p_stage
    when 'identifie'         then 0.05
    when 'etude'             then 0.20
    when 'prototype'         then 0.40
    when 'validation'        then 0.55
    when 'dossier_redige'    then 0.70
    when 'deploiement_serie' then 0.85
    when 'cloture'           then 1.00
    else 0 end
$$;

create or replace view life.v_modifications with (security_invoker = true) as
  select m.*,
    life.f_stage_progress(m.stage) as progress,
    case when m.due_on is null or m.stage = 'cloture' then null
         else m.due_on - current_date end as days_to_due,
    case
      when m.stage = 'cloture' then 'closed'
      when m.due_on is null then 'undated'
      when m.due_on < current_date then 'late'
      when m.due_on - current_date <= 7 then 'imminent'
      else 'ahead'
    end as bucket,
    (select count(*) from life.modification_events e where e.modification_id = m.id) as event_count,
    (select max(happened_on) from life.modification_events e where e.modification_id = m.id) as last_event_on
  from life.modifications m;

-- La reprise passe les valeurs telles quelles et récupère aussi l'engin
-- et le journal, qui existaient déjà dans l'ancienne table.
create or replace function life.import_legacy_sql()
returns jsonb language plpgsql security invoker set search_path = life, public as $$
declare
  uid uuid := auth.uid();
  n_tx integer := 0;
  n_modif integer := 0;
  n_notes integer := 0;
  tasks_json jsonb;
begin
  if uid is null then raise exception 'session authentifiée requise'; end if;
  tasks_json := life.import_legacy();

  if to_regclass('public.transactions') is not null then
    insert into life.transactions
      (user_id, occurred_on, amount, currency, direction, envelope_key, is_loan, note, legacy_id)
    select uid, o.occurred_at::date, o.amount, 'MAD', 'out', o.envelope,
           coalesce(o.note, '') like '[PRÊT]%',
           nullif(regexp_replace(coalesce(o.note, ''), '^\[PRÊT\]\s*', ''), ''),
           o.id
    from public.transactions o
    where o.user_id = uid
    on conflict do nothing;
    get diagnostics n_tx = row_count;
  end if;

  if to_regclass('public.modifications') is not null then
    insert into life.modifications
      (user_id, title, engine, stage, priority, due_on, legacy_id, created_at)
    select uid, o.title, o.equipment, o.stage::text, o.priority::text, o.due_date, o.id, o.created_at
    from public.modifications o
    where o.user_id = uid
    on conflict do nothing;
    get diagnostics n_modif = row_count;

    insert into life.modification_events (user_id, modification_id, happened_on, kind, body)
    select uid, nm.id, coalesce(o.created_at::date, current_date), 'note', o.notes
    from public.modifications o
    join life.modifications nm on nm.user_id = uid and nm.legacy_id = o.id
    where o.user_id = uid and coalesce(o.notes, '') <> ''
      and not exists (select 1 from life.modification_events e where e.modification_id = nm.id);
    get diagnostics n_notes = row_count;
  end if;

  return tasks_json || jsonb_build_object(
    'transactions', n_tx, 'modifications', n_modif, 'modification_notes', n_notes);
end$$;

grant execute on all functions in schema life to authenticated;
