import { useMemo } from 'react'
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import { useSetup } from '../../hooks/useSetup.js'
import { useAppData } from '../../hooks/useAppData.jsx'
import { useOrChoices } from '../../hooks/useOrChoices.js'

export default function CoursePath() {
  const { setup } = useSetup()
  const { findTransferPath, getMajorCourses, filterPrerequisites } = useAppData()
  const { choices } = useOrChoices()

  const { nodes, edges } = useMemo(() => {
    const path = findTransferPath({
      cc_id: setup.cc_id,
      target_major_id: setup.target_major_id,
    })
    const major = getMajorCourses(path, choices)
    if (!major.length) return { nodes: [], edges: [] }
    const prereqs = filterPrerequisites(major.map((c) => c.id))
    return buildGraph(major, prereqs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup.cc_id, setup.target_major_id, choices])

  return (
    <div className="bg-white border rounded-lg" style={{ height: 560 }}>
      {nodes.length === 0 ? (
        <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">
          No transfer path data yet.
        </div>
      ) : (
        <ReactFlow nodes={nodes} edges={edges} fitView>
          <Background gap={20} />
          <Controls />
        </ReactFlow>
      )}
    </div>
  )
}

function buildGraph(courses, prereqs) {
  const levels = computeLevels(courses, prereqs)
  const byLevel = new Map()
  for (const c of courses) {
    const lvl = levels.get(c.id) ?? 0
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl).push(c)
  }

  const nodes = []
  for (const [lvl, items] of byLevel) {
    items.forEach((c, i) => {
      nodes.push({
        id: c.id,
        data: { label: `${c.code}\n${c.name}` },
        position: { x: lvl * 220, y: i * 110 },
        style: { width: 180, fontSize: 12, whiteSpace: 'pre-line', padding: 8 },
      })
    })
  }

  const courseIds = new Set(courses.map((c) => c.id))
  const edges = prereqs
    .filter((p) => courseIds.has(p.course_id) && courseIds.has(p.prerequisite_id))
    .map((p) => ({
      id: `${p.prerequisite_id}->${p.course_id}`,
      source: p.prerequisite_id,
      target: p.course_id,
      markerEnd: { type: MarkerType.ArrowClosed },
    }))

  return { nodes, edges }
}

function computeLevels(courses, prereqs) {
  const levels = new Map()
  const prereqMap = new Map(courses.map((c) => [c.id, []]))
  for (const { course_id, prerequisite_id } of prereqs) {
    if (prereqMap.has(course_id)) prereqMap.get(course_id).push(prerequisite_id)
  }
  function dfs(id) {
    if (levels.has(id)) return levels.get(id)
    const ps = prereqMap.get(id) || []
    const lvl = ps.length ? Math.max(...ps.map(dfs)) + 1 : 0
    levels.set(id, lvl)
    return lvl
  }
  for (const c of courses) dfs(c.id)
  return levels
}
