-- Transfer Planner DB schema (MVP)
-- Run this in Supabase SQL editor.
--
-- Design:
--   courses / prerequisites are CC-scoped and shared across all transfer targets.
--   Cal-GETC eligibility is a CC-level fact (cal_getc_area column on courses).
--   A "transfer path" = (cc_school_id, target_major_id). path_requirements lists
--   which CC courses that transfer path requires (mirrors assist.org articulation).

create table if not exists schools (
  id text primary key,
  name text not null,
  type text,                  -- "CC" | "UC" | "CSU"
  assist_id integer
);

create table if not exists target_majors (
  id text primary key,
  school_id text references schools(id) on delete cascade,
  key text not null,          -- stable identifier, e.g. "cs"
  name text not null
);

create table if not exists courses (
  id text primary key,            -- e.g. "dvc_comsc110"
  school_id text references schools(id) on delete cascade,  -- CC that offers this course
  code text not null,             -- e.g. "COMSC 110"
  name text not null,
  units integer,
  cal_getc_area text,             -- nullable; set if course is Cal-GETC-approved
  description text
);

create table if not exists prerequisites (
  course_id text references courses(id) on delete cascade,
  prerequisite_id text references courses(id) on delete cascade,
  primary key (course_id, prerequisite_id)
);

create table if not exists transfer_paths (
  id text primary key,                                    -- e.g. "dvc_ucb_cs"
  cc_school_id text references schools(id) on delete cascade,
  target_major_id text references target_majors(id) on delete cascade,
  unique (cc_school_id, target_major_id)
);

create table if not exists path_requirements (
  path_id text references transfer_paths(id) on delete cascade,
  course_id text references courses(id) on delete cascade,
  is_required boolean default true,
  primary key (path_id, course_id)
);

-- ── Seed data ──────────────────────────────────────────────────────────────

insert into schools (id, name, type) values
  ('dvc', 'Diablo Valley College', 'CC'),
  ('ucb', 'UC Berkeley', 'UC'),
  ('ucla', 'UCLA', 'UC'),
  ('ucsd', 'UC San Diego', 'UC')
on conflict (id) do nothing;

insert into target_majors (id, school_id, key, name) values
  ('ucb_cs', 'ucb', 'cs', 'Computer Science'),
  ('ucla_cs', 'ucla', 'cs', 'Computer Science'),
  ('ucsd_cs', 'ucsd', 'cs', 'Computer Science')
on conflict (id) do nothing;

insert into transfer_paths (id, cc_school_id, target_major_id) values
  ('dvc_ucb_cs', 'dvc', 'ucb_cs'),
  ('dvc_ucla_cs', 'dvc', 'ucla_cs'),
  ('dvc_ucsd_cs', 'dvc', 'ucsd_cs')
on conflict (id) do nothing;
