-- Transfer Planner — seed course data (derived from src/data/seed.js).
-- Run this AFTER schema.sql.
-- Idempotent: uses on conflict do nothing / do update.

-- ── Courses ────────────────────────────────────────────────────────────────
-- DVC CS-adjacent
insert into courses (id, school_id, code, name, units, cal_getc_area) values
  ('dvc_comsc110', 'dvc', 'COMSC 110', 'Intro to Computer Science', 4, null),
  ('dvc_comsc165', 'dvc', 'COMSC 165', 'Advanced Programming with C/C++', 4, null),
  ('dvc_comsc200', 'dvc', 'COMSC 200', 'Data Structures', 4, null),
  ('dvc_comsc210', 'dvc', 'COMSC 210', 'Computer Architecture & Assembly', 4, null),
  ('dvc_comsc260', 'dvc', 'COMSC 260', 'Discrete Mathematics', 4, null),
  ('dvc_math192', 'dvc', 'MATH 192', 'Calculus I', 4, null),
  ('dvc_math193', 'dvc', 'MATH 193', 'Calculus II', 4, null),
  ('dvc_math194', 'dvc', 'MATH 194', 'Calculus III', 4, null),
  ('dvc_math195', 'dvc', 'MATH 195', 'Linear Algebra', 4, null),
  ('dvc_math292', 'dvc', 'MATH 292', 'Differential Equations', 4, null),
  ('dvc_phys130', 'dvc', 'PHYS 130', 'Physics with Calculus I', 4, null),
  ('dvc_phys230', 'dvc', 'PHYS 230', 'Physics with Calculus II', 4, null),
  -- DVC Cal-GETC
  ('dvc_engl122', 'dvc', 'ENGL 122', 'Freshman English', 3, '1A'),
  ('dvc_engl123', 'dvc', 'ENGL 123', 'Reading, Writing, Thinking', 3, '1A'),
  ('dvc_engl125', 'dvc', 'ENGL 125', 'Critical Thinking & Writing', 3, '1B'),
  ('dvc_engl126', 'dvc', 'ENGL 126', 'Critical Reasoning in Literature', 3, '1B'),
  ('dvc_spch120', 'dvc', 'SPCH 120', 'Public Speaking', 3, '1C'),
  ('dvc_spch122', 'dvc', 'SPCH 122', 'Interpersonal Communication', 3, '1C'),
  ('dvc_math142', 'dvc', 'MATH 142', 'Elementary Statistics', 4, '2'),
  ('dvc_math182', 'dvc', 'MATH 182', 'Precalculus', 4, '2'),
  ('dvc_arthis193', 'dvc', 'ARTHS 193', 'Art History: Ancient to Medieval', 3, '3A'),
  ('dvc_arthis195', 'dvc', 'ARTHS 195', 'Art History: Renaissance to Modern', 3, '3A'),
  ('dvc_musx120', 'dvc', 'MUSX 120', 'Music Appreciation', 3, '3A'),
  ('dvc_phil120', 'dvc', 'PHIL 120', 'Introduction to Philosophy', 3, '3B'),
  ('dvc_engl161', 'dvc', 'ENGL 161', 'World Literature', 3, '3B'),
  ('dvc_hist131', 'dvc', 'HIST 131', 'World History to 1500', 3, '3B'),
  ('dvc_hist120', 'dvc', 'HIST 120', 'US History to 1877', 3, '4'),
  ('dvc_hist121', 'dvc', 'HIST 121', 'US History 1877 to Present', 3, '4'),
  ('dvc_psyc101', 'dvc', 'PSYC 101', 'General Psychology', 3, '4'),
  ('dvc_socio120', 'dvc', 'SOCIO 120', 'Introduction to Sociology', 3, '4'),
  ('dvc_polsc121', 'dvc', 'POLSC 121', 'American Government', 3, '4'),
  ('dvc_astro110', 'dvc', 'ASTRO 110', 'Introduction to Astronomy', 3, '5A'),
  ('dvc_chem120', 'dvc', 'CHEM 120', 'Introductory Chemistry', 4, '5A'),
  ('dvc_biosc110', 'dvc', 'BIOSC 110', 'Introduction to Biology', 4, '5B'),
  ('dvc_biosc120', 'dvc', 'BIOSC 120', 'Human Biology', 3, '5B'),
  ('dvc_biosc101', 'dvc', 'BIOSC 101', 'General Biology Lab', 1, '5C'),
  ('dvc_chem121', 'dvc', 'CHEM 121', 'Chemistry Lab', 1, '5C'),
  ('dvc_span120', 'dvc', 'SPAN 120', 'Elementary Spanish', 5, '6'),
  ('dvc_kor120', 'dvc', 'KOR 120', 'Elementary Korean', 5, '6')
on conflict (id) do update set
  school_id = excluded.school_id,
  code = excluded.code,
  name = excluded.name,
  units = excluded.units,
  cal_getc_area = excluded.cal_getc_area;

-- ── Prerequisites ──────────────────────────────────────────────────────────
insert into prerequisites (course_id, prerequisite_id) values
  ('dvc_comsc165', 'dvc_comsc110'),
  ('dvc_comsc200', 'dvc_comsc165'),
  ('dvc_comsc210', 'dvc_comsc165'),
  ('dvc_comsc260', 'dvc_comsc110'),
  ('dvc_math193', 'dvc_math192'),
  ('dvc_math194', 'dvc_math193'),
  ('dvc_math195', 'dvc_math193'),
  ('dvc_math292', 'dvc_math193'),
  ('dvc_phys130', 'dvc_math192'),
  ('dvc_phys230', 'dvc_phys130'),
  ('dvc_phys230', 'dvc_math193'),
  ('dvc_engl125', 'dvc_engl122')
on conflict do nothing;

-- ── Path requirements ──────────────────────────────────────────────────────
-- DVC → UCB CS
insert into path_requirements (path_id, course_id) values
  ('dvc_ucb_cs', 'dvc_comsc110'),
  ('dvc_ucb_cs', 'dvc_comsc165'),
  ('dvc_ucb_cs', 'dvc_comsc200'),
  ('dvc_ucb_cs', 'dvc_comsc210'),
  ('dvc_ucb_cs', 'dvc_comsc260'),
  ('dvc_ucb_cs', 'dvc_math192'),
  ('dvc_ucb_cs', 'dvc_math193'),
  ('dvc_ucb_cs', 'dvc_math194'),
  ('dvc_ucb_cs', 'dvc_math195'),
  ('dvc_ucb_cs', 'dvc_phys130'),
  ('dvc_ucb_cs', 'dvc_phys230')
on conflict do nothing;

-- DVC → UCLA CS
insert into path_requirements (path_id, course_id) values
  ('dvc_ucla_cs', 'dvc_comsc110'),
  ('dvc_ucla_cs', 'dvc_comsc165'),
  ('dvc_ucla_cs', 'dvc_comsc200'),
  ('dvc_ucla_cs', 'dvc_comsc210'),
  ('dvc_ucla_cs', 'dvc_math192'),
  ('dvc_ucla_cs', 'dvc_math193'),
  ('dvc_ucla_cs', 'dvc_math194'),
  ('dvc_ucla_cs', 'dvc_math292'),
  ('dvc_ucla_cs', 'dvc_phys130'),
  ('dvc_ucla_cs', 'dvc_phys230')
on conflict do nothing;

-- DVC → UCSD CS
insert into path_requirements (path_id, course_id) values
  ('dvc_ucsd_cs', 'dvc_comsc110'),
  ('dvc_ucsd_cs', 'dvc_comsc165'),
  ('dvc_ucsd_cs', 'dvc_comsc200'),
  ('dvc_ucsd_cs', 'dvc_comsc260'),
  ('dvc_ucsd_cs', 'dvc_math192'),
  ('dvc_ucsd_cs', 'dvc_math193'),
  ('dvc_ucsd_cs', 'dvc_math194'),
  ('dvc_ucsd_cs', 'dvc_math195'),
  ('dvc_ucsd_cs', 'dvc_phys130')
on conflict do nothing;
