import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useSession } from '@/data/useSession'
import { Login } from '@/features/auth/Login'
import { TodayScreen } from '@/features/today/TodayScreen'
import { GoalsScreen } from '@/features/goals/GoalsScreen'
import { BusinessScreen } from '@/features/business/BusinessScreen'
import { MoneyScreen } from '@/features/money/MoneyScreen'
import { MoreScreen } from '@/features/MoreScreen'
import '@/styles/tokens.css'
import '@/styles/app.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Les chiffres sont calculés en base : on les relit volontiers, mais
      // pas à chaque remontée de focus — le métro coupe et revient.
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
})

const TABS = [
  { to: '/', glyph: '◉', label: 'Aujourd’hui', end: true },
  { to: '/objectifs', glyph: '◆', label: 'Objectifs' },
  { to: '/business', glyph: '▲', label: 'Business' },
  { to: '/argent', glyph: '●', label: 'Argent' },
  { to: '/plus', glyph: '≡', label: 'Plus' },
]

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

function Shell() {
  const { userId, loading } = useSession()

  if (loading) return <div className="app"><p className="muted">Chargement…</p></div>
  if (!userId) return <Login />

  return (
    <>
      <Routes>
        <Route path="/" element={<TodayScreen userId={userId} />} />
        <Route path="/objectifs" element={<GoalsScreen userId={userId} />} />
        <Route path="/business/*" element={<BusinessScreen userId={userId} />} />
        <Route path="/argent/*" element={<MoneyScreen userId={userId} />} />
        <Route path="/plus/*" element={<MoreScreen userId={userId} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <nav className="nav">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end}>
            <span className="glyph">{t.glyph}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
