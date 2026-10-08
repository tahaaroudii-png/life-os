import { AXIS_BY_KEY } from '../../lib/planning'

/**
 * Board de streaks — encouragement visuel pour tenir les habitudes.
 *
 * Chaque carte porte deux informations :
 *   - son AXE (bandeau haut coloré + icône) : "de quelle habitude on parle"
 *   - son NIVEAU (thème visuel : flamme, or, couronne) : "où tu en es"
 *
 * Le niveau ne dépend PAS de l'axe — c'est la longueur du streak qui décide.
 * Les paliers sont conçus pour rester motivants : chaque semaine franchit
 * un tier visible.
 */
export default function StreakBoard({ streaks }) {
  if (!streaks || streaks.length === 0) return null

  return (
    <section className="streak-board">
      <header className="streak-board__head">
        <h2 className="streak-board__title">🔥 Streaks — mes engagements</h2>
        <p className="streak-board__sub muted small">
          {streaks.length} engagement{streaks.length > 1 ? 's' : ''} suivi{streaks.length > 1 ? 's' : ''} (habitudes + défis). La régularité bat la performance.
        </p>
      </header>
      <div className="streak-board__scroller">
        {streaks.map(({ task, streak }) => (
          <StreakCard key={task.id} task={task} streak={streak} />
        ))}
      </div>
    </section>
  )
}

function tierFor(streak) {
  if (streak >= 100) return { key: 'legend',  icon: '💎', label: 'Légende' }
  if (streak >= 60)  return { key: 'diamond', icon: '💎', label: 'Diamant' }
  if (streak >= 30)  return { key: 'gold',    icon: '👑', label: 'Or' }
  if (streak >= 14)  return { key: 'epic',    icon: '🔥', label: 'Épique' }
  if (streak >= 7)   return { key: 'hot',     icon: '🔥', label: 'En feu' }
  if (streak >= 3)   return { key: 'warm',    icon: '🔥', label: 'Ça chauffe' }
  if (streak >= 1)   return { key: 'spark',   icon: '✨', label: 'Amorce' }
  return                    { key: 'idle',    icon: '🌱', label: 'À planter' }
}

function StreakCard({ task, streak }) {
  const axis = AXIS_BY_KEY[task.axis]
  const tier = tierFor(streak)
  const nextMilestone = nextMilestoneFor(streak)

  return (
    <article
      className={`streak-card streak-card--${tier.key}`}
      style={{ '--axis-color': axis?.color || '#64748b' }}
    >
      <header className="streak-card__axis" title={axis?.label}>
        <span className="streak-card__axis-icon" aria-hidden="true">{axis?.icon}</span>
        <span className="streak-card__axis-label">{axis?.label}</span>
      </header>

      <div className="streak-card__emoji" aria-hidden="true">{tier.icon}</div>

      <div className="streak-card__value">
        <span className="streak-card__num">{streak}</span>
        <span className="streak-card__unit">{streak === 1 ? 'jour' : 'jours'}</span>
      </div>

      <div className="streak-card__title">{task.title}</div>

      <footer className="streak-card__foot">
        <span className="streak-card__tier">{tier.label}</span>
        {nextMilestone && (
          <span className="streak-card__next">
            → {nextMilestone.days}j {nextMilestone.icon}
          </span>
        )}
      </footer>
    </article>
  )
}

function nextMilestoneFor(streak) {
  const milestones = [
    { days: 1,   icon: '✨' },
    { days: 3,   icon: '🔥' },
    { days: 7,   icon: '🔥' },
    { days: 14,  icon: '🔥' },
    { days: 30,  icon: '👑' },
    { days: 60,  icon: '💎' },
    { days: 100, icon: '💎' },
    { days: 365, icon: '🏆' },
  ]
  return milestones.find((m) => m.days > streak) || null
}
