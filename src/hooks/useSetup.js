import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:setup'
const DEFAULT = { cc_id: 'dvc', target_school_id: 'ucb', target_major_id: 'ucb_cs' }

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw)
    return { ...DEFAULT, ...parsed }
  } catch {
    return DEFAULT
  }
}

export function useSetup() {
  const [setup, setSetupState] = useState(read)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(setup))
  }, [setup])

  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setSetupState(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setSetup = useCallback((next) => {
    setSetupState((prev) => ({ ...prev, ...next }))
  }, [])

  return { setup, setSetup }
}
