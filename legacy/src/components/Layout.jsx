import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import OfflineBanner from './OfflineBanner'
import QuickAddModal from './QuickAddModal'
import SetPinBanner from './SetPinBanner'
import YearCountdown from './YearCountdown'
import ReminderScheduler from './planning/ReminderScheduler'
import GoalsPlanningSync from './goals/GoalsPlanningSync'
import '../styles/orbs.css'

const BUDGET_NAV = [
  { to: '/', label: 'Accueil', icon: '🏠' },
  { to: '/dashboard', label: 'Analyse', icon: '📊' },
  { to: '/historique', label: 'Historique', icon: '📜' },
  { to: '/reglages', label: 'Réglages', icon: '⚙️' },
]

const PLANNING_NAV = [
  { to: '/planning', label: "Aujourd'hui", icon: '✅' },
  { to: '/planning/historique', label: 'Tendances', icon: '📈' },
  { to: '/planning/reglages', label: 'Tâches', icon: '📝' },
]

const ONCF_NAV = [
  { to: '/oncf', label: 'Modifications', icon: '🚂' },
]

const ECOM_NAV = [
  { to: '/ecom',            label: 'Aperçu',     icon: '📊' },
  { to: '/ecom/produits',   label: 'Produits',   icon: '📦' },
  { to: '/ecom/media',      label: 'Media',      icon: '🎯' },
  { to: '/ecom/stock',      label: 'Stock',      icon: '📚' },
  { to: '/ecom/soir',       label: 'Saisie soir', icon: '🌙' },
  { to: '/ecom/mouvements', label: 'Mouvements', icon: '📜' },
  { to: '/ecom/import',     label: 'Import',     icon: '📥' },
  { to: '/ecom/reglages',   label: 'Réglages',   icon: '⚙️' },
]

const GOALS_NAV = [
  { to: '/goals', label: 'Objectifs 2026', icon: '🎯' },
]

const SECTIONS = [
  { key: 'budget',   icon: '💰', label: 'Budget',     root: '/',          nav: BUDGET_NAV },
  { key: 'planning', icon: '✅', label: 'Planning',   root: '/planning',  nav: PLANNING_NAV },
  { key: 'oncf',     icon: '🚂', label: 'ONCF',       root: '/oncf',      nav: ONCF_NAV },
  { key: 'ecom',     icon: '🛒', label: 'E-commerce', root: '/ecom',      nav: ECOM_NAV },
  { key: 'goals',    icon: '🎯', label: 'Objectifs',  root: '/goals',     nav: GOALS_NAV },
]

function detectSection(pathname) {
  if (pathname.startsWith('/planning')) return SECTIONS[1]
  if (pathname.startsWith('/oncf'))     return SECTIONS[2]
  if (pathname.startsWith('/ecom'))     return SECTIONS[3]
  if (pathname.startsWith('/goals'))    return SECTIONS[4]
  return SECTIONS[0]
}

// Routes qui doivent matcher "end" pour l'état actif (racines de chaque section).
const END_ROUTES = new Set(['/', '/planning', '/oncf', '/ecom', '/goals'])

export default function Layout() {
  const { signOut } = useAuth()
  const location = useLocation()
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  const section = detectSection(location.pathname)
  const nav = section.nav
  const isBudget = section.key === 'budget'

  // Le FAB "Budget" ouvre QuickAddModal (dépense).
  // Le FAB "Planning" est géré par la page Aujourd'hui elle-même.
  // Le FAB "ONCF" est géré par la page Modifications elle-même
  // (via le bouton "+ Nouvelle modification" en haut).
  return (
    <div className="app-shell">
      <YearCountdown />
      <OfflineBanner />
      <SetPinBanner />
      <ReminderScheduler />
      <GoalsPlanningSync />

      <header className="app-header">
        <div className="orbs" role="navigation" aria-label="Sections">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.key}
              to={s.root}
              end={s.root === '/'}
              className={`orb orb--${s.key} ${section.key === s.key ? 'orb--active' : ''}`}
              title={s.label}
            >
              <span className="orb-halo" aria-hidden="true" />
              <span className="orb-ring" aria-hidden="true" />
              <span className="orb-icon" aria-hidden="true">{s.icon}</span>
              <span className="orb-label">{s.label}</span>
            </NavLink>
          ))}
        </div>
        <nav className="app-header__nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={END_ROUTES.has(item.to)}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
            >
              <span className="nav-link__icon">{item.icon}</span>
              <span className="nav-link__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <footer className="app-foot" aria-label="Utilitaires">
        <NavLink to="/aide" className="foot-link" title="Manuel d'utilisation">
          <span aria-hidden="true">❓</span> Aide
        </NavLink>
        <button type="button" className="foot-link" onClick={signOut} title="Se déconnecter">
          <span aria-hidden="true">↩</span> Déconnexion
        </button>
      </footer>

      <nav className="bottom-tabs">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={END_ROUTES.has(item.to)}
            className={({ isActive }) => `bottom-tab ${isActive ? 'bottom-tab--active' : ''}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {isBudget && (
        <>
          <button
            type="button"
            className="fab"
            aria-label="Ajouter une dépense"
            onClick={() => setQuickAddOpen(true)}
          >
            +
          </button>
          <QuickAddModal open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
        </>
      )}
    </div>
  )
}
