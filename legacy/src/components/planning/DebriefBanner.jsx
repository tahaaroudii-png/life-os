/**
 * Bannière en haut de l'app tant que le bilan du soir n'est pas fait.
 * Insistante mais fonctionnelle — un seul bouton d'action, "Ouvrir".
 */
export default function DebriefBanner({ count, onOpen }) {
  return (
    <div className="debrief-banner" role="alert">
      <span className="debrief-banner__icon" aria-hidden="true">🌙</span>
      <span className="debrief-banner__label">
        Bilan du soir à faire — <strong>{count}</strong> tâche{count > 1 ? 's' : ''} non cochée{count > 1 ? 's' : ''}.
      </span>
      <button type="button" className="debrief-banner__btn" onClick={onOpen}>
        Ouvrir
      </button>
    </div>
  )
}
