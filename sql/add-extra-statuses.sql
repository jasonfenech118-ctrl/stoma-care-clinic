-- =============================================================================
-- Extra patient statuses
-- =============================================================================
--
-- A patient can be in more than one state at once — discharged to Gozo and
-- later deceased, for example. followup_status keeps the main state, which is
-- what the recall lists and the row colour use; extra_statuses holds the others
-- so the record shows the whole picture.
--
-- Values are the same keys followup_status uses:
--   discharged_gozo | relocated_overseas | reversed | deceased
--
-- Optional and nullable. Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS extra_statuses jsonb DEFAULT '[]'::jsonb;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'extra_statuses';
