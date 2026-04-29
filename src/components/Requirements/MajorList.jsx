import { useMemo } from 'react'
import { useSetup } from '../../hooks/useSetup.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'
import { useTrackChoices } from '../../hooks/useTrackChoices.js'

export default function MajorList() {
  const { setup } = useSetup()
  const {
    findTransferPath,
    getRequirementMap,
    getSectionCourseIds,
    getOtherTargetsRequiredIds,
    PREREQUISITES,
    TARGET_MAJORS,
    SCHOOLS,
  } = useAppData()
  const { choices, setChoice } = useOrChoices()
  const { choices: trackChoices, setChoice: setTrackChoice } = useTrackChoices()

  // Per-target paths, articulations, and OR-groups for the rich UI.
  const perTarget = useMemo(() => {
    return setup.targets.map((t) => {
      const path = findTransferPath({
        cc_id: setup.cc_id,
        target_major_id: t.major_id,
      })
      return {
        target: t,
        path,
        major: TARGET_MAJORS[t.major_id],
        school: SCHOOLS[t.school_id],
        orGroups: path?.or_groups || [],
        multiOptionArts: (path?.articulations || []).filter(
          (a) => a.has_articulation && (a.options || []).length > 1,
        ),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.targets])

  const reqMap = useMemo(
    () => getRequirementMap(setup.cc_id, setup.targets, choices, trackChoices),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setup.cc_id, setup.targets, choices, trackChoices],
  )

  // Group courses by how many targets need them.
  const grouped = useMemo(() => {
    const total = setup.targets.length
    const buckets = new Map() // key = count, value = entries
    for (const entry of reqMap.values()) {
      const n = entry.targets.size
      if (!buckets.has(n)) buckets.set(n, [])
      buckets.get(n).push(entry)
    }
    // Sort each bucket alphabetically by code; sort buckets by count desc.
    const ordered = [...buckets.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([count, list]) => ({
        count,
        total,
        entries: list.sort((a, b) =>
          (a.course.code || '').localeCompare(b.course.code || ''),
        ),
      }))
    return ordered
  }, [reqMap, setup.targets.length])

  const totalUnits = useMemo(
    () => [...reqMap.values()].reduce((sum, e) => sum + (e.course.units || 0), 0),
    [reqMap],
  )
  const totalCourses = reqMap.size

  const codeById = useMemo(
    () => new Map([...reqMap.values()].map((e) => [e.course.id, e.course.code])),
    [reqMap],
  )
  const prereqByCourse = useMemo(() => {
    const m = new Map()
    for (const e of reqMap.values()) m.set(e.course.id, [])
    for (const p of PREREQUISITES) {
      if (m.has(p.course_id)) m.get(p.course_id).push(p.prerequisite_id)
    }
    return m
  }, [reqMap, PREREQUISITES])

  if (!setup.targets.length) {
    return (
      <div className="text-sm text-slate-400 italic">
        No target majors selected. Add some on the Setup page.
      </div>
    )
  }

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="font-semibold">
          Major requirements · {setup.targets.length} target
          {setup.targets.length > 1 ? 's' : ''}
        </h2>
        <div className="text-sm text-slate-500">
          {totalCourses} courses · {totalUnits} units
        </div>
      </div>

      {/* Active targets list (compact). */}
      <ul className="flex flex-wrap gap-2 mb-5 text-xs">
        {perTarget.map((pt, idx) => (
          <li
            key={idx}
            className="px-2 py-1 rounded-md border bg-slate-50 text-slate-700"
          >
            <span className="font-mono text-slate-400 mr-1">#{idx + 1}</span>
            <span className="font-medium">{pt.school?.name || pt.target.school_id}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span>{pt.major?.name || pt.target.major_id}</span>
          </li>
        ))}
      </ul>

      {/* Track pickers — one block per target that has Or-groups. */}
      {perTarget.some((pt) => pt.orGroups.length > 0) && (
        <div className="mb-6 space-y-3">
          {perTarget.map((pt, idx) => {
            if (!pt.orGroups.length) return null
            return (
              <div
                key={idx}
                className="rounded-md border border-violet-200 bg-violet-50 p-4"
              >
                <h3 className="text-sm font-semibold text-violet-900 mb-1">
                  Choose your track ·{' '}
                  <span className="font-normal">
                    {pt.school?.name} {pt.major?.name}
                  </span>
                </h3>
                <p className="text-xs text-violet-800/80 mb-3">
                  Pick one section per group — only the chosen series counts toward
                  this major.
                </p>
                <ul className="space-y-3">
                  {pt.orGroups.map((group, gIdx) => {
                    const chosenIdx = trackChoices[group.id] ?? 0
                    // For multi-target setups, compute how many CC courses
                    // each section shares with the user's OTHER targets so
                    // we can highlight the overlap-maximizing pick.
                    const otherIds =
                      setup.targets.length > 1
                        ? getOtherTargetsRequiredIds(
                            setup.cc_id,
                            setup.targets,
                            idx,
                            choices,
                            trackChoices,
                          )
                        : null
                    const sectionsRanked = group.sections
                      .map((sec) => {
                        const cids = getSectionCourseIds(pt.path, sec, choices)
                        let overlap = 0
                        if (otherIds) {
                          for (const id of cids) if (otherIds.has(id)) overlap++
                        }
                        return { sec, overlap, total: cids.size }
                      })
                      .sort((a, b) => {
                        // Higher overlap first; ties broken by lower section index.
                        if (b.overlap !== a.overlap) return b.overlap - a.overlap
                        return a.sec.section_index - b.sec.section_index
                      })
                    const maxOverlap = sectionsRanked[0]?.overlap ?? 0
                    return (
                      <li key={group.id} className="text-sm">
                        <div className="font-medium text-slate-800 mb-2">
                          Group {gIdx + 1}
                          {otherIds && maxOverlap > 0 && (
                            <span className="text-[10px] text-slate-500 font-normal ml-2">
                              · sections sorted by overlap with your other targets
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {sectionsRanked.map(({ sec, overlap }) => {
                            const active = chosenIdx === sec.section_index
                            const codes = sec.receiving_codes || []
                            const isBest =
                              otherIds && overlap > 0 && overlap === maxOverlap
                            return (
                              <button
                                key={sec.id}
                                onClick={() =>
                                  setTrackChoice(group.id, sec.section_index)
                                }
                                className={`px-3 py-2 rounded-md border text-xs text-left max-w-xs ${
                                  active
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : isBest
                                    ? 'bg-emerald-50 text-slate-700 border-emerald-400 hover:border-emerald-600'
                                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <div
                                  className={`font-mono font-semibold ${
                                    active ? '' : 'text-slate-900'
                                  }`}
                                >
                                  {codes.slice(0, 4).join(' · ')}
                                  {codes.length > 4 && ` …+${codes.length - 4}`}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {sec.section_index === 0 && (
                                    <span
                                      className={`text-[10px] ${
                                        active ? 'text-slate-300' : 'text-slate-400'
                                      }`}
                                    >
                                      default
                                    </span>
                                  )}
                                  {otherIds && overlap > 0 && (
                                    <span
                                      className={`text-[10px] font-semibold ${
                                        active
                                          ? 'text-emerald-300'
                                          : 'text-emerald-700'
                                      }`}
                                    >
                                      +{overlap} shared
                                    </span>
                                  )}
                                  {isBest && !active && (
                                    <span className="text-[10px] text-emerald-700 uppercase tracking-wide">
                                      ★ best overlap
                                    </span>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}

      {/* Articulation OR-branches (per target). */}
      {perTarget.some((pt) => pt.multiOptionArts.length > 0) && (
        <div className="mb-6 space-y-3">
          {perTarget.map((pt, idx) => {
            if (!pt.multiOptionArts.length) return null
            return (
              <div
                key={idx}
                className="rounded-md border border-blue-200 bg-blue-50 p-4"
              >
                <h3 className="text-sm font-semibold text-blue-900 mb-1">
                  Alternative courses ·{' '}
                  <span className="font-normal">
                    {pt.school?.name} {pt.major?.name}
                  </span>
                </h3>
                <p className="text-xs text-blue-800/80 mb-3">
                  Some UC courses can be satisfied by multiple CC pathways. Pick the
                  one you took (or plan to take).
                </p>
                <ul className="space-y-3">
                  {pt.multiOptionArts.map((art) => {
                    const chosen = choices[art.id] ?? 0
                    return (
                      <li key={art.id} className="text-sm">
                        <div className="font-medium text-slate-800 mb-1">
                          {art.receiving_code}
                          {art.receiving_name && (
                            <span className="text-slate-500 font-normal">
                              {' '}— {art.receiving_name}
                            </span>
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
                                  <span
                                    className={`ml-1.5 text-[10px] ${
                                      active ? 'text-slate-300' : 'text-slate-400'
                                    }`}
                                  >
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
            )
          })}
        </div>
      )}

      {/* Grouped courses by overlap count (descending). */}
      {grouped.length === 0 ? (
        <div className="text-sm text-slate-400 italic">
          No transfer path data for this combination yet.
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ count, total, entries }) => (
            <div key={count}>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {count === total ? (
                  <span className="text-emerald-700">
                    ⭐ Required for all {total} target{total > 1 ? 's' : ''}
                  </span>
                ) : count === 1 ? (
                  <span className="text-slate-600">
                    Required for 1 target only
                  </span>
                ) : (
                  <span className="text-slate-700">
                    Required for {count} of {total}
                  </span>
                )}
                <span className="text-xs font-normal text-slate-400">
                  ({entries.length} course{entries.length > 1 ? 's' : ''})
                </span>
              </h3>
              <ul className="grid md:grid-cols-2 gap-2">
                {entries.map((e) => {
                  const c = e.course
                  const prereqs = (prereqByCourse.get(c.id) || [])
                    .map((id) => codeById.get(id))
                    .filter(Boolean)
                  return (
                    <li
                      key={c.id}
                      className="bg-white border rounded-md px-3 py-2 text-sm flex justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          <span>
                            {c.code} — {c.name}
                          </span>
                          {!e.isDirect && (
                            <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                              prereq
                            </span>
                          )}
                          <TargetBadges
                            targetIndexes={e.targets}
                            perTarget={perTarget}
                            total={total}
                          />
                        </div>
                        {prereqs.length > 0 && (
                          <div className="text-xs text-slate-500">
                            prereq: {prereqs.join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="text-slate-500 shrink-0 ml-2">{c.units}u</div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// Inline list of which targets need a course. Hide if every target needs it
// (the bucket header already says "for all N").
function TargetBadges({ targetIndexes, perTarget, total }) {
  if (targetIndexes.size === total) return null
  const names = [...targetIndexes].sort().map((i) => {
    const pt = perTarget[i]
    return (
      pt?.school?.name ||
      pt?.target.school_id ||
      `#${i + 1}`
    )
  })
  return (
    <span className="text-[10px] text-slate-500 italic">
      ({names.join(', ')})
    </span>
  )
}
