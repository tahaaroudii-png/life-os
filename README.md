# Life OS

Remplace budget-app. Axes de vie, objectifs 2026, business COD, argent,
ONCF et mémorisation — une seule base, un seul moteur de calcul.

La base est **déjà déployée** sur le projet Supabase existant, dans un
schéma `life` séparé, avec les données de budget-app reprises.

## Démarrer

```bash
npm install
npm run dev
```

Le fichier `.env` doit contenir l'URL et la clé anon du projet Supabase
(les mêmes que budget-app).

## État du déploiement

| Étape | État |
| --- | --- |
| Migrations 0001 → 0012 appliquées | fait |
| Schéma `life` exposé à l'API | fait |
| Droits `authenticated` sur 56 objets | fait |
| Amorçage : 7 axes, 7 objectifs, 7 marchés, 4 enveloppes, 6 rappels | fait |
| Reprise : 306 journaux, 48 transactions, 13 dossiers ONCF | fait |
| Liaison tâches → objectifs annuels (11 liens) | fait |
| Répartition des enveloppes reprise de `settings` (12 000 DH, 50/25/15/10) | fait |
| Reprise de `localStorage` (objectifs, e-commerce) | à lancer depuis Plus → Réglages, dans le navigateur de l'ancienne app |

## Ce qui est corrigé par rapport à budget-app

| Défaut | Correction |
| --- | --- |
| Objectifs et business dans `localStorage` | Tout en Postgres, rien de métier côté navigateur |
| Progression recalculée côté client, écrasée par une copie périmée | `v_goal_progress`, calculée en base, jamais stockée |
| Liaison tâche → objectif par expression régulière sur le titre | `goal_task_links`, une ligne, un mode de contribution |
| Les 7 objectifs codés en dur dans `buildSeed()` | Des lignes, créées par `bootstrap_full()` |
| Deux modules de dates, l'un UTC l'autre local | `src/lib/date.ts`, seul et unique |
| Une habitude est quotidienne ou rien | `cadence` jsonb : quotidien, N fois/semaine, jours choisis, mensuel |
| `done` booléen : sauter casse la série | `status` à cinq valeurs ; `skipped` traverse, `missed` casse |
| Pas de référence : 40 % ne veut rien dire | Réel, attendu à date et projection, toujours ensemble |
| Bilan du soir sans décision | Clôture avec arbitrage obligatoire par tâche ouverte |
| Grille de frais unique, appliquée rétroactivement | `fee_grids` historisée : une marge de juin se calcule avec la grille de juin |
| Verdict produit éphémère | Persisté dans `products.status` avec sa date de bascule |
| Alerte rupture à 14 jours en dur | Au délai de réappro réel du marché (25 jours pour la KSA) |
| Capital publicitaire coché à la main | Calculé : le creux du plan de trésorerie à 4 semaines |
| Pourcentages d'allocation rétroactifs | `allocation_versions` : chaque mois garde les siens |
| Prêt encodé en préfixe `[PRÊT] ` | Une colonne `is_loan` |
| Journal ONCF en texte parsé | `modification_events`, des lignes datées |
| Hizb : un seul compteur | Nouveau et révision séparés, intervalle espacé |
| Duplications réparées à chaque chargement | Idempotence par contrainte unique |

## Les écrans

| Onglet | Contenu |
| --- | --- |
| Aujourd'hui | Conseil du jour, les trois actions prioritaires, anneaux par axe, tâches, clôture du soir |
| Objectifs | Réel, attendu à date, projection, verdict de rythme, objectifs privés masqués |
| Business | Aperçu (net du mois, alertes, décisions), saisie du soir, produits et plafond CPL |
| Argent | Enveloppes, trésorerie à 13 semaines, comptes et rapprochement |
| Plus | Tâches, ONCF, mémorisation, observations, réglages |

## Les règles qui ne se négocient pas

1. Une seule base. `localStorage` ne sert qu'au cache et à l'état d'interface.
2. Un fait est saisi une fois, à un seul endroit.
3. Rien de dérivé n'est stocké. Si un chiffre peut être recalculé, il ne l'est pas.
4. Quatre minutes de saisie par jour, maximum.
5. Jamais un chiffre sans sa référence.
6. Toute ligne porte une date.
7. Un seul module de dates.

## Arborescence

```
src/
  lib/        dates, client Supabase, formats — un module par sujet
  db/         types du schéma life
  domain/     formules pures, testées : cadence, séries, progression
  data/       hooks de données, un par domaine
  features/   un dossier par écran
  ui/         primitives partagées
supabase/
  migrations/ 0001 → 0012, appliquées et idempotentes
  test/       stub Supabase + deux épreuves fonctionnelles, hors ligne
  bundle.sql  les 12 migrations concaténées, sans commentaires
_unreviewed/  fichiers apparus dans le dossier sans passer par cette session —
              NON relus, NON déployés, à examiner ou supprimer
```

## Vérifier

```bash
npm run typecheck   # strict, noUncheckedIndexedAccess compris
npm test            # 33 tests sur le domaine pur
npm run build
```

Les migrations se rejouent hors ligne contre un Postgres local :

```bash
createdb lifetest
psql -d lifetest -f supabase/test/00_stub_supabase.sql
for f in supabase/migrations/0*.sql; do psql -d lifetest -f "$f"; done
psql -d lifetest -f supabase/test/01_functional.sql
psql -d lifetest -f supabase/test/02_full.sql
```

Les deux fichiers de test affichent ce qu'ils attendent à chaque étape :
cadences, séries avec sauts et ratés, plafond CPL, verdicts, couverture
stock, enveloppes, trésorerie, clôture, révision espacée, conseil du jour.

## Ce qui reste

- Le solde d'ouverture des comptes : aucun compte n'est saisi, donc la
  trésorerie part de zéro et la projection sort négative. À renseigner dans
  Argent → Comptes ; tout le reste du calcul est juste.
- Les produits e-commerce : aucun produit actif, donc l'écran Business est
  vide et les objectifs CA 2026 / Profit par mois restent sans valeur.

- Les notifications : les règles et le journal existent en base
  (`reminders`, `notifications_log`), le déclencheur côté navigateur n'est
  pas branché.
- La fermeture automatique de minuit : la fonction `autoclose_days()`
  existe, il faut la planifier (pg_cron ou une Edge Function).
- Le calcul nocturne des corrélations : `compute_insights()` existe et se
  déclenche à la main depuis Observations ; même chose, à planifier.
- L'import des relevés hebdomadaires COD Partner : la table
  `fulfilment_rows` et sa clé d'idempotence existent, l'écran de collage
  n'est pas fait — la saisie passe par le SQL ou par un ajout manuel.
- La file d'attente hors ligne : le service worker met en cache l'app,
  mais les mutations ne sont pas encore mises en file.
