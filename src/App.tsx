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
import SettingsPage from './pages/SettingsPage'
import ActivitiesPage from './pages/ActivitiesPage'
import { OpcProvider } from './contexts/OpcContext'
import { ToastContainer } from './components/Toast'
import LicenseGate from './components/LicenseGate'

// Load bundle skills metadata at app startup
async function loadBundleSkillsMetadata() {
  try {
    const res = await fetch('/api/get_bundle_skills_metadata')
    if (res.ok) {
      const metadata = await res.json()
      ;(window as any).__BUNDLE_SKILLS_METADATA = metadata
    }
  } catch (e) {
    console.warn('Failed to load bundle skills metadata, using fallback')
  }
}

export default function App() {
  // Load metadata asynchronously (won't block rendering)
  loadBundleSkillsMetadata()

  return (
    <LicenseGate>
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
            <Route path="activities" element={<ActivitiesPage />} />
            <Route path="office" element={<OfficePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <ToastContainer />
      </OpcProvider>
    </LicenseGate>
  )
}
