import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadReferenceData } from '../lib/api.js'

// AppData caches the reference tables (schools, majors, courses, prereqs,
// transfer paths) once for the whole app. Replaces direct `seed.js` imports in
// pages/components — when the provider is mounted they get Supabase-backed data.
//
// Helpers (findTransferPath, getMajorCourses, ...) are attached to the returned
// `data` object so they close over whichever dataset was loaded.

const AppDataContext = createContext(null)

function buildHelpers(data) {
  const coursesById = new Map(data.COURSES.map((c) => [c.id, c]))

  function findTransferPath({ cc_id, target_major_id }) {
    return data.TRANSFER_PATHS.find(
      (p) => p.cc_id === cc_id && p.target_major_id === target_major_id,
    )
  }
  // Resolve effective required course ids for a path, honoring the user's
  // OR-branch selections. For paths without articulation data (hand-seeded
  // UCLA/UCSD) this falls back to path.required_course_ids directly.
  function getRequiredCourseIds(path, orChoices = {}) {
    if (!path) return []
    const arts = path.articulations || []
    if (!arts.length) return path.required_course_ids || []

    const ids = new Set()
    for (const art of arts) {
      if (!art.has_articulation) continue
      const opts = art.options || []
      if (!opts.length) continue
      const chosenIdx = orChoices[art.id] ?? 0
      const chosen = opts.find((o) => o.option_index === chosenIdx) || opts[0]
      for (const cid of chosen.course_ids || []) ids.add(cid)
    }
    return [...ids]
  }
  // Build once: course_id -> [prerequisite_id, ...]
  const prereqByCourse = new Map()
  for (const p of data.PREREQUISITES || []) {
    if (!prereqByCourse.has(p.course_id)) prereqByCourse.set(p.course_id, [])
    prereqByCourse.get(p.course_id).push(p.prerequisite_id)
  }

  // Given a set of course ids, return a Set containing those ids plus all
  // transitive prerequisites. The DVC catalog imposes internal prereq chains
  // (e.g. COMSC 210 needs 165, which needs 110) that assist.org doesn't
  // surface — so we include them implicitly in the plan.
  function expandPrereqs(seedIds) {
    const all = new Set(seedIds)
    const queue = [...seedIds]
    while (queue.length) {
      const id = queue.shift()
      for (const pid of prereqByCourse.get(id) || []) {
        if (!all.has(pid)) {
          all.add(pid)
          queue.push(pid)
        }
      }
    }
    return all
  }

  function getMajorCourses(path, orChoices) {
    const directIds = getRequiredCourseIds(path, orChoices)
    const allIds = expandPrereqs(directIds)
    return [...allIds].map((id) => coursesById.get(id)).filter(Boolean)
  }

  // Returns the subset of required course ids that are DIRECTLY listed by
  // the UC (articulation/hand-seed), not pulled in via transitive prereqs.
  // UI can use this to distinguish "required" vs "prereq-for-required".
  function getDirectRequiredIds(path, orChoices) {
    return new Set(getRequiredCourseIds(path, orChoices))
  }
  function getCalGetcCourses(cc_id) {
    return data.COURSES.filter((c) => c.school_id === cc_id && c.cal_getc_area)
  }
  function filterPrerequisites(courseIds) {
    const set = new Set(courseIds)
    return data.PREREQUISITES.filter(
      (p) => set.has(p.course_id) && set.has(p.prerequisite_id),
    )
  }
  function targetMajorsForSchool(schoolId) {
    return Object.values(data.TARGET_MAJORS).filter((m) => m.school_id === schoolId)
  }
  function schoolsByType(type) {
    return Object.values(data.SCHOOLS).filter((s) => s.type === type)
  }

  return {
    findTransferPath,
    getRequiredCourseIds,
    getDirectRequiredIds,
    getMajorCourses,
    getCalGetcCourses,
    filterPrerequisites,
    targetMajorsForSchool,
    schoolsByType,
  }
}

export function AppDataProvider({ children }) {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    loadReferenceData()
      .then((data) => {
        if (cancelled) return
        setState({ loading: false, error: null, data })
      })
      .catch((err) => {
        if (cancelled) return
        setState({ loading: false, error: err, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => {
    if (!state.data) return state
    const helpers = buildHelpers(state.data)
    return { ...state, ...state.data, ...helpers }
  }, [state])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>')
  return ctx
}
