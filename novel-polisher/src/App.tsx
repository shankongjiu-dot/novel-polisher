import { AppProvider } from './store/AppContext'
import { useApp } from './store/useApp'
import { SideNav } from './components/SideNav'
import { SettingsPanel } from './components/SettingsPanel'
import { ImportPage } from './pages/ImportPage'
import { ComparePage } from './pages/ComparePage'
import { ReviewPage } from './pages/ReviewPage'
import { ExportPage } from './pages/ExportPage'

function Workspace() {
  const { page } = useApp()
  switch (page) {
    case 'import':
      return <ImportPage />
    case 'compare':
      return <ComparePage />
    case 'review':
      return <ReviewPage />
    case 'export':
      return <ExportPage />
    case 'settings':
      return <SettingsPanel />
    default:
      return null
  }
}

function Shell() {
  const { page } = useApp()
  return (
    <div className="app-shell">
      <SideNav />
      <main className="main">
        <div className="page" key={page}>
          <Workspace />
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

export default App
