import { useInsights } from '@/data/useInsights'
import { formatShort } from '@/lib/date'
import { pct } from '@/lib/format'

/**
 * Les corrélations trouvées dans tes propres données.
 *
 * Un insight n'est publié qu'au-delà de 8 observations et 25 points
 * d'écart. En dessous, c'est du bruit présenté comme une vérité — et une
 * app qui dit n'importe quoi une fois n'est plus crue ensuite.
 */
export function InsightsScreen({ userId }: { userId: string }) {
  const { insights, dismiss, recompute } = useInsights(userId)
  const live = insights.filter((i) => !i.dismissed_at)
  const past = insights.filter((i) => i.dismissed_at)

  return (
    <div className="app">
      <header className="screen-head">
        <h1>Observations</h1>
        <button className="btn" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
          {recompute.isPending ? 'Calcul…' : 'Recalculer'}
        </button>
      </header>

      {live.length === 0 && (
        <div className="empty">
          <p>Rien de significatif pour l’instant.</p>
          <p className="small">
            Il faut au moins huit observations et vingt-cinq points d’écart pour
            qu’un motif soit publié. Continue à clôturer tes journées : c’est
            l’énergie et le temps par axe qui alimentent le calcul.
          </p>
        </div>
      )}

      {live.map((i) => (
        <div className="card insight" key={i.id}>
          <p className="insight-body">{i.body}</p>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span className="xs muted">
              {formatShort(i.computed_on)}
              {i.effect != null && ` · effet ${pct(i.effect)}`}
              {i.sample_size != null && ` · ${i.sample_size} observations`}
            </span>
            <button className="btn compact" onClick={() => dismiss.mutate(i.id)}>Écarter</button>
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3 className="muted">Écartées</h3>
          {past.map((i) => (
            <p className="xs muted" key={i.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
              {i.body}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
