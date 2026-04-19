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

  return { selected, toggle }
}
