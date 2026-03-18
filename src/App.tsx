import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import OverviewPage from './pages/OverviewPage'
import OpcPage from './pages/OpcPage'
import AgentsPage from './pages/AgentsPage'
import ProvidersPage from './pages/ProvidersPage'
import BindingsPage from './pages/BindingsPage'
import DeployPage from './pages/DeployPage'
import LogsPage from './pages/LogsPage'
import OfficePage from './pages/OfficePage'
import { OpcProvider } from './contexts/OpcContext'
import { ToastContainer } from './components/Toast'

export default function App() {
  return (
    <OpcProvider>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="opc" element={<OpcPage />} />
          <Route path="agents" element={<AgentsPage />} />
          <Route path="providers" element={<ProvidersPage />} />
          <Route path="bindings" element={<BindingsPage />} />
          <Route path="deploy" element={<DeployPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="office" element={<OfficePage />} />
        </Route>
      </Routes>
      <ToastContainer />
    </OpcProvider>
  )
}
