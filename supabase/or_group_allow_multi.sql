-- Distinguish "pick exactly 1" from "pick at least 1" OR-groups.
--
-- assist.org instruction.amountQuantifier="AtLeast" means the user can
-- satisfy the requirement with N OR MORE picks (not exactly N). With our
-- previous model — single-radio for amount=1 — students applying to
-- multiple UCs couldn't pick a second course from the same group even
-- though it would help overlap.
--
-- min_count   = floor (must pick at least this many)
-- allow_multi = whether the UI should let the user pick more than 1
--               (true for AtLeast or amount>=2; false for "exactly 1")
--
-- Run once in Supabase SQL editor.

alter table path_or_groups
  add column if not exists allow_multi boolean not null default false;
