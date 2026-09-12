-- =============================================================================
-- Why a patient's follow-up status changed, and when it took effect
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- WHAT IT IS
--   When a nurse changes a patient's follow-up status from the record's Outcome
--   tab (Deceased, Discharged to Gozo, Relocated overseas), the change now
--   carries two extra details:
--
--     followup_status_effective_date - the day the new status took effect
--     followup_status_reason         - an optional free-text note ("why")
--
--   Both are shown under Outcome on the patient record. They are cleared when
--   the patient is set back to follow-up. Nothing already on file is touched.
--
--   No grants or row-level-security are needed: these are plain columns on the
--   patients table, which the app already reads and writes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS followup_status_effective_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS followup_status_reason         text;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('followup_status_effective_date','followup_status_reason')
ORDER BY column_name;
