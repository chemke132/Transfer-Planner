import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:prereq_choices'

// User's pick for which prereq path they took (or plan to take) per course.
// Stored as { [course_id]: option_index }. Default option (option_index=0)
// is the "cheapest same-dept" branch picked by the catalog scraper.
function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function usePrereqChoices() {
  const [choices, setChoicesState] = useState(read)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(choices))
  }, [choices])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setChoicesState(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setChoice = useCallback((courseId, optionIndex) => {
    setChoicesState((prev) => ({ ...prev, [courseId]: optionIndex }))
  }, [])

  return { choices, setChoice }
}
