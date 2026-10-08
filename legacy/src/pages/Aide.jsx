/**
 * Manuel d'utilisation — ultra simple, un seul écran qui se lit en 3 min.
 * Écrit en langage naturel, tutoiement, aucun jargon. Chaque section = une
 * action ou une question concrète.
 */
export default function Aide() {
  return (
    <div className="page-aide">
      <div className="page-header">
        <h1>Comment utiliser l'app</h1>
      </div>

      <p className="aide-intro">
        Cette app te sert à quatre choses. Pour chacune, tu ouvres, tu tapes quelques chiffres,
        tu regardes le résultat. Rien d'autre.
      </p>

      <Section emoji="💰" title="Budget — où va ton salaire ONCF">
        <p><strong>Ce que ça fait</strong> : à chaque salaire, ton argent est réparti en 4 enveloppes (Vie / Réinvestissement / Fond d'urgence / Divertissement). Chaque dépense entre dans une enveloppe, tu vois en temps réel ce qu'il reste.</p>
        <ol>
          <li>Tu as reçu ton salaire → il est déjà réparti automatiquement selon les % dans <strong>Réglages</strong>.</li>
          <li>Tu dépenses 200 DH d'essence → tape le bouton <kbd>+</kbd> en bas → 200 → Vie → OK. 3 secondes.</li>
          <li>Regarde l'écran <strong>Accueil</strong> : le cercle de chaque enveloppe montre consommé ou restant (tape pour basculer).</li>
        </ol>
        <p className="muted small"><strong>Écran Analyse</strong> = les tendances mois par mois. À ouvrir une fois par mois, pas plus.</p>
      </Section>

      <Section emoji="✅" title="Planning — les 7 axes de ta vie">
        <p><strong>Ce que ça fait</strong> : chaque jour tu coches ce que tu fais (prière, sport, business, famille…). L'app compte les jours d'affilée (streak) pour te faire tenir dans la durée.</p>
        <ol>
          <li>Va dans <strong>Tâches</strong> → crée tes habitudes (Fajr, sport, Coran…). Tu ne le fais qu'une seule fois.</li>
          <li>Chaque jour, ouvre <strong>Aujourd'hui</strong> → coche ce que tu as fait. Point.</li>
          <li>Un défi progressif (pompes) affiche automatiquement l'objectif du jour (10, 11, 12…).</li>
          <li>Le soir à 21h30, si tu as raté des trucs, l'app te demande pourquoi. Réponds en une phrase — c'est pour analyser tes patterns.</li>
        </ol>
        <p className="muted small">Si tu pratiques déjà une habitude depuis 20 jours dans la vraie vie : Tâches → 🔥 Seed → 20. Ton streak démarre à 20.</p>
      </Section>

      <Section emoji="🚂" title="ONCF — tes modifications techniques">
        <p><strong>Ce que ça fait</strong> : remplace ton carnet papier. Tu suis chaque modification à travers les 7 étapes (Identifié → Étude → … → Clôturé).</p>
        <ol>
          <li>Bouton <strong>+ Nouvelle modification</strong> en haut → titre, engin, priorité, échéance.</li>
          <li>Vue <strong>🎯 Priorité</strong> par défaut : ce qui est en retard s'affiche en rouge en haut. Tu vois quoi faire en premier.</li>
          <li>Pour chaque modif, tape dans <strong>Journal</strong> ce que tu viens de faire ("appelé fournisseur", "reçu accord"). L'app garde l'historique daté.</li>
          <li>Change l'étape avec le menu déroulant sur la carte quand elle avance.</li>
        </ol>
        <p className="muted small"><strong>Kanban</strong> (7 colonnes) est là si tu veux voir tout le pipeline d'un coup — pas pour prioriser.</p>
      </Section>

      <Section emoji="🛒" title="E-commerce — ton business dropshipping COD">
        <p><strong>Ce que ça fait</strong> : suit tout ton business en une seule table de mouvements. Recettes, pub, stock, frais. Une seule règle stricte : chaque dépense de pub doit être rattachée à un produit + une campagne. Sinon impossible d'analyser.</p>

        <h3 style={{ marginBottom: '0.35rem' }}>Chaque soir — 2 minutes</h3>
        <ol>
          <li>Ouvre <strong>Saisie soir</strong>.</li>
          <li>Pour chaque campagne active, tape la dépense pub d'aujourd'hui + le nombre de leads que Meta / TikTok t'a montrés.</li>
          <li>Bouton <strong>Enregistrer la journée</strong>. Fini.</li>
        </ol>

        <h3 style={{ marginBottom: '0.35rem' }}>Chaque lundi — 10 minutes</h3>
        <ol>
          <li>Va dans <strong>Import</strong>. Colle le relevé CODPartner reçu par email (ou charge le Google Sheet).</li>
          <li>Vérifie l'aperçu, valide.</li>
          <li>Ouvre <strong>Produits</strong> : regarde la colonne <em>Verdict</em>. SCALE = pousse le budget. KILL = coupe. EN TEST = laisse tourner encore.</li>
        </ol>

        <h3 style={{ marginBottom: '0.35rem' }}>Chaque 1ᵉʳ du mois — 30 minutes</h3>
        <ol>
          <li><strong>Réglages → Exporter JSON</strong>. Range le fichier quelque part (Drive, mail à toi-même).</li>
          <li>Vérifie les soldes plateformes et le stock physique (Réglages).</li>
          <li>Ouvre l'<strong>Aperçu</strong> et regarde l'alerte : si "publicité {'>'} 45 %", tu brûles trop de cash pour trop peu de retour.</li>
        </ol>

        <div className="aide-callout">
          <strong>Le seul chiffre à regarder tous les jours</strong> : le net total (grand chiffre coloré en haut d'Aperçu).
          Vert = tu gagnes. Rouge = tu perds. Le reste est du détail pour comprendre pourquoi.
        </div>
      </Section>

      <Section emoji="🔐" title="Connexion et sécurité">
        <ul>
          <li><strong>Première fois</strong> : tu reçois un lien magique par email → tu cliques → tu es connecté.</li>
          <li><strong>Ensuite</strong> : va dans Budget → Réglages → Sécurité → crée un code à 6 chiffres. Prochaines fois, tu tapes juste l'email + le code, plus besoin d'email.</li>
          <li><strong>Ta session dure ~30 jours</strong>. Si tu ouvres l'app régulièrement, tu ne te reconnecteras quasi jamais.</li>
          <li><strong>Tes données</strong> : Budget / Planning / ONCF sont chez Supabase (privé, sécurisé, sync entre appareils). E-commerce est <strong>uniquement dans ton navigateur</strong> (localStorage) — pense à l'export JSON tous les mois.</li>
        </ul>
      </Section>

      <Section emoji="📱" title="Installer sur ton téléphone">
        <ul>
          <li><strong>Android</strong> : ouvre l'app dans Chrome → menu ⋮ → "Ajouter à l'écran d'accueil".</li>
          <li><strong>iPhone</strong> : ouvre dans Safari (pas Chrome) → bouton partage → "Sur l'écran d'accueil".</li>
          <li>Une fois installée, elle marche <strong>hors-ligne</strong> (sauf la sync Supabase qui reprend dès que tu es à nouveau connecté).</li>
        </ul>
      </Section>

      <Section emoji="⏰" title="Notifications">
        <p>Va dans <strong>Planning → Tâches → Rappels par axe</strong> → "Autoriser les notifications" une seule fois. Ensuite :</p>
        <ul>
          <li>Une notif sonne quand une tâche du jour a une heure prévue (ex. prière du Fajr à 6h).</li>
          <li>À 21h30, une notif persistante te rappelle le bilan du soir tant que tu n'as pas répondu.</li>
        </ul>
        <p className="muted small">Sur iPhone, il faut avoir installé l'app à l'écran d'accueil pour recevoir les notifs.</p>
      </Section>

      <Section emoji="🆘" title="Questions courantes">
        <details>
          <summary>J'ai perdu mon code d'accès</summary>
          <p>Clique "Recevoir un lien magique" sur l'écran de login → connecte-toi par email → va dans Budget → Réglages → change ton code.</p>
        </details>
        <details>
          <summary>J'ai fait une erreur en ajoutant une dépense / une tâche</summary>
          <p>Va dans l'écran <strong>Historique</strong> (Budget) ou <strong>Tout voir</strong> (autres) → clique sur la ligne → Modifier ou Supprimer.</p>
        </details>
        <details>
          <summary>Mes streaks sont à 0 alors que je pratique depuis longtemps</summary>
          <p>Planning → Tâches → clique <strong>🔥 Seed</strong> sur l'habitude → tape le nombre de jours réels que tu pratiques hors aujourd'hui.</p>
        </details>
        <details>
          <summary>Le bilan du soir m'a soûlé, comment le désactiver ?</summary>
          <p>Il ne peut pas être coupé (c'est fait exprès pour instaurer la discipline). Mais tu peux "Snooze 15 min" — si tu n'as vraiment rien à dire, mets juste "RAS" et clique Enregistrer.</p>
        </details>
        <details>
          <summary>Comment sauvegarder mes données E-commerce ?</summary>
          <p>E-commerce → Réglages → Exporter JSON. Fais-le une fois par mois. Range le fichier ailleurs que sur le téléphone (Drive, mail).</p>
        </details>
      </Section>

      <p className="muted small aide-footer">
        Un truc ne marche pas ? Note ce que tu vois et envoie-le. On corrige.
      </p>
    </div>
  )
}

function Section({ emoji, title, children }) {
  return (
    <section className="card aide-section">
      <h2 style={{ marginTop: 0 }}>
        <span aria-hidden="true">{emoji}</span> {title}
      </h2>
      {children}
    </section>
  )
}
