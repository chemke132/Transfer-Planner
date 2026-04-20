import { useMemo } from 'react'
import { useSetup } from '../../hooks/useSetup.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'

// Course Path is a flat, top-to-bottom reading order of every CC course the
// student needs to take — sorted so that prereqs always come before their
// dependents. Replaces the prior ReactFlow graph, which was harder to read at
// a glance once a major had 15+ nodes.
export default function CoursePath() {
  const { setup } = useSetup()
  const { findTransferPath, getMajorCourses, getDirectRequiredIds, filterPrerequisites } =
    useAppData()
  const { choices } = useOrChoices()

  const { ordered, prereqByCourse, directIds, totalUnits } = useMemo(() => {
    const path = findTransferPath({
      cc_id: setup.cc_id,
      target_major_id: setup.target_major_id,
    })
    const major = getMajorCourses(path, choices)
    if (!major.length) {
      return { ordered: [], prereqByCourse: new Map(), directIds: new Set(), totalUnits: 0 }
    }
    const prereqs = filterPrerequisites(major.map((c) => c.id))
    const sorted = topoSort(major, prereqs)
    const map = new Map(major.map((c) => [c.id, []]))
    for (const p of prereqs) {
      if (map.has(p.course_id)) map.get(p.course_id).push(p.prerequisite_id)
    }
    return {
      ordered: sorted,
      prereqByCourse: map,
      directIds: getDirectRequiredIds(path, choices),
      totalUnits: major.reduce((sum, c) => sum + (c.units || 0), 0),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.target_major_id, choices])

  if (!ordered.length) {
    return (
      <div className="text-sm text-slate-400 italic">No transfer path data yet.</div>
    )
  }

  const codeById = new Map(ordered.map((c) => [c.id, c.code]))

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">Suggested course order</h2>
        <div className="text-sm text-slate-500">
          {ordered.length} courses · {totalUnits} units
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Courses listed in prerequisite order — take earlier items before later ones. Prereq
        chains are resolved, so you can start from the top and work down.
      </p>
      <ol className="space-y-2">
        {ordered.map((c, idx) => {
          const prereqs = (prereqByCourse.get(c.id) || [])
            .map((id) => codeById.get(id))
            .filter(Boolean)
          const isDirect = directIds.has(c.id)
          return (
            <li
              key={c.id}
              className="bg-white border rounded-md px-3 py-2 flex items-start gap-3"
            >
              <div className="text-xs font-mono text-slate-400 w-6 text-right pt-0.5 shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">
                    {c.code} — {c.name}
                  </span>
                  {!isDirect && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                      prereq
                    </span>
                  )}
                  {c.cal_getc_area && (
                    <span className="text-[10px] uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                      Cal-GETC {c.cal_getc_area}
                      {c.cal_getc_lab_paired ? ' + 5C' : ''}
                    </span>
                  )}
                </div>
                {prereqs.length > 0 && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    prereq: {prereqs.join(', ')}
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-500 shrink-0">{c.units}u</div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Kahn's algorithm with alphabetical tiebreak on code for stable ordering.
function topoSort(courses, prereqs) {
  const byId = new Map(courses.map((c) => [c.id, c]))
  const indeg = new Map(courses.map((c) => [c.id, 0]))
  const adj = new Map(courses.map((c) => [c.id, []]))
  for (const { course_id, prerequisite_id } of prereqs) {
    if (!byId.has(course_id) || !byId.has(prerequisite_id)) continue
    adj.get(prerequisite_id).push(course_id)
    indeg.set(course_id, indeg.get(course_id) + 1)
  }
  const queue = courses.filter((c) => indeg.get(c.id) === 0)
  const out = []
  const pick = () => {
    queue.sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    return queue.shift()
  }
  while (queue.length) {
    const c = pick()
    out.push(c)
    for (const nxt of adj.get(c.id)) {
      indeg.set(nxt, indeg.get(nxt) - 1)
      if (indeg.get(nxt) === 0) queue.push(byId.get(nxt))
    }
  }
  if (out.length < courses.length) {
    const seen = new Set(out.map((c) => c.id))
    for (const c of courses) if (!seen.has(c.id)) out.push(c)
  }
  return out
}
