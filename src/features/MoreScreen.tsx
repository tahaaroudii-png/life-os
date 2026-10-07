import { NavLink, Route, Routes } from 'react-router-dom'
import { OncfScreen } from './oncf/OncfScreen'
import { HifzScreen } from './hifz/HifzScreen'
import { InsightsScreen } from './insights/InsightsScreen'
import { TasksScreen } from './tasks/TasksScreen'
import { SettingsScreen } from './settings/SettingsScreen'

const LINKS = [
  { to: '/plus/taches', label: 'Tâches', hint: 'Créer et archiver tes habitudes' },
  { to: '/plus/oncf', label: 'ONCF', hint: 'Dossiers de modification' },
  { to: '/plus/hifz', label: 'Mémorisation', hint: 'Nouveau et révision' },
  { to: '/plus/observations', label: 'Observations', hint: 'Ce que tes données disent' },
  { to: '/plus/reglages', label: 'Réglages', hint: 'Amorçage, reprise, export' },
]

export function MoreScreen({ userId }: { userId: string }) {
  return (
    <Routes>
      <Route index element={<Menu />} />
      <Route path="taches" element={<TasksScreen userId={userId} />} />
      <Route path="oncf" element={<OncfScreen userId={userId} />} />
      <Route path="hifz" element={<HifzScreen userId={userId} />} />
      <Route path="observations" element={<InsightsScreen userId={userId} />} />
      <Route path="reglages" element={<SettingsScreen />} />
    </Routes>
  )
}

function Menu() {
  return (
    <div className="app">
      <header className="screen-head"><h1>Plus</h1></header>
      {LINKS.map((l) => (
        <NavLink className="menu-row" to={l.to} key={l.to}>
          <span className="menu-label">{l.label}</span>
          <span className="xs muted">{l.hint}</span>
          <span className="liaison-chevron">›</span>
        </NavLink>
      ))}
    </div>
  )
}
