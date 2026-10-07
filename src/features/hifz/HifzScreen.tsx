import { useState } from 'react'
import { useHifz } from '@/data/useHifz'
import { formatShort } from '@/lib/date'

/**
 * La mémorisation, avec sa révision.
 *
 * Un compteur qui n'additionne que le nouveau ment : 1 800 versets
 * mémorisés sans plan de révision, ce sont 1 800 versets perdus. Deux
 * compteurs séparés, et un intervalle qui double sur une bonne
 * restitution, retombe à trois jours sur une mauvaise.
 */
export function HifzScreen({ userId }: { userId: string }) {
  const { summary, due, record } = useHifz(userId)
  const [mode, setMode] = useState<'new' | 'review'>('new')
  const [hizb, setHizb] = useState('')
  const [verses, setVerses] = useState('')
  const [quality, setQuality] = useState<number | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const h = Number(hizb), v = Number(verses)
    if (!h || !v) return
    await record.mutateAsync({ mode, hizb: h, verses: v, quality: quality ?? undefined })
    setVerses(''); setQuality(null)
  }

  return (
    <div className="app">
      <header className="screen-head"><h1>Mémorisation</h1></header>

      <div className="stat-grid">
        <div className="stat"><span className="stat-value">{summary?.hizb_memorised ?? 0}</span><span className="stat-label">hizb mémorisés</span></div>
        <div className="stat"><span className="stat-value">{summary?.verses_new ?? 0}</span><span className="stat-label">versets nouveaux</span></div>
        <div className="stat"><span className="stat-value">{summary?.verses_reviewed ?? 0}</span><span className="stat-label">versets révisés</span></div>
        <div className="stat"><span className={`stat-value ${(summary?.due_count ?? 0) > 0 ? 'tone-warn' : ''}`}>{summary?.due_count ?? 0}</span><span className="stat-label">à réviser</span></div>
      </div>

      <form className="card" onSubmit={submit} style={{ marginTop: 16 }}>
        <h3>Enregistrer une session</h3>
        <div className="row" style={{ marginTop: 8 }}>
          {(['new', 'review'] as const).map((m) => (
            <button type="button" key={m} className={`chip ${mode === m ? 'is-on' : ''}`} onClick={() => setMode(m)}>
              {m === 'new' ? 'Nouveau' : 'Révision'}
            </button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input className="field" inputMode="numeric" placeholder="Hizb (1-60)" value={hizb}
                 onChange={(e) => setHizb(e.target.value)} />
          <input className="field" inputMode="numeric" placeholder="Versets" value={verses}
                 onChange={(e) => setVerses(e.target.value)} />
        </div>
        {mode === 'review' && (
          <>
            <p className="xs muted" style={{ margin: '12px 0 4px' }}>Restitution</p>
            <div className="scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} className={`scale-btn ${quality === n ? 'is-on' : ''}`}
                        onClick={() => setQuality(n)}>{n}</button>
              ))}
            </div>
            <p className="xs muted">4 ou 5 double l’intervalle. 1 ou 2 le ramène à trois jours.</p>
          </>
        )}
        <button className="btn primary wide" style={{ marginTop: 12 }} disabled={record.isPending}>
          Enregistrer
        </button>
      </form>

      {due.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>Révisions dues</h3>
          {due.map((d) => (
            <div className="row" key={d.hizb} style={{ justifyContent: 'space-between', padding: '6px 0' }}>
              <span className="small">Hizb {d.hizb}</span>
              <span className="xs tone-warn">
                {d.days_overdue > 0 ? `${d.days_overdue} j de retard` : `due le ${formatShort(d.due_on)}`}
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
