-- =============================================================================
-- Firm / consultant on the patient record
-- =============================================================================
--
-- Adds one column, consultant, to patients: the firm (the consultant or team)
-- the patient is under. It shows on the patient form and the patient summary.
--
-- Optional and free text; nothing is deleted. Safe to re-run. The app runs
-- without it — the field simply stays blank until this is run.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS consultant text;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'patients'
  AND column_name = 'consultant';
