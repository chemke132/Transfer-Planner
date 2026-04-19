// Term utilities. Term IDs follow the YYSeason convention: "26FA", "27SP", "27SU".

const SEASONS = ['SP', 'SU', 'FA']

function yy(year) {
  return String(year % 100).padStart(2, '0')
}

export function termLabel(id) {
  return id
}

export function seasonOf(id) {
  return id.slice(-2)
}

// Based on today's date, the next "starting" Fall year (2-digit).
// If we're already in or past Fall (month >= August), start from next year.
export function nextFallYear(now = new Date()) {
  const fullYear = now.getFullYear()
  return now.getMonth() >= 7 ? fullYear + 1 : fullYear
}

// Default plan: 6 terms over 2 academic years, starting from the upcoming Fall.
// Pattern: FA, SP, SU, FA, SP, SU  -> 2 FA, 2 SP, 2 SU (skip the in-progress SU).
export function defaultTerms(now = new Date(), count = 6) {
  const startFall = nextFallYear(now)
  return generateTerms(startFall, 'FA', count)
}

// Generate `count` sequential terms starting from (startYear, startSeason).
// Sequence: SP -> SU -> FA -> SP (next year) -> ...
export function generateTerms(startYear, startSeason, count) {
  const terms = []
  let year = startYear
  let seasonIdx = SEASONS.indexOf(startSeason)
  if (seasonIdx === -1) throw new Error(`Unknown season: ${startSeason}`)

  for (let i = 0; i < count; i++) {
    const season = SEASONS[seasonIdx]
    terms.push({
      id: `${yy(year)}${season}`,
      season,
      year,
      name: `${yy(year)}${season}`,
    })
    seasonIdx += 1
    if (seasonIdx >= SEASONS.length) {
      seasonIdx = 0
      year += 1
    }
  }
  return terms
}

// Continue past a given term by N more steps.
export function extendTerms(lastTerm, count) {
  let seasonIdx = SEASONS.indexOf(lastTerm.season) + 1
  let year = lastTerm.year
  if (seasonIdx >= SEASONS.length) {
    seasonIdx = 0
    year += 1
  }
  return generateTerms(year, SEASONS[seasonIdx], count)
}
