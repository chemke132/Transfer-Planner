-- Extend path_or_groups to support "pick N" (not just "pick exactly one").
--
-- Previously we modelled every OR-group as "pick exactly one section". But
-- assist.org RequirementGroups often say "Complete 2 courses from..." or
-- "Complete at least 3 courses from..." — those need a multi-select UI
-- where the user checks N rows and the union of CC courses is what counts.
--
-- min_count = the number of sections the user must pick (default 1 to
-- preserve existing behavior). For qual=AtLeast we treat min_count as a
-- floor; the UI still defaults to picking exactly that many.
--
-- Run once in Supabase SQL editor.

alter table path_or_groups
  add column if not exists min_count integer not null default 1;
