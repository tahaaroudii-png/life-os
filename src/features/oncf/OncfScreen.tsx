import { useState } from 'react'
import { useModificationEvents, useModifications } from '@/data/useOncf'
import { formatShort } from '@/lib/date'
import type { ModifStage } from '@/db/types'

/**
 * Les étapes gardent le vocabulaire du métier, en français — celui déjà
 * utilisé dans les dossiers. Les traduire ferait perdre de l'information
 * et obligerait à retraduire à chaque lecture.
 */
const STAGES: Array<{ key: ModifStage; label: string }> = [
  { key: 'identifie', label: 'Identifié' },
  { key: 'etude', label: 'Étude' },
  { key: 'prototype', label: 'Prototype' },
  { key: 'validation', label: 'Validation' },
  { key: 'dossier_redige', label: 'Dossier rédigé' },
  { key: 'deploiement_serie', label: 'Déploiement série' },
  { key: 'cloture', label: 'Clôturé' },
]

const BUCKET_LABEL: Record<string, string> = {
  late: 'En retard', imminent: 'Cette semaine', ahead: 'À venir',
  undated: 'Sans échéance', closed: 'Clôturé',
}
const BUCKET_ORDER = ['late', 'imminent', 'ahead', 'undated', 'closed']

export function OncfScreen({ userId }: { userId: string }) {
  const { modifications, setStage } = useModifications(userId)
  const [openId, setOpenId] = useState<string | null>(null)

  const groups = BUCKET_ORDER
    .map((b) => ({ bucket: b, items: modifications.filter((m) => m.bucket === b) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="app">
      <header className="screen-head">
        <h1>ONCF</h1>
        <span className="date">{modifications.filter((m) => m.bucket !== 'closed').length} en cours</span>
      </header>

      {modifications.length === 0 && <div className="empty"><p>Aucune modification.</p></div>}

      {groups.map((g) => (
        <section className="axis-group" key={g.bucket}>
          <header><h3 className={g.bucket === 'late' ? 'tone-crit' : ''}>{BUCKET_LABEL[g.bucket]}</h3></header>
          {g.items.map((m) => (
            <div className="card modif" key={m.id}>
              <button className="modif-head" onClick={() => setOpenId(openId === m.id ? null : m.id)}>
                <span className="modif-title">{m.title}</span>
                <span className="xs muted">
                  {m.engine ?? '—'}
                  {m.days_to_due != null && (m.days_to_due < 0
                    ? ` · ${Math.abs(m.days_to_due)} j de retard`
                    : ` · dans ${m.days_to_due} j`)}
                </span>
              </button>
              <div className="bar" style={{ margin: '8px 0 4px' }}>
                <span className="fill" style={{ width: `${m.progress * 100}%`, background: 'var(--dom-work)' }} />
              </div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <select className="field compact" value={m.stage}
                        onChange={(e) => setStage.mutate({ id: m.id, stage: e.target.value as ModifStage })}>
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <span className="xs muted">{m.event_count} entrée{m.event_count > 1 ? 's' : ''} de journal</span>
              </div>
              {openId === m.id && <Journal userId={userId} modificationId={m.id} />}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function Journal({ userId, modificationId }: { userId: string; modificationId: string }) {
  const { events, add } = useModificationEvents(userId, modificationId)
  const [text, setText] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await add.mutateAsync(text.trim())
    setText('')
  }

  return (
    <div className="journal">
      <form className="row" onSubmit={submit}>
        <input className="field" placeholder="Ce que tu viens de faire" value={text}
               onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={!text.trim()}>Noter</button>
      </form>
      {events.map((e) => (
        <div className="journal-line" key={e.id}>
          <span className="xs muted">{formatShort(e.happened_on)}</span>
          <span className="small">{e.body}</span>
        </div>
      ))}
      {events.length === 0 && <p className="xs muted">Journal vide.</p>}
    </div>
  )
}
