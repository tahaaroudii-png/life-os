import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { formatDH } from '../lib/format'
import SetPinBanner from '../components/SetPinBanner'

const FIELDS = [
  { key: 'monthly_income', label: 'Revenu mensuel (DH)', type: 'number' },
  { key: 'pct_vie', label: 'Vie (%)', type: 'number' },
  { key: 'pct_reinvest', label: 'Réinvestissement (%)', type: 'number' },
  { key: 'pct_urgence', label: "Fond d'urgence (%)", type: 'number' },
  { key: 'pct_divertissement', label: 'Divertissement (%)', type: 'number' },
  { key: 'emergency_goal', label: "Objectif du fond d'urgence (DH)", type: 'number' },
  { key: 'start_month', label: 'Mois de départ du fond d’urgence', type: 'month' },
]

function toMonthInputValue(dateLike) {
  if (!dateLike) return ''
  const d = new Date(dateLike)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Reglages() {
  const { settings, isLoading, updateSettings } = useSettings()
  const [draft, setDraft] = useState(null)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    if (settings) {
      setDraft({
        ...settings,
        start_month: toMonthInputValue(settings.start_month),
      })
    }
  }, [settings])

  if (isLoading || !draft) return <p className="muted">Chargement…</p>

  const pctTotal =
    Number(draft.pct_vie || 0) +
    Number(draft.pct_reinvest || 0) +
    Number(draft.pct_urgence || 0) +
    Number(draft.pct_divertissement || 0)

  function handleChange(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const patch = {
      monthly_income: parseFloat(draft.monthly_income),
      pct_vie: parseFloat(draft.pct_vie),
      pct_reinvest: parseFloat(draft.pct_reinvest),
      pct_urgence: parseFloat(draft.pct_urgence),
      pct_divertissement: parseFloat(draft.pct_divertissement),
      emergency_goal: parseFloat(draft.emergency_goal),
      start_month: draft.start_month ? `${draft.start_month}-01` : null,
    }
    await updateSettings.mutateAsync(patch)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  return (
    <div className="page-reglages">
      <h1>Réglages</h1>
      <p className="muted">
        Revenu mensuel de référence : <strong>{formatDH(settings.monthly_income)}</strong>. Les 3
        enveloppes Vie / Réinvestissement / Divertissement repartent à zéro chaque mois ; le fond
        d'urgence cumule jusqu'à l'objectif.
      </p>

      <form className="settings-form" onSubmit={handleSubmit}>
        {FIELDS.map((f) => (
          <div key={f.key} className="settings-field">
            <label htmlFor={f.key}>{f.label}</label>
            <input
              id={f.key}
              type={f.type}
              step={f.type === 'number' ? '0.01' : undefined}
              value={draft[f.key] ?? ''}
              onChange={(e) => handleChange(f.key, e.target.value)}
            />
          </div>
        ))}

        <p className={pctTotal === 100 ? 'muted' : 'error-text'}>
          Total des pourcentages : {pctTotal}% {pctTotal !== 100 && '(devrait être 100%)'}
        </p>

        <button type="submit" className="btn-primary" disabled={updateSettings.isPending}>
          {updateSettings.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {savedMsg && <span className="muted"> ✅ Enregistré</span>}
      </form>

      <section className="settings-form" style={{ marginTop: '1.5rem' }}>
        <h2 style={{ marginTop: 0 }}>Sécurité</h2>
        <p className="muted small" style={{ marginBottom: '0.85rem' }}>
          Le code d'accès remplace le lien magique pour se reconnecter rapidement.
        </p>
        <SetPinBanner variant="inline" />
      </section>
    </div>
  )
}
