import { Routes, Route, NavLink } from 'react-router-dom'
import SetupPage from './pages/SetupPage.jsx'
import RequirementsPage from './pages/RequirementsPage.jsx'
import PlannerPage from './pages/PlannerPage.jsx'
import FeedbackButton from './components/FeedbackButton.jsx'
import { useAppData } from './hooks/useAppData.jsx'

// Numbered stepper nav. Each item shows "1 Setup", "2 Requirements", "3 Planner"
// with a small connector hint between them. The active step gets the dark
// pill; completed/upcoming steps stay neutral. The number badge is the main
// visual cue that this is a sequential 3-step flow.
function StepNavLink({ to, end, num, label }) {
  return (
    <NavLink to={to} end={end} className="block">
      {({ isActive }) => (
        <span
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium ${
            isActive
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${
              isActive
                ? 'bg-white text-slate-900'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {num}
          </span>
          <span>{label}</span>
        </span>
      )}
    </NavLink>
  )
}

function StepConnector() {
  return (
    <span aria-hidden className="text-slate-300 select-none text-xs sm:text-sm">
      →
    </span>
  )
}

export default function App() {
  const { loading, error, source, fallbackReason } = useAppData()

  return (
    <div className="min-h-full flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <nav className="max-w-6xl mx-auto flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-3">
          <div className="hidden sm:block font-semibold mr-4">
            Transfer Planner
          </div>
          <StepNavLink to="/" end num={1} label="Setup" />
          <StepConnector />
          <StepNavLink to="/requirements" num={2} label="Requirements" />
          <StepConnector />
          <StepNavLink to="/planner" num={3} label="Planner" />
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
            truth for course registration.{' '}
            <span className="font-semibold">
              Found a bug, wrong prereq, or have an idea? Please let me know
              via the{' '}
              <span className="inline-block bg-slate-900 text-white px-1.5 py-0.5 rounded text-[10px] align-middle">
                💬 Feedback
              </span>{' '}
              button in the bottom-right — it really helps!
            </span>
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
