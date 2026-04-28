import { supabase, isSupabaseConfigured } from './supabase.js'
import * as seed from '../data/seed.js'

// Fetches all reference tables from Supabase and shapes them to match the
// seed.js export shape, so the rest of the app can treat either source
// interchangeably. If Supabase isn't configured or a query fails, falls back
// to the bundled seed data.

// PostgREST caps `select('*')` at 1000 rows by default. Fetch in 1000-row
// pages until we've drained the table, so larger tables (3000+ rows for
// path_articulations / options / requirements after UCLA+UCSD scrape) load
// completely. Each call uses a stable order on (id) to avoid duplicates or
// gaps if rows shift between requests.
async function fetchAllPaged(table, pageSize = 1000) {
  const out = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(from, to)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}

async function fetchAll() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const [
    schoolsData, majorsData, coursesData, prereqsData,
    pathsData, pathReqData, artData, optData,
    orGroupsData, orSectionsData,
  ] = await Promise.all([
    fetchAllPaged('schools'),
    fetchAllPaged('target_majors'),
    fetchAllPaged('courses'),
    // prerequisites has a composite PK (course_id, prerequisite_id) and no
    // single `id` column — order by course_id for paging.
    (async () => {
      const out = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('prerequisites')
          .select('*')
          .order('course_id', { ascending: true })
          .order('prerequisite_id', { ascending: true })
          .range(from, from + 999)
        if (error) throw new Error(`prerequisites: ${error.message}`)
        if (!data || data.length === 0) break
        out.push(...data)
        if (data.length < 1000) break
      }
      return out
    })(),
    fetchAllPaged('transfer_paths'),
    // path_requirements has composite PK (path_id, course_id) — same trick.
    (async () => {
      const out = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('path_requirements')
          .select('*')
          .order('path_id', { ascending: true })
          .order('course_id', { ascending: true })
          .range(from, from + 999)
        if (error) throw new Error(`path_requirements: ${error.message}`)
        if (!data || data.length === 0) break
        out.push(...data)
        if (data.length < 1000) break
      }
      return out
    })(),
    fetchAllPaged('path_articulations'),
    fetchAllPaged('path_articulation_options'),
    fetchAllPaged('path_or_groups'),
    fetchAllPaged('path_or_sections'),
  ])

  const schoolsR = { data: schoolsData }
  const majorsR = { data: majorsData }
  const coursesR = { data: coursesData }
  const prereqsR = { data: prereqsData }
  const pathsR = { data: pathsData }
  const pathReqR = { data: pathReqData }
  const artR = { data: artData }
  const optR = { data: optData }

  // Shape transfer_paths so each path carries its required_course_ids (like seed.js).
  const reqByPath = new Map()
  for (const row of pathReqR.data) {
    if (!reqByPath.has(row.path_id)) reqByPath.set(row.path_id, [])
    reqByPath.get(row.path_id).push(row.course_id)
  }
  // Group articulations by path_id and options by articulation_id.
  const artsByPath = new Map()
  for (const a of artR.data) {
    if (!artsByPath.has(a.path_id)) artsByPath.set(a.path_id, [])
    artsByPath.get(a.path_id).push(a)
  }
  const optsByArt = new Map()
  for (const o of optR.data) {
    if (!optsByArt.has(o.articulation_id)) optsByArt.set(o.articulation_id, [])
    optsByArt.get(o.articulation_id).push(o)
  }
  // Sort options by option_index so index 0 is always the default.
  for (const list of optsByArt.values()) list.sort((a, b) => a.option_index - b.option_index)

  // OR-groups: each transfer path can have multiple "pick one section"
  // groups (e.g. UCSD Pharma Chem has separate Or-groups for the math
  // track and the physics track). Sections list receiving_codes; the
  // frontend cross-references those with the path's articulations to
  // figure out which articulations to include based on the user's pick.
  const sectionsByGroup = new Map()
  for (const s of orSectionsData) {
    if (!sectionsByGroup.has(s.group_id)) sectionsByGroup.set(s.group_id, [])
    sectionsByGroup.get(s.group_id).push(s)
  }
  for (const list of sectionsByGroup.values()) {
    list.sort((a, b) => a.section_index - b.section_index)
  }
  const orGroupsByPath = new Map()
  for (const g of orGroupsData) {
    const sections = sectionsByGroup.get(g.id) || []
    if (!sections.length) continue
    if (!orGroupsByPath.has(g.path_id)) orGroupsByPath.set(g.path_id, [])
    orGroupsByPath.get(g.path_id).push({ ...g, sections })
  }
  for (const list of orGroupsByPath.values()) {
    list.sort((a, b) => (a.position || 0) - (b.position || 0))
  }

  const transferPaths = pathsR.data.map((p) => {
    const arts = (artsByPath.get(p.id) || []).map((a) => ({
      ...a,
      options: optsByArt.get(a.id) || [],
    }))
    return {
      id: p.id,
      cc_id: p.cc_school_id,
      target_major_id: p.target_major_id,
      required_course_ids: reqByPath.get(p.id) || [],
      articulations: arts,
      or_groups: orGroupsByPath.get(p.id) || [],
    }
  })

  // SCHOOLS / TARGET_MAJORS as id-keyed objects (matches seed.js shape).
  const schoolsById = Object.fromEntries(schoolsR.data.map((s) => [s.id, s]))
  const majorsById = Object.fromEntries(majorsR.data.map((m) => [m.id, m]))

  return {
    SCHOOLS: schoolsById,
    TARGET_MAJORS: majorsById,
    COURSES: coursesR.data,
    PREREQUISITES: prereqsR.data,
    TRANSFER_PATHS: transferPaths,
    CAL_GETC_AREAS: seed.CAL_GETC_AREAS, // static — not in DB yet
    source: 'supabase',
  }
}

function seedBundle() {
  return {
    SCHOOLS: seed.SCHOOLS,
    TARGET_MAJORS: seed.TARGET_MAJORS,
    COURSES: seed.COURSES,
    PREREQUISITES: seed.PREREQUISITES,
    TRANSFER_PATHS: seed.TRANSFER_PATHS,
    CAL_GETC_AREAS: seed.CAL_GETC_AREAS,
    source: 'seed',
  }
}

export async function loadReferenceData() {
  try {
    return await fetchAll()
  } catch (err) {
    console.warn('[api] Falling back to seed data:', err.message)
    return { ...seedBundle(), fallbackReason: err.message }
  }
}
