import { supabase, isSupabaseConfigured } from './supabase.js'
import * as seed from '../data/seed.js'

// Fetches all reference tables from Supabase and shapes them to match the
// seed.js export shape, so the rest of the app can treat either source
// interchangeably. If Supabase isn't configured or a query fails, falls back
// to the bundled seed data.

async function fetchAll() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase not configured')

  const [schoolsR, majorsR, coursesR, prereqsR, pathsR, pathReqR, artR, optR] =
    await Promise.all([
      supabase.from('schools').select('*'),
      supabase.from('target_majors').select('*'),
      supabase.from('courses').select('*'),
      supabase.from('prerequisites').select('*'),
      supabase.from('transfer_paths').select('*'),
      supabase.from('path_requirements').select('*'),
      supabase.from('path_articulations').select('*'),
      supabase.from('path_articulation_options').select('*'),
    ])

  const errors = [schoolsR, majorsR, coursesR, prereqsR, pathsR, pathReqR, artR, optR]
    .map((r) => r.error)
    .filter(Boolean)
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '))

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
