# Budget — suivi personnel par enveloppes

Application web (PWA) de suivi de budget mensuel en DH (MAD), organisée en 4 enveloppes :
**Vie (50%)**, **Réinvestissement (25%)**, **Fond d'urgence (15%, cumulatif)**, **Divertissement (10%)**.

- Connexion par lien magique (email), une seule fois par appareil.
- Vue mobile : 4 cartes enveloppes + saisie rapide en 5 secondes, avec file d'attente hors-ligne.
- Vue PC : tableau de bord (graphiques Chart.js), historique filtrable, export CSV/JSON.
- Synchronisation temps réel entre appareils (Supabase Realtime).

## 1. Lancer l'app en local

Prérequis : [Node.js](https://nodejs.org/) 18+ installé.

```bash
npm install
npm run dev
```

Ouvrez l'URL affichée (`http://localhost:5173`). Les clés Supabase sont déjà dans `.env`
(copiez `.env.example` si vous recréez ce fichier — ne le commitez jamais).

Connexion : entrez votre email, ouvrez le lien reçu **depuis le même navigateur/appareil**.
Vous resterez ensuite connecté automatiquement (session persistée localement).

## 2. Configuration Supabase requise (une seule fois)

Dans le dashboard Supabase → **Authentication → URL Configuration** :

- **Site URL** : `http://localhost:5173` (à remplacer par votre URL Vercel après déploiement)
- **Redirect URLs** (ajoutez les deux) :
  - `http://localhost:5173/**`
  - `https://<votre-app>.vercel.app/**` (à ajouter une fois l'app déployée, voir ci-dessous)

## 3. Déployer gratuitement sur Vercel

1. Poussez ce projet sur un repo GitHub (public ou privé).
2. Sur [vercel.com](https://vercel.com), **Add New → Project**, importez le repo.
   Vercel détecte automatiquement Vite (`npm run build`, dossier `dist`).
3. Dans **Settings → Environment Variables**, ajoutez :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Déployez. Récupérez l'URL générée (ex. `https://budget-app-xxxx.vercel.app`).
5. Retournez dans Supabase → Authentication → URL Configuration et :
   - mettez cette URL en **Site URL**,
   - ajoutez `https://<votre-app>.vercel.app/**` aux **Redirect URLs**.
6. Sur mobile, ouvrez l'URL Vercel dans le navigateur puis **"Ajouter à l'écran d'accueil"**
   (ou l'invite d'installation PWA) pour l'utiliser comme une app.

Chaque futur `git push` redéploie automatiquement sur Vercel.

## Notes techniques

- Les tables `settings`, `transactions`, la RLS et la vue `v_monthly_summary` existent déjà
  côté Supabase et ne sont pas recréées par ce projet.
- Les noms de colonnes utilisés sont centralisés dans `src/lib/schema.js` — si un nom diffère
  de votre schéma réel, c'est le seul fichier à corriger.
- La file d'attente hors-ligne est stockée en IndexedDB (via `idb`) et se vide automatiquement
  dès que la connexion revient.
