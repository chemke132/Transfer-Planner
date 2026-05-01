import { useCallback, useEffect, useState } from 'react'

// Set of course ids the student has already completed at their CC. Taken
// courses are excluded from the planner pool and never auto-placed — the
// student doesn't need to schedule what they've already finished.
const KEY = 'tp:taken_courses'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useTakenCourses() {
  const [taken, setTaken] = useState(read)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify([...taken]))
  }, [taken])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setTaken(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((id) => {
    setTaken((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => setTaken(new Set()), [])

  return { taken, toggle, clear }
}
