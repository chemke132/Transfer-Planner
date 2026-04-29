import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:track_choices'

// User's pick(s) for each OR-group on a transfer path.
// Stored as { [or_group_id]: number | number[] }:
//   - number: legacy single-pick (still supported on read)
//   - number[]: multi-pick (used when group.min_count >= 2)
// Default for any unset group is [0] — pick the first section.
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

// Normalize a stored choice (single or array) into a Set of section indexes.
export function choiceToSet(choice) {
  if (Array.isArray(choice)) return new Set(choice)
  if (typeof choice === 'number') return new Set([choice])
  return new Set()
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

  // Single-pick (legacy / min_count=1): replace the choice with one index.
  const setChoice = useCallback((groupId, sectionIndex) => {
    setChoicesState((prev) => ({ ...prev, [groupId]: sectionIndex }))
  }, [])

  // Multi-pick (min_count>=2): toggle one section in the group's array.
  const toggleChoice = useCallback((groupId, sectionIndex) => {
    setChoicesState((prev) => {
      const cur = choiceToSet(prev[groupId])
      if (cur.has(sectionIndex)) cur.delete(sectionIndex)
      else cur.add(sectionIndex)
      return { ...prev, [groupId]: [...cur].sort((a, b) => a - b) }
    })
  }, [])

  return { choices, setChoice, toggleChoice }
}
