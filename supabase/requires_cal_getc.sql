-- Add requires_cal_getc flag to target_majors.
-- Default true; the extract_colleges.py script flips false for CoE / CoC /
-- Haas / similar colleges that use their own breadth pattern.
-- Run once in Supabase SQL editor.

alter table target_majors
  add column if not exists requires_cal_getc boolean not null default true;
