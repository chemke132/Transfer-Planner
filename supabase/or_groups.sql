-- OR-group ("alternative track") structure for transfer paths.
-- An assist.org agreement may say e.g. "Complete one of the following:
--   Section A — MATH 10A + 10B + 10C
--   Section B — MATH 20A + 20B + 20C + 20D"
-- which means the student picks ONE section, and only that section's
-- receiving courses count as required for the major.
--
-- Without this, parsing assist.org articulations naively unions every
-- alternative and double-counts (e.g. UCSD Pharma Chem showing both
-- MATH 10-series AND MATH 20-series, both PHYS 1-series AND 2-series).
--
-- We only model groups whose top-level conjunction is "Or" — those are
-- the real choice points. AND-groups are treated as plain required.
--
-- Run once in Supabase SQL editor.

create table if not exists path_or_groups (
  id text primary key,                                    -- "<path_id>:grp:<position>"
  path_id text references transfer_paths(id) on delete cascade,
  position int not null,
  conjunction text,                                       -- "Or"
  selection_type text                                     -- "Complete" etc.
);

create table if not exists path_or_sections (
  id text primary key,                                    -- "<group_id>:s<section_index>"
  group_id text references path_or_groups(id) on delete cascade,
  section_index int not null,
  receiving_codes text[] not null                         -- ["MATH 20A","MATH 20B",...]
);

create index if not exists path_or_groups_path_id_idx on path_or_groups(path_id);
create index if not exists path_or_sections_group_id_idx on path_or_sections(group_id);

-- Anon-readable (same RLS pattern as the rest of the reference tables).
alter table path_or_groups enable row level security;
alter table path_or_sections enable row level security;

drop policy if exists "anon read or_groups" on path_or_groups;
create policy "anon read or_groups" on path_or_groups for select to anon using (true);

drop policy if exists "anon read or_sections" on path_or_sections;
create policy "anon read or_sections" on path_or_sections for select to anon using (true);
