import { useMemo } from 'react'
import { useSetup } from '../../hooks/useSetup.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'

// Course Path: each row is one prereq chain (typically one department's
// ladder), laid out left-to-right with arrows. Courses without prereqs
// in the major start the row; their dependents follow rightward.
//
// Grouping: courses are bucketed by subject prefix (the first word of the
// course code: COMSC, MATH, PHYS, ENGL, ...). Within each bucket, courses
// are topologically sorted so prereqs come before dependents on the same
// row. Cross-subject prereqs are shown as a small note under the dependent.
export default function CoursePath() {
  const { setup } = useSetup()
  const { findTransferPath, getMajorCourses, getDirectRequiredIds, filterPrerequisites } =
    useAppData()
  const { choices } = useOrChoices()

  const { rows, prereqByCourse, directIds, totalUnits, codeById } = useMemo(() => {
    const path = findTransferPath({
      cc_id: setup.cc_id,
      target_major_id: setup.target_major_id,
    })
    const major = getMajorCourses(path, choices)
    if (!major.length) {
      return {
        rows: [],
        prereqByCourse: new Map(),
        directIds: new Set(),
        totalUnits: 0,
        codeById: new Map(),
      }
    }
    const prereqs = filterPrerequisites(major.map((c) => c.id))
    const prMap = new Map(major.map((c) => [c.id, []]))
    for (const p of prereqs) {
      if (prMap.has(p.course_id)) prMap.get(p.course_id).push(p.prerequisite_id)
    }

    // Group by subject prefix.
    const subjectOf = (c) => (c.code || '').split(/\s+/)[0] || 'OTHER'
    const groups = new Map()
    for (const c of major) {
      const s = subjectOf(c)
      if (!groups.has(s)) groups.set(s, [])
      groups.get(s).push(c)
    }

    // Within each group, topo-sort using only prereqs that are also in the group.
    const groupRows = []
    for (const [subject, courses] of groups) {
      const ids = new Set(courses.map((c) => c.id))
      const localPrereqs = prereqs.filter(
        (p) => ids.has(p.course_id) && ids.has(p.prerequisite_id),
      )
      const sorted = topoSort(courses, localPrereqs)
      groupRows.push({ subject, courses: sorted })
    }

    // Sort rows: bigger groups first, then alphabetical.
    groupRows.sort((a, b) => {
      if (b.courses.length !== a.courses.length) return b.courses.length - a.courses.length
      return a.subject.localeCompare(b.subject)
    })

    return {
      rows: groupRows,
      prereqByCourse: prMap,
      directIds: getDirectRequiredIds(path, choices),
      totalUnits: major.reduce((sum, c) => sum + (c.units || 0), 0),
      codeById: new Map(major.map((c) => [c.id, c.code])),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.target_major_id, choices])

  if (!rows.length) {
    return <div className="text-sm text-slate-400 italic">No transfer path data yet.</div>
  }

  const totalCourses = rows.reduce((n, r) => n + r.courses.length, 0)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">Course chains by subject</h2>
        <div className="text-sm text-slate-500">
          {totalCourses} courses · {totalUnits} units
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Each row is one subject's prereq chain. Read left-to-right within a row —
        earlier courses are prereqs for the ones to their right.
      </p>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.subject} className="bg-white border rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                {row.subject}
              </span>
              <span className="text-xs text-slate-400">
                {row.courses.length} course{row.courses.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <ol className="flex items-stretch gap-2 min-w-min">
                {row.courses.map((c, idx) => {
                  const isDirect = directIds.has(c.id)
                  const allPrereqIds = prereqByCourse.get(c.id) || []
                  // External prereqs = prereqs in the major but in another subject.
                  const externalPrereqs = allPrereqIds
                    .map((id) => codeById.get(id))
                    .filter((code) => code && code.split(/\s+/)[0] !== row.subject)
                  return (
                    <li key={c.id} className="flex items-center shrink-0">
                      {idx > 0 && (
                        <span className="text-slate-300 mx-1 select-none" aria-hidden>
                          →
                        </span>
                      )}
                      <CourseChip
                        course={c}
                        isDirect={isDirect}
                        externalPrereqs={externalPrereqs}
                      />
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CourseChip({ course, isDirect, externalPrereqs }) {
  return (
    <div
      className={`min-w-[160px] max-w-[220px] rounded-md border px-2.5 py-2 text-left ${
        isDirect ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-medium text-sm font-mono">{course.code}</div>
        <div className="text-[10px] text-slate-400 shrink-0">{course.units}u</div>
      </div>
      <div className="text-xs text-slate-600 leading-tight mt-0.5 line-clamp-2">
        {course.name}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {!isDirect && (
          <span className="text-[9px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1 py-0.5 rounded">
            prereq
          </span>
        )}
        {course.cal_getc_area && (
          <span className="text-[9px] uppercase tracking-wide bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded">
            GE {course.cal_getc_area}
            {course.cal_getc_lab_paired ? '+5C' : ''}
          </span>
        )}
      </div>
      {externalPrereqs.length > 0 && (
        <div className="text-[10px] text-slate-500 mt-1 leading-tight">
          also needs: {externalPrereqs.join(', ')}
        </div>
      )}
    </div>
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
