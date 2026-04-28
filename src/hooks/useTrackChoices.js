import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:track_choices'

// User's pick for each OR-group on a transfer path (e.g. "MATH 10-series
// vs MATH 20-series" at UCSD). Stored as { [or_group_id]: section_index }.
// Default is section_index=0 for any group the user hasn't touched.
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

export function useTrackChoices() {
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

  const setChoice = useCallback((groupId, sectionIndex) => {
    setChoicesState((prev) => ({ ...prev, [groupId]: sectionIndex }))
  }, [])

  return { choices, setChoice }
}
