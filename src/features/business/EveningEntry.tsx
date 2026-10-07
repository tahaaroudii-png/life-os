import { useEffect, useState } from 'react'
import { useCampaigns, useDailyAds } from '@/data/useBusiness'
import { useProducts } from '@/data/useBusiness'
import { todayKey } from '@/lib/date'

/**
 * La saisie du soir — deux champs par campagne, 60 secondes.
 *
 * Elle ne porte QUE ce que Meta et TikTok affichent : dépense et leads.
 * Les confirmés et les livrés viennent du relevé hebdomadaire. Les saisir
 * ici de mémoire, c'était fabriquer deux vérités pour le même chiffre.
 */
export function EveningEntry({ userId }: { userId: string }) {
  const day = todayKey()
  const { data: campaigns = [] } = useCampaigns(userId)
  const { data: products = [] } = useProducts(userId)
  const { ads, save } = useDailyAds(userId, day)
  const [rows, setRows] = useState<Record<string, { spend: string; leads: string }>>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const next: Record<string, { spend: string; leads: string }> = {}
    for (const c of campaigns) {
      const existing = ads.find((a) => a.campaign_id === c.id)
      next[c.id] = {
        spend: existing ? String(existing.spend_usd) : '',
        leads: existing ? String(existing.leads) : '',
      }
    }
    setRows(next)
  }, [campaigns, ads])

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—'

  async function submit() {
    const payload = campaigns
      .filter((c) => rows[c.id]?.spend !== '' || rows[c.id]?.leads !== '')
      .map((c) => ({
        campaign_id: c.id,
        spend_usd: Number(rows[c.id]?.spend ?? 0) || 0,
        leads: Number(rows[c.id]?.leads ?? 0) || 0,
      }))
    if (payload.length === 0) return
    await save.mutateAsync(payload)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (campaigns.length === 0) {
    return (
      <div className="empty">
        <p>Aucune campagne active.</p>
        <p className="small">Crée tes campagnes dans Produits avant de saisir le soir.</p>
      </div>
    )
  }

  return (
    <>
      <p className="small muted">Dépense et leads, tels que la plateforme les affiche.</p>
      {campaigns.map((c) => (
        <div className="evening-row" key={c.id}>
          <div className="evening-head">
            <strong>{c.name}</strong>
            <span className="xs muted">{productName(c.product_id)} · {c.platform}</span>
          </div>
          <div className="evening-fields">
            <label>
              <span className="xs muted">Dépense $</span>
              <input className="field" inputMode="decimal" value={rows[c.id]?.spend ?? ''}
                     onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...r[c.id]!, spend: e.target.value } }))} />
            </label>
            <label>
              <span className="xs muted">Leads</span>
              <input className="field" inputMode="numeric" value={rows[c.id]?.leads ?? ''}
                     onChange={(e) => setRows((r) => ({ ...r, [c.id]: { ...r[c.id]!, leads: e.target.value } }))} />
            </label>
          </div>
        </div>
      ))}
      <button className="btn primary wide" onClick={submit} disabled={save.isPending}>
        {save.isPending ? 'Enregistrement…' : saved ? 'Enregistré' : 'Enregistrer la journée'}
      </button>
    </>
  )
}
