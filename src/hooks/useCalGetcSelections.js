import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:calgetc_selections'

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function useCalGetcSelections() {
  const [selected, setSelected] = useState(read)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify([...selected]))
  }, [selected])

  // Sync across tabs / other components mounted simultaneously.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setSelected(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Bulk-remove ids from the selection set. Used when a major-driven change
  // (switching majors, picking up additional auto-satisfied areas) makes
  // previously manual picks redundant.
  const removeMany = useCallback((ids) => {
    if (!ids || !ids.length) return
    setSelected((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of ids) {
        if (next.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  return { selected, toggle, removeMany }
}
