// Seed data for MVP — DVC CS transfer track.
// Replace with live Supabase queries once the DB is populated.
//
// Shape mirrors the Supabase schema (see supabase/schema.sql):
//   schools, target_majors, courses, prerequisites, transfer_paths, path_requirements
//
// Key design rule:
//   - Courses, prerequisites, and Cal-GETC mappings live at the CC level and are
//     shared across all targets.
//   - A `transfer_path` = (cc_id, target_major_id) maps which CC courses are
//     required for a given transfer destination.

export const SCHOOLS = {
  // Community colleges
  dvc: { id: 'dvc', name: 'Diablo Valley College', type: 'CC' },
  // Transfer targets
  ucb: { id: 'ucb', name: 'UC Berkeley', type: 'UC' },
  ucla: { id: 'ucla', name: 'UCLA', type: 'UC' },
  ucsd: { id: 'ucsd', name: 'UC San Diego', type: 'UC' },
}

export const TARGET_MAJORS = {
  ucb_cs: { id: 'ucb_cs', school_id: 'ucb', key: 'cs', name: 'Computer Science' },
  ucla_cs: { id: 'ucla_cs', school_id: 'ucla', key: 'cs', name: 'Computer Science' },
  ucsd_cs: { id: 'ucsd_cs', school_id: 'ucsd', key: 'cs', name: 'Computer Science' },
}

export const CAL_GETC_AREAS = {
  '1A': { label: 'English Composition', required: 1 },
  '1B': { label: 'Critical Thinking / Composition', required: 1 },
  '1C': { label: 'Oral Communication', required: 1 },
  '2': { label: 'Mathematical Concepts & Quantitative Reasoning', required: 1 },
  '3A': { label: 'Arts', required: 1 },
  '3B': { label: 'Humanities', required: 1 },
  '4': { label: 'Social & Behavioral Sciences', required: 2 },
  '5A': { label: 'Physical Science', required: 1 },
  '5B': { label: 'Biological Science', required: 1 },
  '5C': { label: 'Laboratory Activity', required: 1 },
  '6': { label: 'Language Other Than English', required: 1 },
}

// CC-scoped course catalog. `cal_getc_area` tags Cal-GETC-eligible courses.
// Whether a course counts as "major" is determined by transfer_paths below.
export const COURSES = [
  // DVC — CS-adjacent courses
  { id: 'dvc_comsc110', school_id: 'dvc', code: 'COMSC 110', name: 'Intro to Computer Science', units: 4 },
  { id: 'dvc_comsc165', school_id: 'dvc', code: 'COMSC 165', name: 'Advanced Programming with C/C++', units: 4 },
  { id: 'dvc_comsc200', school_id: 'dvc', code: 'COMSC 200', name: 'Data Structures', units: 4 },
  { id: 'dvc_comsc210', school_id: 'dvc', code: 'COMSC 210', name: 'Computer Architecture & Assembly', units: 4 },
  { id: 'dvc_comsc260', school_id: 'dvc', code: 'COMSC 260', name: 'Discrete Mathematics', units: 4 },
  { id: 'dvc_math192', school_id: 'dvc', code: 'MATH 192', name: 'Calculus I', units: 4 },
  { id: 'dvc_math193', school_id: 'dvc', code: 'MATH 193', name: 'Calculus II', units: 4 },
  { id: 'dvc_math194', school_id: 'dvc', code: 'MATH 194', name: 'Calculus III', units: 4 },
  { id: 'dvc_math195', school_id: 'dvc', code: 'MATH 195', name: 'Linear Algebra', units: 4 },
  { id: 'dvc_math292', school_id: 'dvc', code: 'MATH 292', name: 'Differential Equations', units: 4 },
  { id: 'dvc_phys130', school_id: 'dvc', code: 'PHYS 130', name: 'Physics with Calculus I', units: 4 },
  { id: 'dvc_phys230', school_id: 'dvc', code: 'PHYS 230', name: 'Physics with Calculus II', units: 4 },

  // DVC — Cal-GETC catalog (tagged via cal_getc_area)
  { id: 'dvc_engl122', school_id: 'dvc', code: 'ENGL 122', name: 'Freshman English', units: 3, cal_getc_area: '1A' },
  { id: 'dvc_engl123', school_id: 'dvc', code: 'ENGL 123', name: 'Reading, Writing, Thinking', units: 3, cal_getc_area: '1A' },
  { id: 'dvc_engl125', school_id: 'dvc', code: 'ENGL 125', name: 'Critical Thinking & Writing', units: 3, cal_getc_area: '1B' },
  { id: 'dvc_engl126', school_id: 'dvc', code: 'ENGL 126', name: 'Critical Reasoning in Literature', units: 3, cal_getc_area: '1B' },
  { id: 'dvc_spch120', school_id: 'dvc', code: 'SPCH 120', name: 'Public Speaking', units: 3, cal_getc_area: '1C' },
  { id: 'dvc_spch122', school_id: 'dvc', code: 'SPCH 122', name: 'Interpersonal Communication', units: 3, cal_getc_area: '1C' },
  { id: 'dvc_math142', school_id: 'dvc', code: 'MATH 142', name: 'Elementary Statistics', units: 4, cal_getc_area: '2' },
  { id: 'dvc_math182', school_id: 'dvc', code: 'MATH 182', name: 'Precalculus', units: 4, cal_getc_area: '2' },
  { id: 'dvc_arthis193', school_id: 'dvc', code: 'ARTHS 193', name: 'Art History: Ancient to Medieval', units: 3, cal_getc_area: '3A' },
  { id: 'dvc_arthis195', school_id: 'dvc', code: 'ARTHS 195', name: 'Art History: Renaissance to Modern', units: 3, cal_getc_area: '3A' },
  { id: 'dvc_musx120', school_id: 'dvc', code: 'MUSX 120', name: 'Music Appreciation', units: 3, cal_getc_area: '3A' },
  { id: 'dvc_phil120', school_id: 'dvc', code: 'PHIL 120', name: 'Introduction to Philosophy', units: 3, cal_getc_area: '3B' },
  { id: 'dvc_engl161', school_id: 'dvc', code: 'ENGL 161', name: 'World Literature', units: 3, cal_getc_area: '3B' },
  { id: 'dvc_hist131', school_id: 'dvc', code: 'HIST 131', name: 'World History to 1500', units: 3, cal_getc_area: '3B' },
  { id: 'dvc_hist120', school_id: 'dvc', code: 'HIST 120', name: 'US History to 1877', units: 3, cal_getc_area: '4' },
  { id: 'dvc_hist121', school_id: 'dvc', code: 'HIST 121', name: 'US History 1877 to Present', units: 3, cal_getc_area: '4' },
  { id: 'dvc_psyc101', school_id: 'dvc', code: 'PSYC 101', name: 'General Psychology', units: 3, cal_getc_area: '4' },
  { id: 'dvc_socio120', school_id: 'dvc', code: 'SOCIO 120', name: 'Introduction to Sociology', units: 3, cal_getc_area: '4' },
  { id: 'dvc_polsc121', school_id: 'dvc', code: 'POLSC 121', name: 'American Government', units: 3, cal_getc_area: '4' },
  { id: 'dvc_astro110', school_id: 'dvc', code: 'ASTRO 110', name: 'Introduction to Astronomy', units: 3, cal_getc_area: '5A' },
  { id: 'dvc_chem120', school_id: 'dvc', code: 'CHEM 120', name: 'Introductory Chemistry', units: 4, cal_getc_area: '5A' },
  { id: 'dvc_biosc110', school_id: 'dvc', code: 'BIOSC 110', name: 'Introduction to Biology', units: 4, cal_getc_area: '5B' },
  { id: 'dvc_biosc120', school_id: 'dvc', code: 'BIOSC 120', name: 'Human Biology', units: 3, cal_getc_area: '5B' },
  { id: 'dvc_biosc101', school_id: 'dvc', code: 'BIOSC 101', name: 'General Biology Lab', units: 1, cal_getc_area: '5C' },
  { id: 'dvc_chem121', school_id: 'dvc', code: 'CHEM 121', name: 'Chemistry Lab', units: 1, cal_getc_area: '5C' },
  { id: 'dvc_span120', school_id: 'dvc', code: 'SPAN 120', name: 'Elementary Spanish', units: 5, cal_getc_area: '6' },
  { id: 'dvc_kor120', school_id: 'dvc', code: 'KOR 120', name: 'Elementary Korean', units: 5, cal_getc_area: '6' },
]

// CC-internal prerequisites. Course-to-course edges.
export const PREREQUISITES = [
  { course_id: 'dvc_comsc165', prerequisite_id: 'dvc_comsc110' },
  { course_id: 'dvc_comsc200', prerequisite_id: 'dvc_comsc165' },
  { course_id: 'dvc_comsc210', prerequisite_id: 'dvc_comsc165' },
  { course_id: 'dvc_comsc260', prerequisite_id: 'dvc_comsc110' },
  { course_id: 'dvc_math193', prerequisite_id: 'dvc_math192' },
  { course_id: 'dvc_math194', prerequisite_id: 'dvc_math193' },
  { course_id: 'dvc_math195', prerequisite_id: 'dvc_math193' },
  { course_id: 'dvc_math292', prerequisite_id: 'dvc_math193' },
  { course_id: 'dvc_phys130', prerequisite_id: 'dvc_math192' },
  { course_id: 'dvc_phys230', prerequisite_id: 'dvc_phys130' },
  { course_id: 'dvc_phys230', prerequisite_id: 'dvc_math193' },
  { course_id: 'dvc_engl125', prerequisite_id: 'dvc_engl122' },
]

// Transfer path = (CC, target major). Lists which CC courses this target requires.
// In a real system these come from assist.org articulation. Demo data diverges
// slightly per target so that switching in Setup visibly changes the plan.
export const TRANSFER_PATHS = [
  {
    id: 'dvc_ucb_cs',
    cc_id: 'dvc',
    target_major_id: 'ucb_cs',
    required_course_ids: [
      'dvc_comsc110', 'dvc_comsc165', 'dvc_comsc200', 'dvc_comsc210', 'dvc_comsc260',
      'dvc_math192', 'dvc_math193', 'dvc_math194', 'dvc_math195',
      'dvc_phys130', 'dvc_phys230',
    ],
  },
  {
    id: 'dvc_ucla_cs',
    cc_id: 'dvc',
    target_major_id: 'ucla_cs',
    // UCLA Samueli CS — no linear algebra at CC, but requires diff eq & full physics.
    required_course_ids: [
      'dvc_comsc110', 'dvc_comsc165', 'dvc_comsc200', 'dvc_comsc210',
      'dvc_math192', 'dvc_math193', 'dvc_math194', 'dvc_math292',
      'dvc_phys130', 'dvc_phys230',
    ],
  },
  {
    id: 'dvc_ucsd_cs',
    cc_id: 'dvc',
    target_major_id: 'ucsd_cs',
    // UCSD CSE — includes linear algebra & discrete, single physics.
    required_course_ids: [
      'dvc_comsc110', 'dvc_comsc165', 'dvc_comsc200', 'dvc_comsc260',
      'dvc_math192', 'dvc_math193', 'dvc_math194', 'dvc_math195',
      'dvc_phys130',
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

const coursesById = new Map(COURSES.map((c) => [c.id, c]))

export function findTransferPath({ cc_id, target_major_id }) {
  return TRANSFER_PATHS.find(
    (p) => p.cc_id === cc_id && p.target_major_id === target_major_id,
  )
}

export function getMajorCourses(path) {
  if (!path) return []
  return path.required_course_ids.map((id) => coursesById.get(id)).filter(Boolean)
}

export function getCalGetcCourses(cc_id) {
  return COURSES.filter((c) => c.school_id === cc_id && c.cal_getc_area)
}

// Prereq edges limited to a given set of course ids (useful for the current plan).
export function filterPrerequisites(courseIds) {
  const set = new Set(courseIds)
  return PREREQUISITES.filter(
    (p) => set.has(p.course_id) && set.has(p.prerequisite_id),
  )
}

export function targetMajorsForSchool(schoolId) {
  return Object.values(TARGET_MAJORS).filter((m) => m.school_id === schoolId)
}

export function schoolsByType(type) {
  return Object.values(SCHOOLS).filter((s) => s.type === type)
}
