/* ------------------------------------------------------------------ */
/* Mise à jour de l'app installée                                     */
/* ------------------------------------------------------------------ */
/*
 * Une app ajoutée à l'écran d'accueil n'est jamais vraiment fermée : le
 * service worker installait bien la nouvelle version, mais la page
 * continuait d'exécuter l'ancien code — d'où un téléphone resté sur un
 * écran d'il y a plusieurs jours pendant que l'ordinateur affichait la
 * bonne version.
 *
 * Deux gestes suffisent : vérifier s'il existe une mise à jour chaque
 * fois que l'app revient au premier plan, et recharger une fois quand
 * elle prend la main.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
    scope: import.meta.env.BASE_URL,
  }).then((registration) => {
    const check = () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    // Et une fois par heure si l'app reste ouverte toute la journée.
    setInterval(check, 60 * 60 * 1000)
  }).catch(() => {
    /* Navigation privée, service workers désactivés : l'app marche sans. */
  })

  // `clientsClaim` donne la main au nouveau worker ; il reste à relire le
  // code. Le drapeau évite une boucle si le rechargement échoue.
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return
    reloaded = true
    window.location.reload()
  })
}
