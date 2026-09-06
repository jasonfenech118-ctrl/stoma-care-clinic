-- =============================================================================
-- When each outcome happened
-- =============================================================================
--
-- Every outcome a patient can reach is now recorded with the date it happened,
-- because the status buttons on the patient form ask for one before they will
-- change anything. Two of the four had nowhere to put it:
--
--   discharged_gozo_date    - the date follow-up passed to Gozo
--   relocated_overseas_date - the date the patient left Malta
--
-- The other two already have their columns and are unchanged:
--   reversal_date  - the stoma reversal (each stoma also carries its own)
--   deceased_date  - the date of death
--
-- Note that discharge_date is a different thing and is left alone: it is the
-- date the patient went home after the operation, not a change of outcome.
--
-- Both are nullable and nothing already on file is touched. A patient who was
-- discharged to Gozo before the date was asked for simply has none.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: IF NOT EXISTS guards every column.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharged_gozo_date    date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS relocated_overseas_date date;

-- Confirm they landed.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('discharged_gozo_date', 'relocated_overseas_date')
ORDER BY column_name;
