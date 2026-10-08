import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './components/Login'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Historique from './pages/Historique'
import Reglages from './pages/Reglages'
import Aujourdhui from './pages/planning/Aujourdhui'
import PlanningHistorique from './pages/planning/PlanningHistorique'
import PlanningReglages from './pages/planning/PlanningReglages'
import ModificationsHome from './pages/oncf/ModificationsHome'
import EcomOverview from './pages/ecom/EcomOverview'
import EcomImport from './pages/ecom/EcomImport'
import EcomReglages from './pages/ecom/EcomReglages'
import EcomMouvements from './pages/ecom/EcomMouvements'
import EcomProduits from './pages/ecom/EcomProduits'
import EcomMedia from './pages/ecom/EcomMedia'
import EcomStock from './pages/ecom/EcomStock'
import EcomSoir from './pages/ecom/EcomSoir'
import Aide from './pages/Aide'
import GoalsHome from './pages/goals/GoalsHome'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="login-screen">
        <p className="muted">Chargement…</p>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          {/* Budget */}
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/historique" element={<Historique />} />
          <Route path="/reglages" element={<Reglages />} />
          {/* Planning */}
          <Route path="/planning" element={<Aujourdhui />} />
          <Route path="/planning/historique" element={<PlanningHistorique />} />
          <Route path="/planning/reglages" element={<PlanningReglages />} />
          {/* Modifications ONCF */}
          <Route path="/oncf" element={<ModificationsHome />} />
          {/* E-commerce */}
          <Route path="/ecom" element={<EcomOverview />} />
          <Route path="/ecom/produits" element={<EcomProduits />} />
          <Route path="/ecom/media" element={<EcomMedia />} />
          <Route path="/ecom/stock" element={<EcomStock />} />
          <Route path="/ecom/soir" element={<EcomSoir />} />
          <Route path="/ecom/import" element={<EcomImport />} />
          <Route path="/ecom/mouvements" element={<EcomMouvements />} />
          <Route path="/ecom/reglages" element={<EcomReglages />} />
          {/* Objectifs 2026 */}
          <Route path="/goals" element={<GoalsHome />} />
          {/* Aide */}
          <Route path="/aide" element={<Aide />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
