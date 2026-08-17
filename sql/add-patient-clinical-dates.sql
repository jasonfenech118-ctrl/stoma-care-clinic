-- =============================================================================
-- Add clinical date columns to the patient record
-- =============================================================================
--
-- Adds three optional dates shown on the Patient Directory:
--   surgery_date   - date of the stoma surgery
--   reversal_date  - date the stoma was reversed
--   deceased_date  - date of death (RIP)
--
-- All are nullable: a patient may have none, some, or all of them. They sit
-- alongside the existing followup_status values 'reversed' and 'deceased' —
-- the status says the patient is in that state, these columns say when.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: IF NOT EXISTS guards every column.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS surgery_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversal_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deceased_date date;

-- Confirm the columns exist.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('surgery_date', 'reversal_date', 'deceased_date')
ORDER BY column_name;
