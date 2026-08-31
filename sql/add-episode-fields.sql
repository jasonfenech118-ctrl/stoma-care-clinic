-- =============================================================================
-- Episode admission / discharge dates, and the appliances used
-- =============================================================================
--
-- Adds to clinical_records the fields an inpatient episode needs:
--
--   discharge_date - the date the patient was discharged (the episode closes,
--                    keeps its number, and stays in Episodes)
--   appliances     - what was in use during the admission, with the stoma type,
--                    e.g.  {"stoma_type":"End Colostomy",
--                           "appliances":["Stomahesive Flange 57mm","Drainable Bag 57mm"],
--                           "accessories":["Filler Paste"]}
--
-- record_date is the date of admission. Both are optional; nothing is deleted.
-- Safe to re-run.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS discharge_date date;
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS appliances     jsonb DEFAULT '[]'::jsonb;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinical_records'
  AND column_name IN ('discharge_date','appliances')
ORDER BY column_name;
