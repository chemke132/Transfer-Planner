import { Routes, Route, NavLink } from 'react-router-dom'
import SetupPage from './pages/SetupPage.jsx'
import RequirementsPage from './pages/RequirementsPage.jsx'
import PlannerPage from './pages/PlannerPage.jsx'
import FeedbackButton from './components/FeedbackButton.jsx'
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
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-6xl mx-auto px-4 py-2 text-xs text-amber-900 flex items-start gap-2">
          <span aria-hidden className="font-semibold">⚠️</span>
          <span>
            <span className="font-semibold">Work in progress — always double-check with your counselor and the official{' '}
              <a
                href="https://assist.org"
                target="_blank"
                rel="noreferrer"
                className="underline hover:no-underline"
              >
                assist.org
              </a>{' '}/{' '}
              <a
                href="https://icc.dvc.edu"
                target="_blank"
                rel="noreferrer"
                className="underline hover:no-underline"
              >
                DVC catalog
              </a>.
            </span>{' '}
            Articulation and prerequisite data is auto-scraped; alternative
            OR-paths, advisories, and some humanities majors may be missing
            or simplified. Do not rely on this tool as your sole source of
            truth for course registration.
          </span>
        </div>
      </div>
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
      <FeedbackButton />
    </div>
  )
}
