-- =============================================================================
-- Post-operative discharge date
-- =============================================================================
--
-- Adds one column: discharge_date — the date the patient was discharged after
-- the stoma operation. It is optional and nullable, like the other clinical
-- dates.
--
-- If you have already run sql/add-registry-columns.sql after this column was
-- added there, you do not need this file — it does the same thing. It is kept
-- as a small standalone for installs that ran the older registry migration and
-- only need this one extra column.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: the step guards itself and nothing is deleted.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_date date;

-- Confirm it landed.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'discharge_date';
