import { useCallback, useEffect, useState } from 'react'

const KEY = 'tp:setup'
// New shape (multi-target): { cc_id, targets: [{ school_id, major_id }, ...] }
// Legacy shape (single-target): { cc_id, target_school_id, target_major_id }
// We migrate the legacy shape on read.
const DEFAULT = {
  cc_id: 'dvc',
  targets: [{ school_id: 'ucb', major_id: 'ucb_computer_science' }],
}

// Some early seed rows (ucb_cs, ucla_cs, ucsd_cs) duplicated scraper rows
// with the same name. After deduping the DB, we redirect any stored old id
// to the canonical scraped id so users keep their selection.
const LEGACY_MAJOR_ALIASES = {
  ucb_cs: 'ucb_computer_science',
  ucla_cs: 'ucla_computer_science',
  ucsd_cs: 'ucsd_cse_computer_science',
}

function canonicalMajorId(id) {
  return LEGACY_MAJOR_ALIASES[id] || id
}

function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return DEFAULT
  if (Array.isArray(parsed.targets)) {
    return {
      cc_id: parsed.cc_id || DEFAULT.cc_id,
      targets: parsed.targets.length
        ? parsed.targets
            .filter((t) => t && t.school_id && t.major_id)
            .map((t) => ({ ...t, major_id: canonicalMajorId(t.major_id) }))
        : DEFAULT.targets,
    }
  }
  // Legacy: hoist single target into the array
  if (parsed.target_school_id && parsed.target_major_id) {
    return {
      cc_id: parsed.cc_id || DEFAULT.cc_id,
      targets: [
        {
          school_id: parsed.target_school_id,
          major_id: canonicalMajorId(parsed.target_major_id),
        },
      ],
    }
  }
  return DEFAULT
}

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT
    return migrate(JSON.parse(raw))
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

  // Convenience helpers for target list management.
  const addTarget = useCallback((target) => {
    setSetupState((prev) => {
      // Don't add duplicates.
      if (
        prev.targets.some(
          (t) => t.school_id === target.school_id && t.major_id === target.major_id,
        )
      ) {
        return prev
      }
      return { ...prev, targets: [...prev.targets, target] }
    })
  }, [])

  const removeTarget = useCallback((idx) => {
    setSetupState((prev) => {
      // Always keep at least one target; replacing the last one is the user's
      // job (via SetupPage's "change" flow), not a delete.
      if (prev.targets.length <= 1) return prev
      return {
        ...prev,
        targets: prev.targets.filter((_, i) => i !== idx),
      }
    })
  }, [])

  return { setup, setSetup, addTarget, removeTarget }
}
