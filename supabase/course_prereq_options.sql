-- Multiple prereq paths per course.
--
-- Some DVC courses are reachable from several different prereq chains:
--   PHYS 130 ← PHYS 129 (calc-based, 1 course)
--           ← PHYS 110 + PHYS 111 (algebra-based, 2 courses)
--           ← PHYS 112 / PHYS 120 / one-year-HS-physics
--
-- The flat path_prerequisites table only models a single AND chain. Add
-- course_prereq_options so the user can pick which branch they took (or
-- plan to take), and the planner expands prereqs accordingly. The
-- existing `prerequisites` table is still populated with the default
-- branch (option_index=0) for backward compat / migrations.
--
-- Run once in Supabase SQL editor.

create table if not exists course_prereq_options (
  id text primary key,                                          -- "<course_id>:<option_index>"
  course_id text references courses(id) on delete cascade,
  option_index integer not null,
  prerequisite_ids text[] not null,                             -- ["dvc_phys110","dvc_phys111"]
  label text not null                                            -- "PHYS 110 + PHYS 111"
);

create index if not exists course_prereq_options_course_id_idx
  on course_prereq_options(course_id);

alter table course_prereq_options enable row level security;

drop policy if exists "anon read course_prereq_options" on course_prereq_options;
create policy "anon read course_prereq_options"
  on course_prereq_options for select to anon using (true);
