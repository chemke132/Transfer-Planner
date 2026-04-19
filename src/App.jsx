import { Routes, Route, NavLink } from 'react-router-dom'
import SetupPage from './pages/SetupPage.jsx'
import RequirementsPage from './pages/RequirementsPage.jsx'
import PlannerPage from './pages/PlannerPage.jsx'
import { useAppData } from './hooks/useAppData.jsx'

const navClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
  }`

export default function App() {
  const { loading, error, source, fallbackReason } = useAppData()

  return (
    <div className="min-h-full flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <nav className="max-w-6xl mx-auto flex items-center gap-2 px-4 py-3">
          <div className="font-semibold mr-4">Transfer Planner</div>
          <NavLink to="/" end className={navClass}>Setup</NavLink>
          <NavLink to="/requirements" className={navClass}>Requirements</NavLink>
          <NavLink to="/planner" className={navClass}>Planner</NavLink>
          {!loading && source === 'seed' && (
            <span
              className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded"
              title={fallbackReason || 'Supabase not reachable'}
            >
              using seed data
            </span>
          )}
        </nav>
      </header>
      <main className="flex-1">
        {loading ? (
          <div className="max-w-6xl mx-auto px-4 py-16 text-center text-slate-500">
            Loading course data…
          </div>
        ) : error ? (
          <div className="max-w-6xl mx-auto px-4 py-16 text-center text-red-600">
            Failed to load data: {String(error.message || error)}
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<SetupPage />} />
            <Route path="/requirements" element={<RequirementsPage />} />
            <Route path="/planner" element={<PlannerPage />} />
          </Routes>
        )}
      </main>
    </div>
  )
}
