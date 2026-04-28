import { useSetup } from '../../hooks/useSetup.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'
import { useTrackChoices } from '../../hooks/useTrackChoices.js'

export default function MajorList() {
  const { setup } = useSetup()
  const {
    findTransferPath,
    getMajorCourses,
    getDirectRequiredIds,
    PREREQUISITES,
    TARGET_MAJORS,
    SCHOOLS,
  } = useAppData()
  const { choices, setChoice } = useOrChoices()
  const { choices: trackChoices, setChoice: setTrackChoice } = useTrackChoices()
  const path = findTransferPath({ cc_id: setup.cc_id, target_major_id: setup.target_major_id })
  const major = getMajorCourses(path, choices, trackChoices)
  const directIds = getDirectRequiredIds(path, choices, trackChoices)
  const orGroups = path?.or_groups || []
  const multiOptionArts = (path?.articulations || []).filter(
    (a) => a.has_articulation && (a.options || []).length > 1,
  )
  const totalUnits = major.reduce((sum, c) => sum + (c.units || 0), 0)
  const targetMajor = TARGET_MAJORS[setup.target_major_id]
  const targetSchool = targetMajor ? SCHOOLS[targetMajor.school_id] : null

  const prereqByCourse = new Map()
  for (const c of major) prereqByCourse.set(c.id, [])
  for (const p of PREREQUISITES) {
    if (prereqByCourse.has(p.course_id)) prereqByCourse.get(p.course_id).push(p.prerequisite_id)
  }

  const codeById = new Map(major.map((c) => [c.id, c.code]))

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">
          Major — {targetMajor?.name}
          {targetSchool && <span className="text-slate-500 font-normal"> · {targetSchool.name}</span>}
        </h2>
        <div className="text-sm text-slate-500">{major.length} courses · {totalUnits} units</div>
      </div>

      {orGroups.length > 0 && (
        <div className="mb-6 rounded-md border border-violet-200 bg-violet-50 p-4">
          <h3 className="text-sm font-semibold text-violet-900 mb-1">
            Choose your track
          </h3>
          <p className="text-xs text-violet-800/80 mb-3">
            This major lets you complete different course series. Pick one per
            group — only the chosen series counts toward your major.
          </p>
          <ul className="space-y-4">
            {orGroups.map((group, gIdx) => {
              const chosenIdx = trackChoices[group.id] ?? 0
              return (
                <li key={group.id} className="text-sm">
                  <div className="font-medium text-slate-800 mb-2">
                    Group {gIdx + 1} — pick one section
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.sections.map((sec) => {
                      const active = chosenIdx === sec.section_index
                      const codes = sec.receiving_codes || []
                      return (
                        <button
                          key={sec.id}
                          onClick={() => setTrackChoice(group.id, sec.section_index)}
                          className={`px-3 py-2 rounded-md border text-xs text-left max-w-xs ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                          }`}
                        >
                          <div className={`font-mono font-semibold ${active ? '' : 'text-slate-900'}`}>
                            {codes.slice(0, 4).join(' · ')}
                            {codes.length > 4 && ` …+${codes.length - 4}`}
                          </div>
                          {sec.section_index === 0 && (
                            <div className={`text-[10px] mt-0.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                              default
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {multiOptionArts.length > 0 && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">
            Alternative courses
          </h3>
          <p className="text-xs text-blue-800/80 mb-3">
            Some UC courses can be satisfied by multiple CC pathways. Pick the one you took (or plan to take).
          </p>
          <ul className="space-y-3">
            {multiOptionArts.map((art) => {
              const chosen = choices[art.id] ?? 0
              return (
                <li key={art.id} className="text-sm">
                  <div className="font-medium text-slate-800 mb-1">
                    {art.receiving_code}
                    {art.receiving_name && (
                      <span className="text-slate-500 font-normal"> — {art.receiving_name}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {art.options.map((opt) => {
                      const active = chosen === opt.option_index
                      return (
                        <button
                          key={opt.id}
                          onClick={() => setChoice(art.id, opt.option_index)}
                          className={`px-2.5 py-1 rounded-md border text-xs ${
                            active
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {opt.label}
                          {opt.option_index === 0 && (
                            <span className={`ml-1.5 text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}>
                              default
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {!path ? (
        <div className="text-sm text-slate-400 italic">
          No transfer path data for this combination yet.
        </div>
      ) : (
        <ul className="grid md:grid-cols-2 gap-2">
          {major.map((c) => {
            const prereqs = (prereqByCourse.get(c.id) || [])
              .map((id) => codeById.get(id))
              .filter(Boolean)
            const isDirect = directIds.has(c.id)
            return (
              <li key={c.id} className="bg-white border rounded-md px-3 py-2 text-sm flex justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    <span>{c.code} — {c.name}</span>
                    {!isDirect && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        prereq
                      </span>
                    )}
                  </div>
                  {prereqs.length > 0 && (
                    <div className="text-xs text-slate-500">prereq: {prereqs.join(', ')}</div>
                  )}
                </div>
                <div className="text-slate-500 shrink-0 ml-2">{c.units}u</div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
