import { useCallback, useEffect, useState } from 'react'

// Stores the user's chosen OR-branch per articulation.
// Shape: { [articulation_id]: option_index }
// Default (no entry) = option_index 0.

const KEY = 'tp:or_choices'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function useOrChoices() {
  const [choices, setChoices] = useState(read)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(choices))
  }, [choices])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setChoices(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setChoice = useCallback((articulationId, optionIndex) => {
    setChoices((prev) => ({ ...prev, [articulationId]: optionIndex }))
  }, [])

  return { choices, setChoice }
}
