import { useMemo, useState } from 'react'
import { useSetup } from '../../hooks/useSetup.js'
import { useCalGetcSelections } from '../../hooks/useCalGetcSelections.js'
import { useAppData } from '../../hooks/useAppData.jsx'

export default function CalGetcSelector() {
  const { setup } = useSetup()
  const { CAL_GETC_AREAS, getCalGetcCourses } = useAppData()
  const areaCodes = Object.keys(CAL_GETC_AREAS)
  const [activeArea, setActiveArea] = useState(areaCodes[0])
  const { selected, toggle } = useCalGetcSelections()

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

  const countSelected = (areaCode) =>
    byArea.get(areaCode).filter((c) => selected.has(c.id)).length

  const activeCourses = byArea.get(activeArea) || []
  const activeMeta = CAL_GETC_AREAS[activeArea]
  const activeSelected = countSelected(activeArea)

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
              onClick={() => setActiveArea(code)}
            />
          ))}
        </div>
        <ul className="hidden md:block space-y-1">
          {areaCodes.map((code) => {
            const meta = CAL_GETC_AREAS[code]
            const count = countSelected(code)
            const done = count >= meta.required
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
                      done
                        ? 'bg-emerald-500 text-white'
                        : activeArea === code
                        ? 'bg-slate-700 text-slate-100'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {count}/{meta.required}
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
              activeSelected >= activeMeta.required ? 'text-emerald-600' : 'text-slate-500'
            }`}
          >
            {activeSelected} / {activeMeta.required} selected
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Pick {activeMeta.required} course{activeMeta.required > 1 ? 's' : ''} from this area.
        </p>

        {activeCourses.length === 0 ? (
          <div className="text-sm text-slate-400 italic">No courses seeded for this area yet.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {activeCourses.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                selected={selected.has(c.id)}
                onToggle={() => toggle(c.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AreaPill({ code, meta, count, active, onClick }) {
  const done = count >= meta.required
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700'
      }`}
    >
      {code} <span className={done ? 'text-emerald-400' : 'opacity-70'}>({count}/{meta.required})</span>
    </button>
  )
}

function CourseCard({ course, selected, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`text-left rounded-md border p-3 transition ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'bg-white hover:border-slate-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm">{course.code}</div>
          <div className={`text-xs ${selected ? 'text-slate-300' : 'text-slate-600'}`}>
            {course.name}
          </div>
        </div>
        <div className={`text-xs shrink-0 ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          {course.units}u
        </div>
      </div>
      <div className={`text-xs mt-2 ${selected ? 'text-slate-200' : 'text-slate-400'}`}>
        {selected ? '✓ selected' : 'click to select'}
      </div>
    </button>
  )
}
