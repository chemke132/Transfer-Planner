import { useEffect, useMemo, useState } from 'react'
import { useSetup } from '../../hooks/useSetup.js'
import { useCalGetcSelections } from '../../hooks/useCalGetcSelections.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'
import { useTrackChoices } from '../../hooks/useTrackChoices.js'
import { usePrereqChoices } from '../../hooks/usePrereqChoices.js'

export default function CalGetcSelector() {
  const { setup } = useSetup()
  const {
    CAL_GETC_AREAS,
    getCalGetcCourses,
    getMajorCoursesForTargets,
  } = useAppData()
  const { choices } = useOrChoices()
  const { choices: trackChoices } = useTrackChoices()
  const { choices: prereqChoices } = usePrereqChoices()
  const areaCodes = Object.keys(CAL_GETC_AREAS)
  const [activeArea, setActiveArea] = useState(areaCodes[0])
  const { selected, toggle, removeMany } = useCalGetcSelections()

  // Courses required by ANY target's major that also happen to satisfy a
  // Cal-GETC area. Students don't double up; we disable manual selection
  // for areas the union of major requirements already covers.
  const majorCoveredByArea = useMemo(() => {
    const major = getMajorCoursesForTargets(
      setup.cc_id,
      setup.targets,
      choices,
      trackChoices,
      prereqChoices,
    )
    const map = new Map()
    for (const code of areaCodes) map.set(code, [])
    for (const c of major) {
      if (c.school_id !== setup.cc_id) continue
      if (c.cal_getc_area && map.has(c.cal_getc_area)) map.get(c.cal_getc_area).push(c)
      if (c.cal_getc_lab_paired && map.has('5C')) map.get('5C').push(c)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.targets, choices, trackChoices])

  const byArea = useMemo(() => {
    const map = new Map()
    for (const code of areaCodes) map.set(code, [])
    for (const c of getCalGetcCourses(setup.cc_id)) {
      if (map.has(c.cal_getc_area)) map.get(c.cal_getc_area).push(c)
      // 5C (Laboratory) is satisfied by 5A/5B courses flagged lab-paired.
      if (c.cal_getc_lab_paired && map.has('5C')) map.get('5C').push(c)
    }
    return map
  }, [areaCodes, setup.cc_id])

  const coveredCount = (areaCode) => majorCoveredByArea.get(areaCode)?.length || 0
  const isAutoSatisfied = (areaCode) =>
    coveredCount(areaCode) >= CAL_GETC_AREAS[areaCode].required

  // Count includes major-covered courses (auto-satisfied) plus manual picks.
  const countSelected = (areaCode) => {
    const auto = coveredCount(areaCode)
    const manual = byArea.get(areaCode).filter(
      (c) => selected.has(c.id) && !majorCoveredByArea.get(areaCode).some((m) => m.id === c.id),
    ).length
    return auto + manual
  }

  // When the active major changes (or anything that flips an area into
  // auto-satisfied), prune any user-picked courses sitting in those now-
  // covered areas. Without this, an old BUS 240 pick from a previous major
  // sticks around in the UI and leaks into the planner pool.
  useEffect(() => {
    const stale = []
    for (const code of areaCodes) {
      if (!isAutoSatisfied(code)) continue
      const auto = majorCoveredByArea.get(code) || []
      const autoIds = new Set(auto.map((c) => c.id))
      for (const c of byArea.get(code) || []) {
        if (selected.has(c.id) && !autoIds.has(c.id)) stale.push(c.id)
      }
    }
    if (stale.length) removeMany(stale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [majorCoveredByArea, byArea])

  const activeCourses = byArea.get(activeArea) || []
  const activeMeta = CAL_GETC_AREAS[activeArea]
  const activeSelected = countSelected(activeArea)
  const activeAuto = majorCoveredByArea.get(activeArea) || []
  const autoIds = new Set(activeAuto.map((c) => c.id))
  const activeAutoSatisfied = isAutoSatisfied(activeArea)

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
      <aside className="md:border-r md:pr-4">
        <div className="md:hidden flex flex-wrap gap-2 mb-4">
          {areaCodes.map((code) => (
            <AreaPill
              key={code}
              code={code}
              meta={CAL_GETC_AREAS[code]}
              count={countSelected(code)}
              active={activeArea === code}
              auto={isAutoSatisfied(code)}
              onClick={() => setActiveArea(code)}
            />
          ))}
        </div>
        <ul className="hidden md:block space-y-1">
          {areaCodes.map((code) => {
            const meta = CAL_GETC_AREAS[code]
            const count = countSelected(code)
            const done = count >= meta.required
            const auto = isAutoSatisfied(code)
            return (
              <li key={code}>
                <button
                  onClick={() => setActiveArea(code)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                    activeArea === code ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
                  }`}
                >
                  <span>
                    <span className="font-semibold mr-2">{code}</span>
                    <span className={activeArea === code ? 'text-slate-200' : 'text-slate-600'}>
                      {meta.label}
                    </span>
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ml-2 ${
                      auto
                        ? 'bg-sky-500 text-white'
                        : done
                        ? 'bg-emerald-500 text-white'
                        : activeArea === code
                        ? 'bg-slate-700 text-slate-100'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {auto ? '✓ major' : `${count}/${meta.required}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section>
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="font-semibold">
            Area {activeArea} · <span className="text-slate-600 font-normal">{activeMeta.label}</span>
          </h2>
          <div
            className={`text-sm ${
              activeAutoSatisfied
                ? 'text-sky-600'
                : activeSelected >= activeMeta.required
                ? 'text-emerald-600'
                : 'text-slate-500'
            }`}
          >
            {activeAutoSatisfied
              ? 'Covered by major'
              : `${activeSelected} / ${activeMeta.required} selected`}
          </div>
        </div>

        {activeAuto.length > 0 && (
          <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm">
            <div className="font-semibold text-sky-900 mb-1">
              {activeAutoSatisfied
                ? 'This area is already covered by your major'
                : 'Partially covered by your major'}
            </div>
            <div className="text-xs text-sky-800/80 mb-2">
              {activeAutoSatisfied
                ? "You don't need to pick anything else here."
                : 'Major courses below satisfy some of this area. Pick the rest to finish.'}
            </div>
            <ul className="space-y-1">
              {activeAuto.map((c) => (
                <li key={c.id} className="text-xs text-sky-900">
                  <span className="font-mono font-semibold">{c.code}</span>
                  <span className="text-sky-800/80"> — {c.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!activeAutoSatisfied && (
          <p className="text-xs text-slate-500 mb-4">
            Pick {activeMeta.required} course{activeMeta.required > 1 ? 's' : ''} from this area.
          </p>
        )}

        {activeCourses.length === 0 ? (
          <div className="text-sm text-slate-400 italic">No courses seeded for this area yet.</div>
        ) : (
          <div
            className={`grid sm:grid-cols-2 gap-3 ${
              activeAutoSatisfied ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            {activeCourses.map((c) => {
              const isAuto = autoIds.has(c.id)
              return (
                <CourseCard
                  key={c.id}
                  course={c}
                  selected={isAuto || selected.has(c.id)}
                  auto={isAuto}
                  onToggle={() => !isAuto && toggle(c.id)}
                />
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function AreaPill({ code, meta, count, active, auto, onClick }) {
  const done = auto || count >= meta.required
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
      }`}
    >
      {code}{' '}
      <span className={done ? (auto ? 'text-sky-400' : 'text-emerald-400') : 'opacity-70'}>
        {auto ? '✓' : `(${count}/${meta.required})`}
      </span>
    </button>
  )
}

function CourseCard({ course, selected, auto, onToggle }) {
  return (
    <button
      onClick={onToggle}
      disabled={auto}
      className={`text-left rounded-md border p-3 transition ${
        auto
          ? 'border-sky-400 bg-sky-50 text-sky-900 cursor-default'
          : selected
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'bg-white hover:border-slate-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{course.code}</div>
          <div
            className={`text-xs ${
              auto ? 'text-sky-800/80' : selected ? 'text-slate-300' : 'text-slate-600'
            }`}
          >
            {course.name}
          </div>
        </div>
        <div
          className={`text-xs shrink-0 ${
            auto ? 'text-sky-800/80' : selected ? 'text-slate-300' : 'text-slate-500'
          }`}
        >
          {course.units}u
        </div>
      </div>
      <div
        className={`text-xs mt-2 ${
          auto ? 'text-sky-700' : selected ? 'text-slate-200' : 'text-slate-400'
        }`}
      >
        {auto ? '✓ covered by major' : selected ? '✓ selected' : 'click to select'}
      </div>
    </button>
  )
}
