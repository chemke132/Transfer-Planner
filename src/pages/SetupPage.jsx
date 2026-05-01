import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetup } from '../hooks/useSetup.js'
import { useAppData } from '../hooks/useAppData.jsx'

const ONBOARDING_KEY = 'tp:onboarding_dismissed'

export default function SetupPage() {
  const navigate = useNavigate()
  const { setup, setSetup, addTarget, removeTarget } = useSetup()
  const { schoolsByType, targetMajorsForSchool, SCHOOLS, TARGET_MAJORS } = useAppData()

  const ccs = schoolsByType('CC')
  const ucSchools = schoolsByType('UC')
  const csuSchools = schoolsByType('CSU')

  // New-target picker state (controlled — independent of the existing list).
  const initialSchool = ucSchools[0]?.id || ''
  const [pickerSchool, setPickerSchool] = useState(initialSchool)
  const pickerMajors = useMemo(
    () => targetMajorsForSchool(pickerSchool),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickerSchool, TARGET_MAJORS],
  )
  const [pickerMajor, setPickerMajor] = useState(pickerMajors[0]?.id || '')

  // Re-select first major when school changes.
  function handlePickerSchool(id) {
    setPickerSchool(id)
    const first = targetMajorsForSchool(id)[0]
    setPickerMajor(first?.id || '')
  }

  function handleAdd() {
    if (!pickerSchool || !pickerMajor) return
    addTarget({ school_id: pickerSchool, major_id: pickerMajor })
  }

  function handleSubmit(e) {
    e.preventDefault()
    navigate('/requirements')
  }

  // First-visit welcome banner. Dismissible; persists per-browser via
  // localStorage so returning users don't see it again. New users get a
  // 3-step explainer so they know what's coming after this page.
  const [showIntro, setShowIntro] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setShowIntro(window.localStorage.getItem(ONBOARDING_KEY) !== '1')
  }, [])
  function dismissIntro() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ONBOARDING_KEY, '1')
    }
    setShowIntro(false)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {showIntro && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="font-semibold text-base">
              👋 Welcome — here's how it works
            </h2>
            <button
              onClick={dismissIntro}
              aria-label="Dismiss welcome message"
              className="text-slate-400 hover:text-slate-700 text-lg leading-none shrink-0"
            >
              ×
            </button>
          </div>
          <ol className="space-y-2 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-semibold shrink-0">
                1
              </span>
              <div>
                <span className="font-medium">Setup</span> — pick your
                community college and the UC majors you're considering.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shrink-0">
                2
              </span>
              <div>
                <span className="font-medium">Requirements</span> — review the
                courses each target needs, choose between OR-paths, and pick
                Cal-GETC electives.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold shrink-0">
                3
              </span>
              <div>
                <span className="font-medium">Planner</span> — drag courses
                into semesters (or hit Auto-Plan) to build a transfer
                schedule that respects prereqs.
              </div>
            </li>
          </ol>
          <button
            onClick={dismissIntro}
            className="mt-4 text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Got it, don't show again
          </button>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Setup</h1>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg border">
        <Field label="Current community college">
          <select
            value={setup.cc_id}
            onChange={(e) => setSetup({ cc_id: e.target.value })}
            className="input"
          >
            {ccs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>

        <div>
          <div className="text-sm font-medium mb-1">Target majors</div>
          <p className="text-xs text-slate-500 mb-3">
            Add every (school × major) pair you're considering. The planner will
            union all required courses and highlight which are needed by the
            most schools.
          </p>

          {setup.targets.length === 0 ? (
            <div className="text-sm text-slate-400 italic mb-3">
              No targets yet. Add one below.
            </div>
          ) : (
            <ul className="space-y-2 mb-4">
              {setup.targets.map((t, idx) => {
                const school = SCHOOLS[t.school_id]
                const major = TARGET_MAJORS[t.major_id]
                return (
                  <li
                    key={`${t.school_id}:${t.major_id}:${idx}`}
                    className="flex items-center justify-between gap-2 bg-slate-50 border rounded-md px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{school?.name || t.school_id}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="text-slate-700">{major?.name || t.major_id}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTarget(idx)}
                      disabled={setup.targets.length <= 1}
                      aria-label="Remove target"
                      className="shrink-0 inline-flex items-center justify-center min-w-[40px] min-h-[40px] -my-1 -mr-1 rounded-md text-lg leading-none text-slate-400 hover:text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={
                        setup.targets.length <= 1
                          ? 'At least one target required'
                          : 'Remove'
                      }
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">School</span>
              <select
                value={pickerSchool}
                onChange={(e) => handlePickerSchool(e.target.value)}
                className="input"
              >
                <optgroup label="UC">
                  {ucSchools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
                {csuSchools.length > 0 && (
                  <optgroup label="CSU">
                    {csuSchools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1">Major</span>
              <select
                value={pickerMajor}
                onChange={(e) => setPickerMajor(e.target.value)}
                className="input"
              >
                {pickerMajors.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAdd}
              className="bg-slate-900 text-white rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-800"
            >
              + Add
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 text-white rounded-md py-2 font-medium hover:bg-slate-800"
        >
          Continue
        </button>
      </form>
      <style>{`.input{width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;background:white}`}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  )
}
