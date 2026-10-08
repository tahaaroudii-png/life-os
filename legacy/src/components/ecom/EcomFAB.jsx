import { useEffect, useRef, useState } from 'react'
import { SOURCES, KINDS, PLATFORMS, todayKey } from '../../lib/ecom'

const LAST_SOURCE = 'ecom.last-source'
const LAST_KIND = 'ecom.last-kind'

/**
 * Bouton "+" fixe. Formulaire à une ligne, avec attribution obligatoire pour
 * les mouvements de type `ads` (produit + plateforme + campagne).
 */
export default function EcomFAB({ onAdd, onUndo, baseCurrency, products = [], campaigns = [], creatives = [] }) {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), [])

  function showToast() {
    setToast({ text: 'Ajouté' })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), 5000)
  }

  return (
    <>
      <button
        type="button"
        className="ecom-fab"
        aria-label="Ajouter un mouvement"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '×' : '+'}
      </button>

      {open && (
        <div className="ecom-quickadd" role="dialog" aria-label="Saisie rapide">
          <QuickForm
            baseCurrency={baseCurrency}
            products={products}
            campaigns={campaigns}
            creatives={creatives}
            onAdd={(m) => { onAdd(m); showToast() }}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      {toast && (
        <div className="ecom-toast" role="status">
          <span>{toast.text}</span>
          <button type="button" className="btn-link" onClick={() => { onUndo(); setToast(null) }}>
            Annuler
          </button>
        </div>
      )}
    </>
  )
}

function QuickForm({ onAdd, onClose, baseCurrency, products, campaigns, creatives }) {
  const [date, setDate] = useState(todayKey())
  const [source, setSource] = useState(() => localStorage.getItem(LAST_SOURCE) || 'codpartner')
  const [kind, setKind] = useState(() => localStorage.getItem(LAST_KIND) || 'ads')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency || 'USD')
  const [note, setNote] = useState('')
  const [productId, setProductId] = useState('')
  const [platform, setPlatform] = useState('tiktok')
  const [campaignId, setCampaignId] = useState('')
  const [creativeId, setCreativeId] = useState('')
  const [err, setErr] = useState(null)

  const isAds = kind === 'ads'
  const linkedCampaigns = campaigns.filter((c) => !productId || c.productId === productId)
  const linkedCreatives = creatives.filter((c) => !campaignId || c.campaignId === campaignId)

  function submit(e) {
    e.preventDefault()
    setErr(null)
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) { setErr('Montant invalide.'); return }
    if (isAds) {
      if (!productId) { setErr('Sélectionne le produit (obligatoire pour ads).'); return }
      if (!platform)  { setErr('Sélectionne la plateforme (obligatoire pour ads).'); return }
      if (!campaignId){ setErr('Sélectionne la campagne (obligatoire pour ads).'); return }
    }
    localStorage.setItem(LAST_SOURCE, source)
    localStorage.setItem(LAST_KIND, kind)
    onAdd({
      date, source: isAds ? platform : source, kind,
      amount: Math.round(n * 100) / 100,
      currency,
      note: note.trim() || null,
      productId: isAds || kind === 'stock' || kind === 'revenue' ? (productId || null) : null,
      campaignId: isAds ? campaignId : null,
      creativeId: isAds ? (creativeId || null) : null,
      period: 'oneoff', undated: false,
    })
    setAmount(''); setNote('')
    // ne ferme pas → enchaîne
  }

  return (
    <form onSubmit={submit} className="ecom-quickadd__form">
      <div className="ecom-quickadd__row">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Nature">
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        {isAds ? (
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Plateforme">
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        ) : (
          <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
            {SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        )}
        <input
          type="number" step="0.01" min="0"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="Montant" aria-label="Montant" autoFocus
        />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Devise">
          <option value="USD">USD</option><option value="MAD">MAD</option>
          <option value="SAR">SAR</option><option value="AED">AED</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          type="text" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optionnel)" aria-label="Note"
        />
        <button type="submit" className="btn-primary">Ajouter</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Fermer</button>
      </div>
      {(isAds || kind === 'stock' || kind === 'revenue') && (
        <div className="ecom-quickadd__row2">
          <label className="muted small">Produit {isAds && '*'}</label>
          <select value={productId} onChange={(e) => { setProductId(e.target.value); setCampaignId(''); setCreativeId('') }}>
            <option value="">— sélectionner —</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {isAds && (
            <>
              <label className="muted small">Campagne *</label>
              <select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setCreativeId('') }}>
                <option value="">— sélectionner —</option>
                {linkedCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <label className="muted small">Créa (opt.)</label>
              <select value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
                <option value="">— aucune —</option>
                {linkedCreatives.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </>
          )}
        </div>
      )}
      {err && <p className="error-text" style={{ marginTop: '0.4rem' }}>{err}</p>}
    </form>
  )
}
