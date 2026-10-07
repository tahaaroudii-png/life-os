-- ---------------------------------------------------------------------
-- 0013 — La liaison tâches → objectifs annuels.
--
-- C'est la demande d'origine : les objectifs annuels ne s'alimentaient pas
-- des tâches cochées chaque jour. Ici on pose les liens réels, à partir des
-- titres des tâches reprises de budget-app.
--
-- Rappel des sémantiques (voir v_goal_day_values dans 0003) :
--   full        — une seule des tâches liées suffit à valider la journée
--   fractional  — il faut TOUTES les tâches liées pour valider la journée
--   increment   — chaque tâche cochée ajoute son poids au cumul
-- ---------------------------------------------------------------------
create or replace function life.link_goals_to_tasks(p_user uuid default auth.uid())
returns integer language plpgsql security invoker set search_path = life, public as $$
declare
  n integer := 0;
  spec jsonb := '[
    {"slug":"salat","contribution":"fractional","weight":1,
     "titles":["Fajr Jama3a","DOHR JAMA3A","3ASR JAMA3A","MAGHRIB JAMA3A","ICHAA JAMA3A"]},
    {"slug":"hizb","contribution":"increment","weight":5,
     "titles":["NHFAD 5 VERSETS BIN LMGHREB O L3CHA"]},
    {"slug":"hizb","contribution":"increment","weight":15,
     "titles":["Quart de hizb"]},
    {"slug":"body","contribution":"full","weight":1,
     "titles":["Pompes immédiatement après réveil","Séance physique","Séance bas du corps"]},
    {"slug":"marti","contribution":"full","weight":1,
     "titles":["Marti — une action aujourd''hui"]}
  ]'::jsonb;
  e jsonb;
  t text;
begin
  for e in select * from jsonb_array_elements(spec) loop
    for t in select * from jsonb_array_elements_text(e->'titles') loop
      insert into life.goal_task_links (user_id, goal_id, task_id, contribution, weight)
      select p_user, g.id, k.id, e->>'contribution', (e->>'weight')::numeric
        from life.goals g, life.tasks k
       where g.user_id = p_user and g.slug = e->>'slug'
         and k.user_id = p_user and k.title = t
      on conflict (goal_id, task_id) do update
        set contribution = excluded.contribution, weight = excluded.weight;
      n := n + 1;
    end loop;
  end loop;
  return n;
end$$;
