import { useMemo, useState } from 'react'
import { useEcom } from '../../hooks/useEcom'
import {
  PLATFORMS, MARKETS, ANGLE_CATEGORIES, CREATIVE_FORMATS,
  formatMoney, addDays, todayKey,
} from '../../lib/ecom'

export default function EcomMedia() {
  const [tab, setTab] = useState('day')
  const ecom = useEcom()

  return (
    <div className="page-ecom-media">
      <div className="page-header"><h1>Media Buying</h1></div>
      <div className="view-switch" role="tablist">
        {[
          { k: 'day',       label: '📅 Jour' },
          { k: 'campaigns', label: '🎯 Campagnes' },
          { k: 'creatives', label: '🎬 Créas' },
          { k: 'angles',    label: '🧭 Angles' },
        ].map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k}
            className={`view-switch__btn ${tab === t.k ? 'view-switch__btn--active' : ''}`}
            onClick={() => setTab(t.k)}>{t.label}</button>
        ))}
      </div>

      {tab === 'day' && <DayTab ecom={ecom} />}
      {tab === 'campaigns' && <CampaignsTab ecom={ecom} />}
      {tab === 'creatives' && <CreativesTab ecom={ecom} />}
      {tab === 'angles' && <AnglesTab ecom={ecom} />}
    </div>
  )
}

// ---------------- Jour ----------------
function DayTab({ ecom }) {
  const yesterday = useMemo(() => addDays(todayKey(), -1), [])
  const daily = ecom.daily.filter((d) => d.date === yesterday)
  const byPlatform = { tiktok: 0, snapchat: 0, meta: 0 }
  for (const d of daily) {
    const camp = ecom.campaigns.find((c) => c.id === d.campaignId)
    if (camp && byPlatform[camp.platform] !== undefined) byPlatform[camp.platform] += Number(d.spend) || 0
  }
  return (
    <>
      <p className="muted">Dépense pub d'hier ({yesterday}) par plateforme :</p>
      <div className="biz-hero">
        {PLATFORMS.map((p) => (
          <div key={p.key} className="biz-hero__box">
            <div className="biz-hero__label">{p.label}</div>
            <div className="biz-hero__value">{formatMoney(byPlatform[p.key])}</div>
          </div>
        ))}
      </div>
    </>
  )
}

// ---------------- Campagnes ----------------
function CampaignsTab({ ecom }) {
  const [draft, setDraft] = useState({ name: '', productId: '', platform: 'tiktok', market: 'KSA', status: 'active', budgetCap: '' })

  async function submit(e) {
    e.preventDefault()
    if (!draft.name.trim() || !draft.productId) return
    ecom.addCampaign({
      name: draft.name.trim(),
      productId: draft.productId,
      platform: draft.platform,
      market: draft.market,
      status: draft.status,
      startedAt: todayKey(),
      budgetCap: Number(draft.budgetCap) || 0,
    })
    setDraft({ name: '', productId: '', platform: 'tiktok', market: 'KSA', status: 'active', budgetCap: '' })
  }

  const to = todayKey()
  const from = addDays(to, -6)

  return (
    <>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Nouvelle campagne</h2>
        <form onSubmit={submit}>
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div><label>Nom</label><input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Speaker KSA — lot 3" /></div>
            <div>
              <label>Produit</label>
              <select value={draft.productId} onChange={(e) => setDraft((d) => ({ ...d, productId: e.target.value }))}>
                <option value="">— sélectionner —</option>
                {ecom.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label>Plateforme</label>
              <select value={draft.platform} onChange={(e) => setDraft((d) => ({ ...d, platform: e.target.value }))}>
                {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label>Marché</label>
              <select value={draft.market} onChange={(e) => setDraft((d) => ({ ...d, market: e.target.value }))}>
                {MARKETS.map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}
              </select>
            </div>
            <div><label>Plafond budget $</label><input type="number" step="1" value={draft.budgetCap} onChange={(e) => setDraft((d) => ({ ...d, budgetCap: e.target.value }))} /></div>
          </div>
          <button type="submit" className="btn-primary" disabled={!draft.name.trim() || !draft.productId}>Ajouter</button>
        </form>
      </section>

      <section className="card card--wide">
        <h2 style={{ marginTop: 0 }}>Campagnes ({ecom.campaigns.length})</h2>
        <table className="ecom-table">
          <thead><tr><th>Nom</th><th>Produit</th><th>Plate.</th><th>Marché</th><th>Statut</th><th>Spend 7 j</th><th>Budget cap</th><th></th></tr></thead>
          <tbody>
            {ecom.campaigns.map((c) => {
              const product = ecom.products.find((p) => p.id === c.productId)
              const spend7 = ecom.daily
                .filter((d) => d.campaignId === c.id && d.date >= from && d.date <= to)
                .reduce((s, d) => s + (Number(d.spend) || 0), 0)
              const overBudget = c.budgetCap > 0 && spend7 > c.budgetCap
              return (
                <tr key={c.id} className={overBudget ? 'muted' : ''}>
                  <td><strong>{c.name}</strong></td>
                  <td>{product?.name || '—'}</td>
                  <td>{PLATFORMS.find((p) => p.key === c.platform)?.label}</td>
                  <td>{c.market}</td>
                  <td>
                    <select value={c.status} onChange={(e) => ecom.updateCampaign(c.id, { status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="paused">Pause</option>
                      <option value="ended">Terminée</option>
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(spend7)}</td>
                  <td style={{ textAlign: 'right' }}>{c.budgetCap > 0 ? formatMoney(c.budgetCap) : '—'} {overBudget && <span className="verdict verdict--bad">Dépassé</span>}</td>
                  <td>
                    <button type="button" className="btn-link btn-link--danger" onClick={() => {
                      if (window.confirm(`Supprimer "${c.name}" ?`)) ecom.removeCampaign(c.id)
                    }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}

// ---------------- Créas ----------------
function CreativesTab({ ecom }) {
  const [draft, setDraft] = useState({ label: '', campaignId: '', angleId: '', format: 'faceless', hook: '' })

  async function submit(e) {
    e.preventDefault()
    if (!draft.label.trim() || !draft.campaignId) return
    ecom.addCreative({
      label: draft.label.trim(),
      campaignId: draft.campaignId,
      angleId: draft.angleId || null,
      format: draft.format,
      hook: draft.hook.trim(),
      publishedAt: todayKey(),
    })
    setDraft({ label: '', campaignId: '', angleId: '', format: 'faceless', hook: '' })
  }

  const to = todayKey()
  const from = addDays(to, -29)
  const perCreative = ecom.creatives.map((cr) => {
    const dailyRows = ecom.daily.filter((d) => d.creativeId === cr.id && d.date >= from && d.date <= to)
    const spend = dailyRows.reduce((s, d) => s + (Number(d.spend) || 0), 0)
    const delivered = dailyRows.reduce((s, d) => s + (Number(d.delivered) || 0), 0)
    return { cr, spend, delivered, cpd: delivered > 0 ? spend / delivered : 0 }
  }).filter((r) => r.spend > 0 || r.delivered > 0)
  const top = [...perCreative].filter((r) => r.cpd > 0).sort((a, b) => a.cpd - b.cpd).slice(0, 5)
  const flop = [...perCreative].filter((r) => r.cpd > 0).sort((a, b) => b.cpd - a.cpd).slice(0, 5)

  return (
    <>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Nouvelle créa</h2>
        <form onSubmit={submit}>
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div><label>Nom court</label><input type="text" value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Unboxing RGB — mains seules" /></div>
            <div>
              <label>Campagne</label>
              <select value={draft.campaignId} onChange={(e) => setDraft((d) => ({ ...d, campaignId: e.target.value }))}>
                <option value="">— sélectionner —</option>
                {ecom.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label>Angle</label>
              <select value={draft.angleId} onChange={(e) => setDraft((d) => ({ ...d, angleId: e.target.value }))}>
                <option value="">— aucun —</option>
                {ecom.angles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label>Format</label>
              <select value={draft.format} onChange={(e) => setDraft((d) => ({ ...d, format: e.target.value }))}>
                {CREATIVE_FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
          </div>
          <label>Hook</label>
          <input type="text" value={draft.hook} onChange={(e) => setDraft((d) => ({ ...d, hook: e.target.value }))} placeholder="اكتشفت شي غير شكل غرفتي" />
          <button type="submit" className="btn-primary" disabled={!draft.label.trim() || !draft.campaignId}>Ajouter</button>
        </form>
      </section>

      <div className="biz-columns">
        <TopFlopBlock title="🏆 Top 5 (coût par livrée)" rows={top} ecom={ecom} />
        <TopFlopBlock title="⚠️ Flop 5" rows={flop} ecom={ecom} bad />
      </div>
    </>
  )
}

function TopFlopBlock({ title, rows, ecom, bad }) {
  return (
    <section className="card">
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {rows.length === 0 ? <p className="muted small">Pas assez de données.</p> : (
        <ul className="stock-alerts">
          {rows.map(({ cr, spend, delivered, cpd }) => {
            const camp = ecom.campaigns.find((c) => c.id === cr.campaignId)
            return (
              <li key={cr.id} className={`stock-alert ${bad ? 'stock-alert--crit' : ''}`}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{cr.label}</strong>
                  <span className="muted small">{camp?.name || '—'} · {formatMoney(cpd)}/livrée · {delivered} livrées / {formatMoney(spend)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ---------------- Angles ----------------
function AnglesTab({ ecom }) {
  const [draft, setDraft] = useState({ name: '', phrase: '', category: 'trust' })

  async function submit(e) {
    e.preventDefault()
    if (!draft.name.trim()) return
    ecom.addAngle({ ...draft, name: draft.name.trim(), phrase: draft.phrase.trim() })
    setDraft({ name: '', phrase: '', category: 'trust' })
  }

  const to = todayKey()
  const from = addDays(to, -29)

  const rows = ecom.angles.map((a) => {
    const creativesA = ecom.creatives.filter((c) => c.angleId === a.id)
    const productIds = new Set()
    let spend = 0, leads = 0, delivered = 0
    for (const cr of creativesA) {
      const camp = ecom.campaigns.find((c) => c.id === cr.campaignId)
      if (camp?.productId) productIds.add(camp.productId)
      for (const d of ecom.daily) {
        if (d.creativeId !== cr.id) continue
        if (d.date < from || d.date > to) continue
        spend += Number(d.spend) || 0
        leads += Number(d.leads) || 0
        delivered += Number(d.delivered) || 0
      }
    }
    const cpd = delivered > 0 ? spend / delivered : 0
    return { angle: a, creativesCount: creativesA.length, productsCount: productIds.size, spend, leads, delivered, cpd }
  }).sort((a, b) => (a.cpd || Infinity) - (b.cpd || Infinity))

  return (
    <>
      <section className="card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Nouvel angle</h2>
        <form onSubmit={submit}>
          <div className="form-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div><label>Nom</label><input type="text" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex. Trust — paiement à réception" /></div>
            <div>
              <label>Catégorie</label>
              <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
                {ANGLE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <label>Phrase / accroche</label>
          <input type="text" value={draft.phrase} onChange={(e) => setDraft((d) => ({ ...d, phrase: e.target.value }))} placeholder="ما تدفع ريال لين تجربه" />
          <button type="submit" className="btn-primary" disabled={!draft.name.trim()}>Ajouter</button>
        </form>
      </section>

      <section className="card card--wide">
        <h2 style={{ marginTop: 0 }}>Angles ({ecom.angles.length}) — triés par coût par livrée croissant (30 j)</h2>
        <table className="ecom-table">
          <thead><tr><th>Angle</th><th>Cat.</th><th>Spend</th><th>Leads</th><th>Livrées</th><th>C/Livrée</th><th>Créas</th><th>Produits</th></tr></thead>
          <tbody>
            {rows.map(({ angle, creativesCount, productsCount, spend, leads, delivered, cpd }) => (
              <tr key={angle.id}>
                <td>
                  <strong>{angle.name}</strong>
                  {angle.phrase && <div className="muted small" style={{ direction: 'auto' }}>« {angle.phrase} »</div>}
                </td>
                <td>{ANGLE_CATEGORIES.find((c) => c.key === angle.category)?.label}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(spend)}</td>
                <td style={{ textAlign: 'right' }}>{leads}</td>
                <td style={{ textAlign: 'right' }}>{delivered}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{cpd > 0 ? formatMoney(cpd) : '—'}</td>
                <td style={{ textAlign: 'right' }}>{creativesCount}</td>
                <td style={{ textAlign: 'right' }}>{productsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
