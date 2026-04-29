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
  // OR-branch selections AND OR-group track selections. For paths without
  // articulation data this falls back to path.required_course_ids directly.
  //
  // Two distinct levels of "OR":
  //   - orChoices    : per-articulation OR (e.g. MATH 11 = STAT C1000E vs C1000)
  //   - trackChoices : path-level "pick a track" (e.g. MATH 10-series vs 20-series)
  //
  // For track gating, each OR-group's sections list `receiving_codes`. We
  // build the set of codes that count as "currently active" — codes from
  // chosen sections + codes that are NOT in any group at all (always
  // required). Articulations whose receiving_code is in a non-chosen
  // section are skipped.
  function getRequiredCourseIds(path, orChoices = {}, trackChoices = {}) {
    if (!path) return []
    const arts = path.articulations || []
    if (!arts.length) return path.required_course_ids || []

    const groups = path.or_groups || []
    let activeCodes = null
    if (groups.length) {
      // Codes appearing in any group's sections (could be active or inactive).
      const inAnyGroup = new Set()
      // Codes the user has currently chosen across all groups.
      const chosenCodes = new Set()
      for (const g of groups) {
        // Default selection: first `min_count` section indexes (so the user
        // sees a fully-satisfied requirement until they pick something).
        const minCount = g.min_count || 1
        const stored = trackChoices[g.id]
        let chosenIndexes
        if (Array.isArray(stored)) {
          chosenIndexes = new Set(stored)
        } else if (typeof stored === 'number') {
          chosenIndexes = new Set([stored])
        } else {
          chosenIndexes = new Set()
          for (let i = 0; i < minCount; i++) chosenIndexes.add(i)
        }
        // Note: allow_multi changes UI semantics (radio vs checkbox) but
        // the union math is the same regardless — chosenIndexes is treated
        // as a set of "active" sections and we union their codes below.
        for (const sec of g.sections || []) {
          for (const code of sec.receiving_codes || []) {
            inAnyGroup.add(code)
            if (chosenIndexes.has(sec.section_index)) chosenCodes.add(code)
          }
        }
      }
      activeCodes = { inAnyGroup, chosenCodes }
    }

    const ids = new Set()
    for (const art of arts) {
      if (!art.has_articulation) continue
      // is_elective = NFromArea QuarterUnit advisor-pick bucket. Drop from
      // the default required union; advanced UI can opt these in later.
      if (art.is_elective) continue
      const opts = art.options || []
      if (!opts.length) continue
      // Track filter: if this art's receiving_code lives in some OR-group,
      // include only when it's in the chosen section.
      if (activeCodes) {
        const code = art.receiving_code
        if (activeCodes.inAnyGroup.has(code) && !activeCodes.chosenCodes.has(code)) {
          continue
        }
      }
      const chosenIdx = orChoices[art.id] ?? 0
      const chosen = opts.find((o) => o.option_index === chosenIdx) || opts[0]
      for (const cid of chosen.course_ids || []) ids.add(cid)
    }
    return [...ids]
  }
  // Build once: course_id -> [prerequisite_id, ...] (the default branch).
  const prereqByCourse = new Map()
  for (const p of data.PREREQUISITES || []) {
    if (!prereqByCourse.has(p.course_id)) prereqByCourse.set(p.course_id, [])
    prereqByCourse.get(p.course_id).push(p.prerequisite_id)
  }

  const prereqOptionsByCourse =
    data.PREREQ_OPTIONS_BY_COURSE instanceof Map
      ? data.PREREQ_OPTIONS_BY_COURSE
      : new Map()

  // Resolve per-course prereq ids honoring the user's branch choice.
  // Falls back to the default flat prereqByCourse when no options exist
  // (or when the chosen branch index isn't found).
  function getPrereqIdsFor(courseId, prereqChoices = {}) {
    const opts = prereqOptionsByCourse.get(courseId)
    if (opts && opts.length) {
      const chosenIdx = prereqChoices[courseId] ?? 0
      const chosen = opts.find((o) => o.option_index === chosenIdx) || opts[0]
      return chosen.prerequisite_ids || []
    }
    return prereqByCourse.get(courseId) || []
  }

  // Given a set of course ids, return a Set containing those ids plus all
  // transitive prerequisites along each course's currently-chosen branch.
  function expandPrereqs(seedIds, prereqChoices = {}) {
    const all = new Set(seedIds)
    const queue = [...seedIds]
    while (queue.length) {
      const id = queue.shift()
      for (const pid of getPrereqIdsFor(id, prereqChoices)) {
        if (!all.has(pid)) {
          all.add(pid)
          queue.push(pid)
        }
      }
    }
    return all
  }

  function getMajorCourses(path, orChoices, trackChoices, prereqChoices) {
    const directIds = getRequiredCourseIds(path, orChoices, trackChoices)
    const allIds = expandPrereqs(directIds, prereqChoices)
    return [...allIds].map((id) => coursesById.get(id)).filter(Boolean)
  }

  // Returns the subset of required course ids that are DIRECTLY listed by
  // the UC (articulation/hand-seed), not pulled in via transitive prereqs.
  // UI can use this to distinguish "required" vs "prereq-for-required".
  function getDirectRequiredIds(path, orChoices, trackChoices) {
    return new Set(getRequiredCourseIds(path, orChoices, trackChoices))
  }

  // ── Multi-target helpers ────────────────────────────────────────────────
  // A "target" = { school_id, major_id }. Transfer applicants typically apply
  // to multiple UC campuses, so the planner unions the requirements across
  // every chosen target. For each course we also track WHICH targets need it,
  // so the UI can prioritize "needed by all 3 schools" over "UCB only".

  // Returns Map<courseId, { course, targets: Set<targetIndex>, isDirect: boolean }>.
  // - targets: which target indexes (in `targets` array) require this course
  //   (either directly, or indirectly via prereq chain)
  // - isDirect: true if at least one target lists the course directly
  //   (not just as a transitive prereq)
  function getRequirementMap(
    cc_id,
    targets,
    orChoices = {},
    trackChoices = {},
    prereqChoices = {},
  ) {
    const map = new Map()
    if (!targets || !targets.length) return map
    targets.forEach((t, idx) => {
      const path = findTransferPath({
        cc_id,
        target_major_id: t.major_id,
      })
      if (!path) return
      const directIds = getRequiredCourseIds(path, orChoices, trackChoices)
      const directSet = new Set(directIds)
      const allIds = expandPrereqs(directIds, prereqChoices)
      for (const id of allIds) {
        const course = coursesById.get(id)
        if (!course) continue
        let entry = map.get(id)
        if (!entry) {
          entry = { course, targets: new Set(), isDirect: false }
          map.set(id, entry)
        }
        entry.targets.add(idx)
        if (directSet.has(id)) entry.isDirect = true
      }
    })
    return map
  }

  // Convenience: flat array of courses across all targets (deduped).
  function getMajorCoursesForTargets(
    cc_id,
    targets,
    orChoices,
    trackChoices,
    prereqChoices,
  ) {
    const reqMap = getRequirementMap(
      cc_id,
      targets,
      orChoices,
      trackChoices,
      prereqChoices,
    )
    return [...reqMap.values()].map((e) => e.course)
  }

  // Convenience: set of ids that are directly required by at least one target.
  function getDirectRequiredIdsForTargets(
    cc_id,
    targets,
    orChoices,
    trackChoices,
    prereqChoices,
  ) {
    const reqMap = getRequirementMap(
      cc_id,
      targets,
      orChoices,
      trackChoices,
      prereqChoices,
    )
    const out = new Set()
    for (const [id, e] of reqMap) if (e.isDirect) out.add(id)
    return out
  }

  // For an OR-group section, return the set of CC course ids that THAT
  // section would contribute if chosen — by unioning each receiving_code's
  // articulation's currently-chosen option course_ids.
  function getSectionCourseIds(path, section, orChoices = {}) {
    const ids = new Set()
    if (!path || !section) return ids
    const arts = path.articulations || []
    const codes = new Set(section.receiving_codes || [])
    for (const art of arts) {
      if (!art.has_articulation) continue
      if (!codes.has(art.receiving_code)) continue
      const opts = art.options || []
      if (!opts.length) continue
      const chosenIdx = orChoices[art.id] ?? 0
      const chosen = opts.find((o) => o.option_index === chosenIdx) || opts[0]
      for (const cid of chosen.course_ids || []) ids.add(cid)
    }
    return ids
  }

  // For a given target (by index), compute the set of CC course ids already
  // required by all OTHER targets — including their transitive prereqs.
  // Used to highlight which OR-group section overlaps most with the rest of
  // the user's plan.
  function getOtherTargetsRequiredIds(
    cc_id,
    targets,
    excludeIdx,
    orChoices,
    trackChoices,
  ) {
    const out = new Set()
    if (!targets) return out
    targets.forEach((t, i) => {
      if (i === excludeIdx) return
      const path = findTransferPath({ cc_id, target_major_id: t.major_id })
      if (!path) return
      const directIds = getRequiredCourseIds(path, orChoices, trackChoices)
      const allIds = expandPrereqs(directIds)
      for (const id of allIds) out.add(id)
    })
    return out
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
    return Object.values(data.TARGET_MAJORS)
      .filter((m) => m.school_id === schoolId)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }
  function schoolsByType(type) {
    return Object.values(data.SCHOOLS)
      .filter((s) => s.type === type)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  }

  return {
    findTransferPath,
    getRequiredCourseIds,
    getDirectRequiredIds,
    getMajorCourses,
    getRequirementMap,
    getMajorCoursesForTargets,
    getDirectRequiredIdsForTargets,
    getSectionCourseIds,
    getOtherTargetsRequiredIds,
    getPrereqIdsFor,
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
