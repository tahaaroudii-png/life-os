import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { formatDH } from '../lib/format'
import SetPinBanner from '../components/SetPinBanner'

/*
 * Les enveloppes se règlent en MONTANTS, plus en pourcentages : un
 * pourcentage se déforme à chaque variation du salaire, alors qu'une
 * enveloppe est une somme qu'on décide. Ce qui n'est attribué à aucune
 * enveloppe reste hors budget — la daret, par exemple, qui part dès le
 * virement.
 */
const FIELDS = [
  { key: 'monthly_income', label: 'Revenu mensuel (DH)', type: 'number' },
  { key: 'amt_vie', label: 'Vie (DH)', type: 'number', part: true },
  { key: 'amt_reinvest', label: 'Réinvestissement (DH)', type: 'number', part: true },
  { key: 'amt_urgence', label: "Fond d'urgence (DH)", type: 'number', part: true },
  { key: 'amt_divertissement', label: 'Divertissement (DH)', type: 'number', part: true },
  { key: 'amt_mariage', label: 'Mariage (DH)', type: 'number', part: true },
  { key: 'amt_appart_mere', label: 'Appartement de ma mère (DH)', type: 'number', part: true },
  { key: 'emergency_goal', label: "Objectif du fond d'urgence (DH)", type: 'number' },
  { key: 'goal_mariage', label: 'Objectif mariage (DH)', type: 'number' },
  { key: 'goal_appart_mere', label: "Objectif appartement de ma mère (DH)", type: 'number' },
  { key: 'start_month', label: 'Mois de départ des enveloppes d’épargne', type: 'month' },
]

const PARTS = FIELDS.filter((f) => f.part).map((f) => f.key)

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

  const totalParts = PARTS.reduce((somme, k) => somme + (Number(draft[k]) || 0), 0)
  const horsBudget = (Number(draft.monthly_income) || 0) - totalParts

  function handleChange(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const nombre = (v) => (v === '' || v == null || Number.isNaN(parseFloat(v)) ? null : parseFloat(v))
    const patch = { start_month: draft.start_month ? `${draft.start_month}-01` : null }
    for (const f of FIELDS) {
      if (f.type === 'month') continue
      patch[f.key] = nombre(draft[f.key])
    }
    await updateSettings.mutateAsync(patch)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  return (
    <div className="page-reglages">
      <h1>Réglages</h1>
      <p className="muted">
        Revenu mensuel de référence : <strong>{formatDH(settings.monthly_income)}</strong>. Vie,
        Réinvestissement et Divertissement repartent à zéro le 20 de chaque mois ; le fond
        d'urgence, le mariage et l'appartement cumulent jusqu'à leur objectif et acceptent des
        versements. Ce qui n'est attribué à aucune enveloppe reste hors budget.
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

        <p className={horsBudget < 0 ? 'error-text' : 'muted'}>
          Réparti : <strong>{formatDH(totalParts)}</strong>
          {horsBudget > 0 && <> · hors budget : <strong>{formatDH(horsBudget)}</strong> (daret, etc.)</>}
          {horsBudget < 0 && <> · dépasse le revenu de <strong>{formatDH(-horsBudget)}</strong></>}
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

      {/* Repère de version. Sans lui, impossible de savoir si l'app ouverte
          est bien la dernière publiée ou une copie gardée en cache. */}
      <p className="muted small" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
        Version du {BUILD_DATE}
      </p>
    </div>
  )
}

const BUILD_DATE = '26 novembre 2026'
