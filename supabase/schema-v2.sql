-- Transfer Planner schema v2
-- Adds support for real assist.org articulation data with AND/OR logic.
-- Run in Supabase SQL editor AFTER schema.sql + seed.sql.
--
-- Strategy:
--   - Keep existing path_requirements as the "effective" flat list the
--     frontend reads (zero UI changes required).
--   - Add path_articulations to store the full AND/OR tree per UCB course.
--   - Add path_articulation_options to enumerate OR branches so the user
--     can pick which CC alternative they took (e.g. MATH 192 vs 192H).
--   - Add assist_id to courses so the scraper can upsert idempotently.

-- ── Columns ────────────────────────────────────────────────────────────────

alter table courses
  add column if not exists assist_id integer;

create unique index if not exists courses_assist_id_key
  on courses (assist_id)
  where assist_id is not null;

-- ── Articulation tables ────────────────────────────────────────────────────

-- One row per receiving-institution course (e.g. UCB COMPSCI 61A) that has
-- an articulation agreement on a given transfer path.
create table if not exists path_articulations (
  id text primary key,                                          -- e.g. "dvc_ucb_cs:compsci_61a"
  path_id text references transfer_paths(id) on delete cascade,
  receiving_code text not null,                                 -- "COMPSCI 61A"
  receiving_name text,                                          -- "Structure and Interpretation…"
  receiving_units numeric,
  sending_logic jsonb not null,                                 -- raw AND/OR tree from assist.org
  has_articulation boolean not null default true,               -- false = "No Course Articulated"
  unique (path_id, receiving_code)
);

-- Zero or more rows per articulation. Exists only when sending_logic has OR
-- branches that the user could meaningfully choose between.
-- option_index=0 is the default the scraper picks automatically.
create table if not exists path_articulation_options (
  id text primary key,                                          -- e.g. "dvc_ucb_cs:compsci_61a:0"
  articulation_id text references path_articulations(id) on delete cascade,
  option_index integer not null,
  label text not null,                                          -- "MATH 192" / "MATH 192H"
  course_ids text[] not null,                                   -- CC courses required if this branch chosen
  unique (articulation_id, option_index)
);

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table path_articulations enable row level security;
alter table path_articulation_options enable row level security;

drop policy if exists "public read" on path_articulations;
create policy "public read" on path_articulations for select using (true);

drop policy if exists "public read" on path_articulation_options;
create policy "public read" on path_articulation_options for select using (true);

-- ── Populate known assist.org institution ids ──────────────────────────────

update schools set assist_id = 114 where id = 'dvc'  and assist_id is distinct from 114;
update schools set assist_id = 79  where id = 'ucb'  and assist_id is distinct from 79;
update schools set assist_id = 117 where id = 'ucla' and assist_id is distinct from 117;
update schools set assist_id = 7   where id = 'ucsd' and assist_id is distinct from 7;
