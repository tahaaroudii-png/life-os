import { useMemo, useState } from 'react'
import {
  useMarriageCandidates,
  useMarriageCriteria,
  useMarriageScores,
} from '../../hooks/useMariage'
import {
  CATEGORIES,
  STATUSES,
  byCategory,
  indexScores,
  maxScore,
  pendingEliminatories,
  totalScore,
  verdict,
} from '../../lib/mariage'
import '../../styles/choix.css'

/**
 * Choix décisif.
 *
 * Deux écrans : la liste des dossiers avec leur verdict, et la fiche d'un
 * dossier où l'on répond aux critères. Le verdict est toujours au-dessus du
 * score, parce que c'est lui qui décide : un éliminatoire à NON ferme le
 * dossier sans attendre que le reste soit renseigné.
 */
export default function ChoixDecisif() {
  const { criteria, isLoading: loadingCriteria } = useMarriageCriteria()
  const { candidates, isLoading: loadingCandidates, create, update, remove } =
    useMarriageCandidates()
  const { scores, setScore } = useMarriageScores()

  const [openId, setOpenId] = useState(null)
  const [newName, setNewName] = useState('')

  const max = useMemo(() => maxScore(criteria), [criteria])
  const current = candidates.find((c) => c.id === openId) || null

  if (loadingCriteria || loadingCandidates) {
    return (
      <div className="page-choix">
        <p className="muted">Chargement…</p>
      </div>
    )
  }

  if (criteria.length === 0) {
    return (
      <div className="page-choix">
        <header className="page-header">
          <h1>Choix décisif</h1>
        </header>
        <div className="card">
          <p>Aucun critère enregistré. Le cadre doit exister avant les dossiers.</p>
        </div>
      </div>
    )
  }

  if (current) {
    return (
      <Fiche
        candidate={current}
        criteria={criteria}
        scores={scores}
        max={max}
        onBack={() => setOpenId(null)}
        onSetScore={setScore}
        onUpdate={update}
        onRemove={(id) => {
          remove.mutate(id)
          setOpenId(null)
        }}
      />
    )
  }

  return (
    <div className="page-choix">
      <header className="page-header">
        <h1>Choix décisif</h1>
        <p className="muted small">
          Un seul NON aux éliminatoires ferme le dossier, sans attendre d'être sûr du reste.
          Le score ne départage que les dossiers qui passent les quatre.
        </p>
      </header>

      <form
        className="choix-add"
        onSubmit={(e) => {
          e.preventDefault()
          const name = newName.trim()
          if (!name) return
          create.mutate({ name })
          setNewName('')
        }}
      >
        <input
          type="text"
          value={newName}
          placeholder="Ajouter un dossier (prénom)"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!newName.trim()}>
          Ajouter
        </button>
      </form>

      {candidates.length === 0 && (
        <div className="card">
          <p className="muted">Aucun dossier pour l'instant.</p>
        </div>
      )}

      <ul className="choix-list">
        {candidates.map((c) => {
          const byCrit = indexScores(scores, c.id)
          const v = verdict(criteria, byCrit)
          const total = totalScore(criteria, byCrit)
          const pending = pendingEliminatories(criteria, byCrit)
          return (
            <li key={c.id}>
              <button type="button" className="choix-row" onClick={() => setOpenId(c.id)}>
                <span className="choix-row__name">{c.name}</span>
                <span className={`choix-verdict choix-verdict--${v.tone}`}>{v.label}</span>
                <span className="choix-row__score">
                  {total} <span className="muted small">/ {max}</span>
                </span>
                {pending > 0 && (
                  <span className="muted small">
                    {pending} éliminatoire{pending > 1 ? 's' : ''} sans réponse
                  </span>
                )}
                <span className="choix-chevron">›</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Fiche({ candidate, criteria, scores, max, onBack, onSetScore, onUpdate, onRemove }) {
  const byCrit = useMemo(() => indexScores(scores, candidate.id), [scores, candidate.id])
  const v = verdict(criteria, byCrit)
  const total = totalScore(criteria, byCrit)
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="page-choix">
      <header className="page-header">
        <button type="button" className="choix-back" onClick={onBack}>
          ‹ Tous les dossiers
        </button>
        <h1>{candidate.name}</h1>
      </header>

      <div className={`choix-hero choix-hero--${v.tone}`}>
        <div className="choix-hero__verdict">{v.label}</div>
        <div className="choix-hero__score">
          {total} <span className="muted">/ {max}</span>
        </div>
        {v.tone === 'danger' && (
          <p className="choix-hero__note">
            Un éliminatoire est à NON. Le dossier est fermé — le score ne le rouvre pas.
          </p>
        )}
      </div>

      <div className="choix-status">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`choix-chip ${candidate.status === s.key ? 'choix-chip--on' : ''}`}
            onClick={() => onUpdate.mutate({ id: candidate.id, status: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {CATEGORIES.map((cat) => {
        const list = byCategory(criteria, cat.key)
        if (list.length === 0) return null
        return (
          <section key={cat.key} className={`choix-section choix-section--${cat.tone}`}>
            <h2>{cat.label}</h2>
            <p className="muted small">{cat.hint}</p>
            <ul className="choix-criteria">
              {list.map((c) => (
                <li key={c.id}>
                  <span className="choix-criterion__label">{c.label}</span>
                  {cat.key === 'eliminatoire' ? (
                    <OuiNon
                      value={byCrit[c.id]?.passed}
                      onChange={(passed) =>
                        onSetScore.mutate({
                          candidateId: candidate.id,
                          criterionId: c.id,
                          passed,
                        })
                      }
                    />
                  ) : (
                    <Notes
                      value={byCrit[c.id]?.score}
                      maxScore={c.max_score ?? 5}
                      weight={c.weight ?? 1}
                      onChange={(score) =>
                        onSetScore.mutate({
                          candidateId: candidate.id,
                          criterionId: c.id,
                          score,
                        })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <section className="choix-section">
        <h2>Notes</h2>
        <textarea
          className="choix-notes"
          rows={5}
          defaultValue={candidate.notes || ''}
          placeholder="Ce que tu as observé, pas ce que tu espères."
          onBlur={(e) => {
            const notes = e.target.value
            if (notes !== (candidate.notes || '')) {
              onUpdate.mutate({ id: candidate.id, notes })
            }
          }}
        />
      </section>

      <section className="choix-section">
        {confirmRemove ? (
          <div className="choix-confirm">
            <p>Supprimer ce dossier et ses réponses ? C'est définitif.</p>
            <button type="button" className="btn-danger" onClick={() => onRemove(candidate.id)}>
              Supprimer
            </button>
            <button type="button" onClick={() => setConfirmRemove(false)}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="choix-remove" onClick={() => setConfirmRemove(true)}>
            Supprimer ce dossier
          </button>
        )}
      </section>
    </div>
  )
}

function OuiNon({ value, onChange }) {
  return (
    <span className="choix-ouinon">
      <button
        type="button"
        className={`choix-chip ${value === true ? 'choix-chip--ok' : ''}`}
        onClick={() => onChange(value === true ? null : true)}
      >
        OUI
      </button>
      <button
        type="button"
        className={`choix-chip ${value === false ? 'choix-chip--danger' : ''}`}
        onClick={() => onChange(value === false ? null : false)}
      >
        NON
      </button>
    </span>
  )
}

function Notes({ value, maxScore: nMax, weight, onChange }) {
  const steps = Array.from({ length: nMax + 1 }, (_, i) => i)
  return (
    <span className="choix-notes-row">
      <span className="choix-weight muted small" title="Poids de ce critère">
        ×{weight}
      </span>
      {steps.map((n) => (
        <button
          key={n}
          type="button"
          className={`choix-note ${value === n ? 'choix-note--on' : ''}`}
          onClick={() => onChange(value === n ? null : n)}
        >
          {n}
        </button>
      ))}
    </span>
  )
}
