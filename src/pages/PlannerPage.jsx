import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, pointerWithin } from '@dnd-kit/core'
import SemesterColumn from '../components/Planner/SemesterColumn.jsx'
import AutoPlanButton from '../components/Planner/AutoPlanButton.jsx'
import StepNav from '../components/StepNav.jsx'
import { autoPlanSemesters } from '../lib/topologicalSort.js'
import { defaultTerms, extendTerms } from '../lib/terms.js'
import { useCalGetcSelections } from '../hooks/useCalGetcSelections.js'
import { useTakenCourses } from '../hooks/useTakenCourses.js'
import { useSetup } from '../hooks/useSetup.js'
import { useAppData } from '../hooks/useAppData.jsx'
import { useOrChoices } from '../hooks/useOrChoices.js'
import { useTrackChoices } from '../hooks/useTrackChoices.js'
import { usePrereqChoices } from '../hooks/usePrereqChoices.js'

const SUMMER_AUTO_CAP = 6
const SUMMER_AUTO_MAX_COURSES = 1

const STORAGE_KEY = 'tp:planner_state'
const STORAGE_VERSION = 1

function loadPersistedState() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STORAGE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

function buildInitialPool(majorCourses, calGetcCourses, selectedCalGetcIds) {
  const calGetc = calGetcCourses.filter((c) => selectedCalGetcIds.has(c.id))
  return [...majorCourses, ...calGetc]
}

function makeEmptySemesters(terms) {
  return terms.map((t) => ({ id: t.id, name: t.name, season: t.season, year: t.year, courses: [] }))
}

export default function PlannerPage() {
  const navigate = useNavigate()
  const { setup } = useSetup()
  const { selected: rawSelectedCalGetc } = useCalGetcSelections()
  const { taken, toggle: toggleTaken } = useTakenCourses()
  const { choices: orChoices } = useOrChoices()
  const { choices: trackChoices } = useTrackChoices()
  const { choices: prereqChoices } = usePrereqChoices()
  const {
    getMajorCoursesForTargets,
    getDirectRequiredIdsForTargets,
    getCalGetcCourses,
    filterPrerequisites,
    getPrereqIdsFor,
    PREREQUISITES,
    TARGET_MAJORS,
  } = useAppData()

  // Cal-GETC is suppressed only if EVERY selected target's major opts out.
  // If at least one target uses Cal-GETC, the planner still shows it.
  const requiresCalGetc = (setup.targets || []).some((t) => {
    const m = TARGET_MAJORS?.[t.major_id]
    return m?.requires_cal_getc !== false
  })
  const selectedCalGetc = useMemo(
    () => (requiresCalGetc ? rawSelectedCalGetc : new Set()),
    [requiresCalGetc, rawSelectedCalGetc],
  )

  // Derived per-setup context (UNION across all targets).
  const majorCourses = useMemo(
    () =>
      getMajorCoursesForTargets(
        setup.cc_id,
        setup.targets,
        orChoices,
        trackChoices,
        prereqChoices,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup.cc_id, setup.targets, orChoices, trackChoices, prereqChoices],
  )
  const directRequiredIds = useMemo(
    () =>
      getDirectRequiredIdsForTargets(
        setup.cc_id,
        setup.targets,
        orChoices,
        trackChoices,
        prereqChoices,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup.cc_id, setup.targets, orChoices, trackChoices, prereqChoices],
  )
  const majorIds = useMemo(() => new Set(majorCourses.map((c) => c.id)), [majorCourses])
  const calGetcCourses = useMemo(
    () => getCalGetcCourses(setup.cc_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup.cc_id],
  )
  const calGetcIds = useMemo(() => new Set(calGetcCourses.map((c) => c.id)), [calGetcCourses])

  const [unitCap, setUnitCap] = useState(() => {
    const persisted = loadPersistedState()
    return typeof persisted?.unitCap === 'number' ? persisted.unitCap : 15
  })
  const [terms] = useState(() => defaultTerms())
  const [semesters, setSemesters] = useState(() => {
    const persisted = loadPersistedState()
    if (Array.isArray(persisted?.semesters) && persisted.semesters.length > 0) {
      return persisted.semesters
    }
    return makeEmptySemesters(terms)
  })
  const [pinnedIds, setPinnedIds] = useState(() => {
    const persisted = loadPersistedState()
    return new Set(Array.isArray(persisted?.pinnedIds) ? persisted.pinnedIds : [])
  })
  const [pool, setPool] = useState(() => {
    const initial = buildInitialPool(majorCourses, calGetcCourses, selectedCalGetc)
    const persisted = loadPersistedState()
    if (Array.isArray(persisted?.semesters)) {
      const placed = new Set(
        persisted.semesters.flatMap((s) => (s.courses || []).map((c) => c.id)),
      )
      return initial.filter((c) => !placed.has(c.id))
    }
    return initial
  })
  const [activeCourse, setActiveCourse] = useState(null)
  // Separate mouse / touch sensors: mouse uses a distance threshold so a
  // click doesn't fire a drag, but touch uses a press-and-hold delay so the
  // user can still scroll the page without accidentally picking up a card.
  // Without TouchSensor, every touchmove on a draggable would be a drag —
  // making vertical scroll on mobile basically impossible.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  )

  // When the transfer path OR the OR-branch choices change, reconcile state:
  // - drop placed/pinned courses that are no longer required
  // - add newly-required courses to the pool (keep existing placements intact)
  useEffect(() => {
    setSemesters((prev) =>
      prev.map((s) => ({
        ...s,
        courses: s.courses.filter((c) => majorIds.has(c.id) || calGetcIds.has(c.id)),
      })),
    )
    setPool((prev) => {
      const placedIds = new Set(
        semesters.flatMap((s) => (s.courses || []).map((c) => c.id)),
      )
      const desiredIds = new Set([
        ...majorCourses.map((c) => c.id),
        ...calGetcCourses.filter((c) => selectedCalGetc.has(c.id)).map((c) => c.id),
      ])
      const keep = prev.filter((c) => desiredIds.has(c.id))
      const keepIds = new Set(keep.map((c) => c.id))
      const toAdd = [
        ...majorCourses,
        ...calGetcCourses.filter((c) => selectedCalGetc.has(c.id)),
      ].filter((c) => !keepIds.has(c.id) && !placedIds.has(c.id))
      return [...keep, ...toAdd]
    })
    setPinnedIds((prev) => {
      const next = new Set()
      for (const id of prev) if (majorIds.has(id) || calGetcIds.has(id)) next.add(id)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.targets, orChoices, trackChoices, prereqChoices])

  // Sync pool when Cal-GETC selection changes.
  useEffect(() => {
    const placedIds = new Set(semesters.flatMap((s) => s.courses.map((c) => c.id)))
    setPool((prev) => {
      const keep = prev.filter((c) => {
        const isCalGetc = calGetcIds.has(c.id)
        return isCalGetc ? selectedCalGetc.has(c.id) : true
      })
      const keepIds = new Set(keep.map((c) => c.id))
      const toAdd = calGetcCourses.filter(
        (c) =>
          selectedCalGetc.has(c.id) && !keepIds.has(c.id) && !placedIds.has(c.id),
      )
      return [...keep, ...toAdd]
    })
    setSemesters((prev) =>
      prev.map((s) => ({
        ...s,
        courses: s.courses.filter(
          (c) => !calGetcIds.has(c.id) || selectedCalGetc.has(c.id),
        ),
      })),
    )
    setPinnedIds((prev) => {
      const next = new Set()
      for (const id of prev) {
        if (!calGetcIds.has(id) || selectedCalGetc.has(id)) next.add(id)
      }
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCalGetc])

  // When the student marks a course "already taken", strip it from
  // semesters, the pool, and the pinned set. Taken courses are excluded
  // from the planner entirely — there's nothing left to schedule.
  useEffect(() => {
    if (taken.size === 0) return
    setSemesters((prev) =>
      prev.map((s) => ({ ...s, courses: s.courses.filter((c) => !taken.has(c.id)) })),
    )
    setPool((prev) => prev.filter((c) => !taken.has(c.id)))
    setPinnedIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of prev) {
        if (taken.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [taken])

  // When a course is un-marked (no longer taken), make sure it's available
  // in the pool again so the student can re-place it.
  useEffect(() => {
    setPool((prev) => {
      const have = new Set(prev.map((c) => c.id))
      const placed = new Set(semesters.flatMap((s) => s.courses.map((c) => c.id)))
      const desired = [
        ...majorCourses,
        ...calGetcCourses.filter((c) => selectedCalGetc.has(c.id)),
      ]
      const toAdd = desired.filter(
        (c) => !taken.has(c.id) && !have.has(c.id) && !placed.has(c.id),
      )
      return toAdd.length ? [...prev, ...toAdd] : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken])

  // Persist planner state on any change.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const payload = {
        version: STORAGE_VERSION,
        unitCap,
        semesters,
        pinnedIds: [...pinnedIds],
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore quota / serialization errors
    }
  }, [unitCap, semesters, pinnedIds])

  const allPlaced = useMemo(
    () => semesters.flatMap((s) => s.courses.map((c) => ({ ...c, semesterId: s.id }))),
    [semesters],
  )

  function handleAutoPlan() {
    const selectedCalGetcCourses = calGetcCourses.filter((c) => selectedCalGetc.has(c.id))
    if (!majorCourses.length && !selectedCalGetcCourses.length) return

    // Pinned courses stay where they are; everything else gets (re)placed.
    const pinnedBySem = new Map()
    for (const s of semesters) {
      pinnedBySem.set(
        s.id,
        s.courses.filter((c) => pinnedIds.has(c.id)),
      )
    }

    // Runway = user's current semesters + buffer for overflow.
    const last = semesters[semesters.length - 1]
    const currentRunway = semesters.map((s) => ({
      id: s.id, name: s.name, season: s.season, year: s.year,
    }))
    const runway = [...currentRunway, ...extendTerms({ season: last.season, year: last.year }, 6)]

    const baseSlots = runway.map((t) => ({
      id: t.id,
      unitCap: t.season === 'SU' ? SUMMER_AUTO_CAP : unitCap,
      maxCourses: t.season === 'SU' ? SUMMER_AUTO_MAX_COURSES : Infinity,
      pinnedCourses: pinnedBySem.get(t.id) || [],
    }))

    // Phase 1: place major courses first so every non-summer semester gets
    // one of each major subject (COMSC/MATH/PHYS) before Cal-GETC fills in.
    // autoPlanSemesters already enforces subject uniqueness per semester, so
    // running it on majors alone distributes them evenly in topo order.
    const majorsToPlan = majorCourses.filter((c) => !pinnedIds.has(c.id))
    const majorPrereqs = filterPrerequisites(majorCourses.map((c) => c.id))
    const majorPlan = majorsToPlan.length
      ? autoPlanSemesters(majorsToPlan, majorPrereqs, baseSlots)
      : baseSlots.map((s) => ({ id: s.id, courses: [], pinnedCourses: s.pinnedCourses }))

    // Phase 2: Cal-GETC fills remaining capacity. Treat phase-1 majors as
    // pinned so prereqs still resolve and subject-uniqueness still applies.
    const phase2Slots = majorPlan.map((entry, idx) => {
      const base = baseSlots[idx] ?? baseSlots[baseSlots.length - 1]
      return {
        id: entry.id,
        unitCap: base.unitCap ?? 15,
        maxCourses: base.maxCourses ?? Infinity,
        pinnedCourses: [...(entry.pinnedCourses || []), ...(entry.courses || [])],
      }
    })
    // If phase-1 used fewer slots than baseSlots had, append the remainder.
    for (let i = majorPlan.length; i < baseSlots.length; i++) {
      phase2Slots.push(baseSlots[i])
    }

    const calGetcToPlan = selectedCalGetcCourses.filter((c) => !pinnedIds.has(c.id))
    const allPrereqs = filterPrerequisites([
      ...majorCourses.map((c) => c.id),
      ...selectedCalGetcCourses.map((c) => c.id),
    ])
    const finalPlan = calGetcToPlan.length
      ? autoPlanSemesters(calGetcToPlan, allPrereqs, phase2Slots)
      : phase2Slots.map((s) => ({
          id: s.id,
          courses: [],
          pinnedCourses: s.pinnedCourses,
        }))

    // Ensure runway is at least as long as the plan (phase-1 or phase-2 may
    // have spilled past our pre-extended buffer).
    let plannedRunway = runway
    if (finalPlan.length > plannedRunway.length) {
      const tail = plannedRunway[plannedRunway.length - 1]
      plannedRunway = [
        ...plannedRunway,
        ...extendTerms(
          { season: tail.season, year: tail.year },
          finalPlan.length - plannedRunway.length,
        ),
      ]
    }

    const next = plannedRunway.slice(0, finalPlan.length).map((t, idx) => {
      const entry = finalPlan[idx]
      const pinned = entry?.pinnedCourses ?? pinnedBySem.get(t.id) ?? []
      const planned = entry?.courses ?? []
      return {
        id: entry?.id ?? t.id,
        name: t.name,
        season: t.season,
        year: t.year,
        courses: [...pinned, ...planned],
      }
    })

    // Trim trailing empties only in the buffer region (beyond user's current count).
    const minCount = semesters.length
    while (next.length > minCount && next[next.length - 1].courses.length === 0) {
      next.pop()
    }

    const placedIdsAfter = new Set(next.flatMap((s) => s.courses.map((c) => c.id)))
    setSemesters(next)
    setPool((prev) => prev.filter((c) => !placedIdsAfter.has(c.id)))
  }

  function findCourse(id) {
    const fromPool = pool.find((c) => c.id === id)
    if (fromPool) return fromPool
    for (const s of semesters) {
      const m = s.courses.find((c) => c.id === id)
      if (m) return m
    }
    return null
  }

  function handleDragStart(event) {
    setActiveCourse(findCourse(event.active.id))
  }

  function handleDragEnd(event) {
    setActiveCourse(null)
    const { active, over } = event
    if (!over) return
    const courseId = active.id
    const targetId = over.id
    const validTargets = new Set([...semesters.map((s) => s.id), 'pool'])
    if (!validTargets.has(targetId)) return

    const fromPool = pool.find((c) => c.id === courseId)
    if (fromPool) {
      if (targetId === 'pool') return
      setPool(pool.filter((c) => c.id !== courseId))
      setSemesters((prev) =>
        prev.map((s) => (s.id === targetId ? { ...s, courses: [...s.courses, fromPool] } : s)),
      )
      setPinnedIds((prev) => new Set(prev).add(courseId))
      return
    }

    let moving = null
    const without = semesters.map((s) => {
      const match = s.courses.find((c) => c.id === courseId)
      if (match) moving = match
      return { ...s, courses: s.courses.filter((c) => c.id !== courseId) }
    })
    if (!moving) return

    if (targetId === 'pool') {
      setSemesters(without)
      setPool((prev) => [...prev, moving])
      setPinnedIds((prev) => {
        const next = new Set(prev)
        next.delete(courseId)
        return next
      })
      return
    }

    setSemesters(
      without.map((s) => (s.id === targetId ? { ...s, courses: [...s.courses, moving] } : s)),
    )
    setPinnedIds((prev) => new Set(prev).add(courseId))
  }

  // Tap-to-add path used by mobile (where dnd would be hopeless on a phone
  // screen). The course can be sitting in the pool OR already placed in
  // another semester — in either case, lift it out of its current home
  // and drop it into the chosen semester. Without the cross-semester move,
  // there's no way to rearrange a plan on mobile after auto-plan empties
  // the pool.
  function handleAddToSemester(courseId, semesterId) {
    let course = pool.find((c) => c.id === courseId)
    if (course) {
      setPool((prev) => prev.filter((c) => c.id !== courseId))
    } else {
      for (const s of semesters) {
        const match = s.courses.find((c) => c.id === courseId)
        if (match) {
          course = match
          break
        }
      }
      if (!course) return
      setSemesters((prev) =>
        prev.map((s) =>
          s.id === semesterId
            ? s
            : { ...s, courses: s.courses.filter((c) => c.id !== courseId) },
        ),
      )
    }
    setSemesters((prev) =>
      prev.map((s) =>
        s.id === semesterId && !s.courses.some((c) => c.id === courseId)
          ? { ...s, courses: [...s.courses, course] }
          : s,
      ),
    )
    setPinnedIds((prev) => new Set(prev).add(courseId))
  }

  function handleRemoveFromSemester(courseId) {
    let moving = null
    const without = semesters.map((s) => {
      const match = s.courses.find((c) => c.id === courseId)
      if (match) moving = match
      return { ...s, courses: s.courses.filter((c) => c.id !== courseId) }
    })
    if (!moving) return
    setSemesters(without)
    setPool((prev) => (prev.some((c) => c.id === courseId) ? prev : [...prev, moving]))
    setPinnedIds((prev) => {
      const next = new Set(prev)
      next.delete(courseId)
      return next
    })
  }

  function handleAddSemester() {
    setSemesters((prev) => {
      const last = prev[prev.length - 1]
      const [next] = extendTerms({ season: last.season, year: last.year }, 1)
      return [
        ...prev,
        { id: next.id, name: next.name, season: next.season, year: next.year, courses: [] },
      ]
    })
  }

  function handleRemoveLastSemester() {
    setSemesters((prev) => {
      if (prev.length <= 1) return prev
      const last = prev[prev.length - 1]
      if (last.courses.length > 0) return prev
      return prev.slice(0, -1)
    })
  }

  function handleReset() {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Reset planner? All placed courses, pinned courses, and unit cap will be cleared.',
      )
      if (!ok) return
      window.localStorage.removeItem(STORAGE_KEY)
    }
    const freshTerms = defaultTerms()
    setUnitCap(15)
    setSemesters(makeEmptySemesters(freshTerms))
    setPinnedIds(new Set())
    setPool(buildInitialPool(majorCourses, calGetcCourses, selectedCalGetc))
  }

  const placedIds = new Set(allPlaced.map((c) => c.id))
  // course id → semester name for the picker hint ("currently in 27SP").
  const placedSemesterByCourse = useMemo(() => {
    const map = new Map()
    for (const s of semesters) for (const c of s.courses) map.set(c.id, s.name)
    return map
  }, [semesters])
  const selectedCalGetcCourses = useMemo(
    () => calGetcCourses.filter((c) => selectedCalGetc.has(c.id)),
    [calGetcCourses, selectedCalGetc],
  )
  const violations = useMemo(() => {
    // Build the active prereq edge set from each placed course's currently-
    // chosen branch (not the flat default), so swapping prereq paths in the
    // CoursePath picker reflects in the planner immediately.
    const placed = new Set()
    for (const s of semesters) for (const c of s.courses) placed.add(c.id)
    const edges = []
    for (const id of placed) {
      for (const pid of getPrereqIdsFor(id, prereqChoices)) {
        edges.push({ course_id: id, prerequisite_id: pid })
      }
    }
    return detectPrereqViolations(semesters, edges)
  }, [semesters, prereqChoices, getPrereqIdsFor])
  const lastSem = semesters[semesters.length - 1]
  const canRemoveLast = semesters.length > 1 && lastSem && lastSem.courses.length === 0

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold">Planner</h1>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <label className="text-sm flex items-center gap-2 whitespace-nowrap">
            <span className="hidden sm:inline">Units / semester:</span>
            <span className="sm:hidden">Units:</span>
            <input
              type="range"
              min={6}
              max={21}
              value={unitCap}
              onChange={(e) => setUnitCap(Number(e.target.value))}
              className="align-middle w-24 sm:w-auto"
            />
            <span className="font-medium">{unitCap}</span>
          </label>
          <AutoPlanButton onClick={handleAutoPlan} />
          <button
            onClick={handleReset}
            className="text-sm px-3 py-1.5 rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 whitespace-nowrap"
            title="Clear all placed courses and reset planner to defaults"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <ConfiguredCoursesPanel
        majorCourses={majorCourses}
        calGetcCourses={selectedCalGetcCourses}
        placedIds={placedIds}
        directRequiredIds={directRequiredIds}
        showCalGetc={requiresCalGetc}
        taken={taken}
        onToggleTaken={toggleTaken}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveCourse(null)}
      >
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            onClick={handleRemoveLastSemester}
            disabled={!canRemoveLast}
            className="text-sm px-3 py-1.5 rounded-md border bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            title={canRemoveLast ? 'Remove last empty semester' : 'Last semester must be empty to remove'}
          >
            − Remove last
          </button>
          <button
            onClick={handleAddSemester}
            className="text-sm px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            + Add semester
          </button>
        </div>
        {/* Mobile: 1-col stack grouped by academic year with a gap and a
            small header between years. Desktop: original continuous 3-col
            grid (one row per AY just because terms come out in that order). */}
        <div className="space-y-6 sm:space-y-0 mb-8">
          {groupByAcademicYear(semesters).map((group, gi) => (
            <div key={group.key} className={gi > 0 ? 'sm:mt-4' : ''}>
              <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-1.5 sm:hidden">
                Academic year {group.label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {group.semesters.map((s) => {
                  // Available = every course of this section's type that
                  // isn't already in THIS semester and isn't marked taken.
                  // Includes courses placed in other semesters so the
                  // student can move them across; without this, after
                  // auto-plan empties the pool the picker would have
                  // nothing to offer.
                  const here = new Set(s.courses.map((c) => c.id))
                  const isUsable = (c) => !here.has(c.id) && !taken.has(c.id)
                  return (
                    <SemesterColumn
                      key={s.id}
                      semester={s}
                      unitCap={unitCap}
                      violations={violations.get(s.id) || new Set()}
                      pinnedIds={pinnedIds}
                      majorIds={majorIds}
                      onRemove={handleRemoveFromSemester}
                      availableMajor={majorCourses.filter(isUsable)}
                      availableCalGetc={selectedCalGetcCourses.filter(isUsable)}
                      placedSemesterByCourse={placedSemesterByCourse}
                      onAdd={handleAddToSemester}
                      showCalGetc={requiresCalGetc}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Unplaced-pool drag source. Hidden on mobile — phones use the
            tap-to-add picker inside each SemesterColumn instead, since
            drag-and-drop across off-screen targets isn't usable on a
            small viewport. */}
        <div className="hidden sm:block">
          <PoolDropZone>
            {(() => {
              const unplaced = pool.filter((c) => !placedIds.has(c.id))
              if (unplaced.length === 0) {
                return (
                  <div className="text-sm text-slate-400 italic">
                    Nothing unplaced. Pick Cal-GETC courses in{' '}
                    <Link to="/requirements" className="underline">Requirements</Link> to add more.
                  </div>
                )
              }
              const majorUnplaced = unplaced.filter((c) => majorIds.has(c.id))
              const calGetcUnplaced = unplaced.filter((c) => !majorIds.has(c.id))
              return (
                <div className="space-y-2">
                  <PoolSubSection label="Major" tone="slate" courses={majorUnplaced} />
                  {requiresCalGetc && (
                    <PoolSubSection label="Cal-GETC" tone="emerald" courses={calGetcUnplaced} />
                  )}
                </div>
              )
            })()}
          </PoolDropZone>
        </div>

        <DragOverlay>
          {activeCourse ? (
            <div className="rounded-md border px-3 py-2 text-sm bg-white shadow-lg">
              <div className="font-medium">{activeCourse.code}</div>
              <div className="text-xs text-slate-500">{activeCourse.units}u</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <StepNav
        canPrev
        canNext={false}
        onPrev={() => navigate('/requirements')}
        prevLabel="Course Path"
      />
    </div>
  )
}

function PoolCard({ course }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: course.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`px-3 py-2 bg-slate-100 rounded-md text-sm border cursor-grab select-none ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <span className="font-medium">{course.code}</span>
      <span className="ml-2 text-slate-500">{course.units}u</span>
    </div>
  )
}

function PoolDropZone({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <section
      ref={setNodeRef}
      className={`bg-white border rounded-lg p-4 ${isOver ? 'ring-2 ring-slate-900' : ''}`}
    >
      <h2 className="font-semibold mb-3">Unplaced courses</h2>
      <div className="min-h-[40px]">{children}</div>
    </section>
  )
}

function PoolSubSection({ label, tone, courses }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50/40'
    : 'border-slate-200 bg-slate-50/50'
  const labelTone = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-600'
  return (
    <div className={`border rounded-md p-2 ${toneClass}`}>
      <div className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${labelTone}`}>
        {label}
      </div>
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        {courses.length === 0 ? (
          <div className="text-xs text-slate-400 italic">—</div>
        ) : (
          courses.map((c) => <PoolCard key={c.id} course={c} />)
        )}
      </div>
    </div>
  )
}

// Academic year of a term: Fall belongs to its own year (26FA → AY 2026-27);
// Spring/Summer belong to the previous calendar year (27SP, 27SU → AY 2026-27).
// Used to render semesters grouped by AY with a small gap between years.
function academicYearOf(sem) {
  return sem.season === 'FA' ? sem.year : sem.year - 1
}

function groupByAcademicYear(semesters) {
  const groups = []
  const byKey = new Map()
  for (const s of semesters) {
    const ay = academicYearOf(s)
    if (!byKey.has(ay)) {
      const group = { key: ay, label: `${ay}-${String((ay + 1) % 100).padStart(2, '0')}`, semesters: [] }
      byKey.set(ay, group)
      groups.push(group)
    }
    byKey.get(ay).semesters.push(s)
  }
  // Within each group, render in chronological order: FA → SP → SU.
  const order = { FA: 0, SP: 1, SU: 2 }
  for (const g of groups) g.semesters.sort((a, b) => order[a.season] - order[b.season])
  return groups
}

function subjectOf(course) {
  const m = (course.code || '').match(/^([A-Za-z]+)/)
  return m ? m[1].toUpperCase() : '其他'
}

function groupBySubject(courses) {
  const groups = new Map()
  for (const c of courses) {
    const key = subjectOf(c)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(c)
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function ConfiguredCoursesPanel({
  majorCourses,
  calGetcCourses,
  placedIds,
  directRequiredIds,
  showCalGetc = true,
  taken,
  onToggleTaken,
}) {
  return (
    <section className="mb-4 border rounded-lg bg-white p-3">
      <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs uppercase tracking-wide font-semibold text-slate-500">
          Configured courses
        </div>
        <div className="text-xs text-slate-500">
          Tap a course you've already taken — it'll turn{' '}
          <span className="text-emerald-700 font-semibold">green</span> and
          drop out of the planner below.
        </div>
      </div>
      <div className={`grid grid-cols-1 ${showCalGetc ? 'md:grid-cols-2' : ''} gap-2`}>
        <ConfiguredRow
          label="Major"
          tone="slate"
          courses={majorCourses}
          placedIds={placedIds}
          directRequiredIds={directRequiredIds}
          taken={taken}
          onToggleTaken={onToggleTaken}
        />
        {showCalGetc && (
          <ConfiguredRow
            label="Cal-GETC"
            tone="emerald"
            courses={calGetcCourses}
            placedIds={placedIds}
            taken={taken}
            onToggleTaken={onToggleTaken}
            emptyHint={
              <>
                None selected — pick in{' '}
                <Link to="/requirements" className="underline">Requirements</Link>.
              </>
            }
          />
        )}
      </div>
    </section>
  )
}

function ConfiguredRow({
  label,
  tone,
  courses,
  placedIds,
  emptyHint,
  directRequiredIds,
  taken,
  onToggleTaken,
}) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50/40'
    : 'border-slate-200 bg-slate-50/50'
  const labelTone = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-600'
  const badgeTone = tone === 'emerald'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-slate-200 text-slate-700'
  // Taken courses are excluded from totals — they're not in the planner
  // anymore so unit/assigned counts shouldn't include them either.
  const visibleCourses = taken ? courses.filter((c) => !taken.has(c.id)) : courses
  const totalUnits = visibleCourses.reduce((sum, c) => sum + (c.units || 0), 0)
  const assignedCount = visibleCourses.filter((c) => placedIds?.has(c.id)).length
  const groups = groupBySubject(courses)
  const takenCount = courses.length - visibleCourses.length
  return (
    <div className={`border rounded-md p-2 ${toneClass}`}>
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <div className={`text-[10px] uppercase tracking-wide font-semibold ${labelTone}`}>
          {label}
          {takenCount > 0 && (
            <span className="ml-1.5 text-emerald-700 normal-case font-normal">
              · {takenCount} taken
            </span>
          )}
        </div>
        <div className={`text-[10px] px-1.5 py-0.5 rounded ${badgeTone}`}>
          {assignedCount}/{visibleCourses.length} assigned · {totalUnits}u
        </div>
      </div>
      {courses.length === 0 ? (
        <div className="text-xs text-slate-400 italic">{emptyHint ?? '—'}</div>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {groups.map(([subject, list]) => (
            <div key={subject} className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                {subject}
              </div>
              <div className="flex flex-col gap-1">
                {list.map((c) => {
                  const isTaken = taken?.has(c.id)
                  const assigned = !isTaken && placedIds?.has(c.id)
                  const isPrereq =
                    !isTaken && directRequiredIds && !directRequiredIds.has(c.id)
                  const baseCls = isTaken
                    ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                    : assigned
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white hover:border-slate-400'
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onToggleTaken?.(c.id)}
                      className={`text-xs px-2 py-1 rounded border inline-flex flex-col leading-tight text-left transition cursor-pointer ${baseCls}`}
                      title={
                        isTaken
                          ? `${c.name} · already taken — tap to undo`
                          : `${c.name} · ${c.units}u${isPrereq ? ' · prereq' : ''} — tap if you've already taken this`
                      }
                    >
                      <span className={isTaken ? 'line-through' : undefined}>
                        {c.code}
                      </span>
                      {isTaken ? (
                        <span className="text-[9px] text-emerald-700 uppercase tracking-wide">
                          ✓ taken
                        </span>
                      ) : assigned ? (
                        <span className="text-[9px] text-blue-600 uppercase tracking-wide">
                          assigned
                        </span>
                      ) : isPrereq ? (
                        <span className="text-[9px] text-amber-700 uppercase tracking-wide">
                          prereq
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function detectPrereqViolations(semesters, prereqs) {
  const semOf = new Map()
  semesters.forEach((s, i) => s.courses.forEach((c) => semOf.set(c.id, i)))
  const violations = new Map()
  for (const { course_id, prerequisite_id } of prereqs) {
    const a = semOf.get(course_id)
    const b = semOf.get(prerequisite_id)
    if (a === undefined || b === undefined) continue
    // Strict prereq violation: the prerequisite must be in an EARLIER
    // semester. Same-semester (b == a) is treated as concurrent enrollment
    // and is allowed — most CC catalogs permit it for sequence courses.
    if (b > a) {
      const semId = semesters[a].id
      if (!violations.has(semId)) violations.set(semId, new Set())
      violations.get(semId).add(course_id)
    }
  }
  return violations
}
