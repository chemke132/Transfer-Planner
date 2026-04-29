-- Add is_elective flag to path_articulations.
-- When the assist.org RequirementGroup is "NFromArea" with amountUnitType =
-- QuarterUnit / SemesterUnit (e.g. UC Davis CompE "Technical Electives:
-- complete 8 quarter units from MGT 011A/B, ENG 035, ENG 045"), the listed
-- courses aren't required for the major — they're advisor-curated electives.
-- Flag them so the frontend can drop them from the default required union
-- and surface them as opt-in instead.
--
-- Run once in Supabase SQL editor.

alter table path_articulations
  add column if not exists is_elective boolean not null default false;
