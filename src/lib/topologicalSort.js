export function topologicalSort(courses, prerequisites) {
  const indegree = new Map()
  const graph = new Map()
  const byId = new Map()

  for (const c of courses) {
    indegree.set(c.id, 0)
    graph.set(c.id, [])
    byId.set(c.id, c)
  }

  for (const { course_id, prerequisite_id } of prerequisites) {
    if (!byId.has(course_id) || !byId.has(prerequisite_id)) continue
    graph.get(prerequisite_id).push(course_id)
    indegree.set(course_id, indegree.get(course_id) + 1)
  }

  const queue = []
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id)

  const ordered = []
  while (queue.length) {
    queue.sort((a, b) => a.localeCompare(b))
    const id = queue.shift()
    ordered.push(byId.get(id))
    for (const next of graph.get(id)) {
      indegree.set(next, indegree.get(next) - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }

  if (ordered.length !== courses.length) {
    throw new Error('Cycle detected in prerequisites')
  }
  return ordered
}

function subjectOf(course) {
  // "PHYS 130" -> "PHYS", "COMSC 110" -> "COMSC"
  const match = (course.code || '').match(/^([A-Za-z]+)/)
  return match ? match[1].toUpperCase() : course.code || course.id
}

// Plan courses into a sequence of semester slots.
// slots: [{ id, unitCap, maxCourses?, pinnedCourses? }]
//   pinnedCourses are treated as already placed in that slot — they count toward
//   capacity and contribute to prereq ordering but are not re-placed by the planner.
//   If we need more slots than provided, we keep extending with the last slot's config
//   (but with a generated id) so planning never fails silently.
export function autoPlanSemesters(courses, prerequisites, slots) {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error('autoPlanSemesters requires at least one semester slot')
  }

  const ordered = topologicalSort(courses, prerequisites)
  const prereqMap = new Map()
  for (const c of courses) prereqMap.set(c.id, new Set())
  for (const { course_id, prerequisite_id } of prerequisites) {
    if (prereqMap.has(course_id)) prereqMap.get(course_id).add(prerequisite_id)
  }

  const semesters = []
  const placed = new Map()

  function ensureSemester(i) {
    while (semesters.length <= i) {
      const idx = semesters.length
      const base = slots[idx] ?? slots[slots.length - 1]
      const id = slots[idx]?.id ?? `${base.id}+${idx - slots.length + 1}`
      const pinned = slots[idx]?.pinnedCourses ?? []
      const pinnedUnits = pinned.reduce((sum, c) => sum + (c.units || 0), 0)
      const pinnedSubjects = new Set(pinned.map(subjectOf))
      semesters.push({
        index: idx,
        id,
        courses: [],          // newly planned courses only
        pinnedCourses: pinned, // passthrough for caller
        units: pinnedUnits,
        subjects: pinnedSubjects,
        unitCap: base.unitCap ?? 15,
        maxCourses: base.maxCourses ?? Infinity,
        pinnedCount: pinned.length,
      })
      for (const c of pinned) placed.set(c.id, idx)
    }
    return semesters[i]
  }

  ensureSemester(0)

  for (const course of ordered) {
    // Defensive: if somehow this id is already pinned, skip replanning it.
    if (placed.has(course.id)) continue

    const prereqSemesters = [...prereqMap.get(course.id)]
      .map((id) => placed.get(id))
      .filter((v) => v !== undefined)
    const earliest = prereqSemesters.length ? Math.max(...prereqSemesters) + 1 : 0
    const subject = subjectOf(course)

    let target = ensureSemester(earliest)
    while (
      target.units + (course.units || 0) > target.unitCap ||
      target.subjects.has(subject) ||
      target.courses.length + target.pinnedCount >= target.maxCourses
    ) {
      target = ensureSemester(target.index + 1)
    }

    target.courses.push(course)
    target.units += course.units || 0
    target.subjects.add(subject)
    placed.set(course.id, target.index)
  }

  return semesters
}
