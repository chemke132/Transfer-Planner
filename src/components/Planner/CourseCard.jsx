import { useDraggable } from '@dnd-kit/core'
import { useState } from 'react'

export default function CourseCard({ course, violated, pinned, onRemove }) {
  const [done, setDone] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: course.id })

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const baseBg = pinned ? 'bg-blue-50' : 'bg-slate-50'
  const borderCls = violated
    ? 'border-red-500 bg-red-50'
    : pinned
    ? 'border-blue-500'
    : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border px-3 py-2 text-sm ${baseBg} cursor-grab ${
        isDragging ? 'opacity-50' : ''
      } ${borderCls}`}
      title={pinned ? 'Pinned by you — auto-plan will not move this' : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium flex items-center gap-1">
            {violated && <span title="Prerequisite order violation">⚠️</span>}
            {pinned && <span aria-label="pinned">📌</span>}
            {course.code}
          </div>
          <div className="text-xs text-slate-500">{course.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => setDone(e.target.checked)}
              onPointerDown={(e) => e.stopPropagation()}
            />
            done
          </label>
          {onRemove && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onRemove(course.id)
              }}
              className="text-slate-400 hover:text-red-600 text-sm leading-none px-1"
              title="Remove to unplaced"
              aria-label="Remove course"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="text-xs text-slate-500 mt-1">{course.units}u</div>
    </div>
  )
}
