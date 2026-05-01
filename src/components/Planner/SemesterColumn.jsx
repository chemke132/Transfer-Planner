import { useDroppable } from '@dnd-kit/core'
import { useState } from 'react'
import CourseCard from './CourseCard.jsx'

export default function SemesterColumn({
  semester,
  unitCap,
  violations,
  pinnedIds,
  majorIds,
  onRemove,
  // Mobile tap-to-add: lists of unplaced courses available to drop into
  // this semester, plus the handler that actually places them. Desktop
  // ignores these and uses dnd-kit instead.
  availableMajor = [],
  availableCalGetc = [],
  onAdd,
  showCalGetc = true,
}) {
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

      <SubSection
        label="Major"
        tone="slate"
        courses={majorCourses}
        violations={violations}
        pinnedIds={pinnedIds}
        onRemove={onRemove}
        available={availableMajor}
        onAdd={onAdd ? (id) => onAdd(id, semester.id) : undefined}
      />
      {showCalGetc && (
        <SubSection
          label="Cal-GETC"
          tone="emerald"
          courses={calGetcCourses}
          violations={violations}
          pinnedIds={pinnedIds}
          onRemove={onRemove}
          available={availableCalGetc}
          onAdd={onAdd ? (id) => onAdd(id, semester.id) : undefined}
        />
      )}
    </div>
  )
}

function SubSection({ label, tone, courses, violations, pinnedIds, onRemove, available = [], onAdd }) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-200 bg-emerald-50/40'
    : 'border-slate-200 bg-slate-50/50'
  const labelTone = tone === 'emerald' ? 'text-emerald-700' : 'text-slate-600'
  const addBtnTone = tone === 'emerald'
    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
    : 'border-slate-300 text-slate-600 hover:bg-slate-100'

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
      {/* Mobile-only "+ Add course" picker. Hidden on desktop where dnd
          handles placement. Tapping toggles a list of every still-unplaced
          course of this section's type. */}
      {onAdd && (
        <div className="sm:hidden mt-2">
          <AddCoursePicker
            label={label}
            available={available}
            onAdd={onAdd}
            tone={addBtnTone}
          />
        </div>
      )}
    </div>
  )
}

function AddCoursePicker({ label, available, onAdd, tone }) {
  const [open, setOpen] = useState(false)
  if (available.length === 0) {
    return (
      <div className="text-[11px] text-slate-400 italic">
        All {label.toLowerCase()} courses placed.
      </div>
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full text-xs font-medium px-2 py-1.5 rounded border bg-white ${tone}`}
      >
        {open ? '✕ Cancel' : `+ Add ${label.toLowerCase()} course`}
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto border rounded-md bg-white divide-y">
          {available.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onAdd(c.id)
                setOpen(false)
              }}
              className="w-full text-left px-2 py-2 text-xs hover:bg-slate-50 active:bg-slate-100 flex items-center justify-between gap-2"
            >
              <span className="min-w-0">
                <span className="font-medium">{c.code}</span>
                <span className="text-slate-500"> · {c.name}</span>
              </span>
              <span className="text-slate-400 shrink-0">{c.units}u</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
