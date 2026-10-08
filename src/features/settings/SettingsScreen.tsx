import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useBootstrap, useImportLegacyJson } from '@/data/useRituals'

/**
 * Réglages et reprise.
 *
 * L'import depuis le navigateur est ici parce que `goals.v1` et `ecom.v2`
 * n'ont jamais quitté le `localStorage` de l'ancienne app : ils ne sont
 * lisibles que depuis le navigateur où ils ont été écrits.
 */
export function SettingsScreen() {
  const bootstrap = useBootstrap()
  const importJson = useImportLegacyJson()
  const [report, setReport] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function importFromBrowser() {
    setBusy(true); setReport(null)
    try {
      const goals = safeParse(localStorage.getItem('goals.v1'))
      const ecom = safeParse(localStorage.getItem('ecom.v2')) ?? safeParse(localStorage.getItem('ecom.v1'))
      if (!goals && !ecom) {
        setReport('Rien trouvé dans ce navigateur. Ouvre l’ancienne app sur le même navigateur, puis reviens.')
        return
      }
      const res = await importJson.mutateAsync({ goals, ecom })
      setReport(`Repris : ${JSON.stringify(res)}`)
    } catch (e) {
      setReport(`Échec : ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function exportAll() {
    const tables = ['goals', 'tasks', 'task_logs', 'day_states', 'axis_minutes',
                    'products', 'daily_ads', 'fulfilment_rows', 'transactions',
                    'modifications', 'modification_events', 'hifz_sessions']
    const dump: Record<string, unknown> = { exported_at: new Date().toISOString() }
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*')
      dump[t] = data ?? []
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `life-os-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="app">
      <header className="screen-head"><h1>Réglages</h1></header>

      <PasswordSection />

      <section className="card">
        <h3>Amorçage</h3>
        <p className="small muted">
          Crée les axes, les objectifs 2026, les marchés, les enveloppes et les
          rappels s’ils manquent. Sans effet s’ils existent déjà.
        </p>
        <button className="btn" onClick={() => bootstrap.mutate()} disabled={bootstrap.isPending}>
          {bootstrap.isPending ? 'En cours…' : 'Lancer l’amorçage'}
        </button>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Reprise depuis l’ancienne app</h3>
        <p className="small muted">
          Les tâches, transactions et dossiers ONCF sont déjà repris côté base.
          Ce bouton récupère ce qui dormait dans le navigateur : la progression
          des objectifs et l’état e-commerce. À lancer depuis le navigateur où
          tu utilisais budget-app.
        </p>
        <button className="btn" onClick={importFromBrowser} disabled={busy}>
          {busy ? 'Reprise…' : 'Reprendre les données du navigateur'}
        </button>
        {report && <p className="xs" style={{ marginTop: 8 }}>{report}</p>}
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Export</h3>
        <p className="small muted">
          Un fichier JSON de toutes tes tables. Une sauvegarde jamais restaurée
          n’est pas une sauvegarde : garde-en une copie ailleurs.
        </p>
        <button className="btn" onClick={exportAll}>Exporter en JSON</button>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Session</h3>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </section>
    </div>
  )
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

/**
 * Définir un mot de passe.
 *
 * Le lien par e-mail dépend d'un service d'envoi plafonné à deux messages
 * par heure. Un mot de passe supprime cette dépendance : c'est le seul
 * moyen d'être sûr de pouvoir entrer quand on en a besoin.
 */
function PasswordSection() {
  const [pwd, setPwd] = useState('')
  const [state, setState] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save() {
    if (pwd.length < 8) { setState('Au moins 8 caractères.'); return }
    setBusy(true); setState(null)
    const { error } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (error) setState(`Échec : ${error.message}`)
    else { setPwd(''); setState('Mot de passe enregistré. Tu peux maintenant entrer sans e-mail.') }
  }

  return (
    <section className="card">
      <h3>Mot de passe</h3>
      <p className="small muted">
        Définis-en un pour ne plus dépendre du lien par e-mail, qui est
        plafonné à deux envois par heure.
      </p>
      <input type="password" value={pwd} autoComplete="new-password"
             placeholder="Nouveau mot de passe"
             onChange={(e) => setPwd(e.target.value)}
             style={{
               width: '100%', marginBottom: 12, padding: 12, borderRadius: 8,
               border: '1px solid var(--border)', background: 'var(--surface-2)',
               color: 'var(--text)', font: 'inherit',
             }} />
      <button className="btn" onClick={save} disabled={busy || !pwd}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
      {state && <p className="xs" style={{ marginTop: 8 }}>{state}</p>}
    </section>
  )
}
