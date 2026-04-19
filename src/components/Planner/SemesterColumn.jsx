import { useDroppable } from '@dnd-kit/core'
import CourseCard from './CourseCard.jsx'

export default function SemesterColumn({ semester, unitCap, violations, pinnedIds, majorIds, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id: semester.id })
  const totalUnits = semester.courses.reduce((sum, c) => sum + (c.units || 0), 0)
  const over = totalUnits > unitCap
  const isSummer = semester.season === 'SU'

  const majorCourses = semester.courses.filter((c) => majorIds?.has(c.id))
  const calGetcCourses = semester.courses.filter((c) => !majorIds?.has(c.id))

  return (
    <div
      ref={setNodeRef}
      className={`border rounded-lg p-3 min-h-[240px] ${
        isSummer ? 'bg-amber-50 border-amber-200' : 'bg-white'
      } ${isOver ? 'ring-2 ring-slate-900' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">
          {semester.name}
          {isSummer && <span className="ml-1.5 text-xs text-amber-700 font-normal">Summer</span>}
        </div>
        <div className={`text-xs ${over ? 'text-red-600' : 'text-slate-500'}`}>
          {totalUnits}/{unitCap}u
        </div>
      </div>

      <SubSection label="Major" tone="slate" courses={majorCourses} violations={violations} pinnedIds={pinnedIds} onRemove={onRemove} />
      <SubSection label="Cal-GETC" tone="emerald" courses={calGetcCourses} violations={violations} pinnedIds={pinnedIds} onRemove={onRemove} />
    </div>
  )
}

function SubSection({ label, tone, courses, violations, pinnedIds, onRemove }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50/40'
    : 'border-slate-200 bg-slate-50/50'
  const labelTone = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-600'

  return (
    <div className={`border rounded-md p-2 mb-2 ${toneClass}`}>
      <div className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${labelTone}`}>
        {label}
      </div>
      <div className="space-y-2 min-h-[28px]">
        {courses.length === 0 ? (
          <div className="text-xs text-slate-400 italic">—</div>
        ) : (
          courses.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              violated={violations.has(c.id)}
              pinned={pinnedIds?.has(c.id)}
              onRemove={onRemove}
            />
          ))
        )}
      </div>
    </div>
  )
}
