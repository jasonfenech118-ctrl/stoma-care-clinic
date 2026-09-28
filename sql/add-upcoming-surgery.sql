-- =============================================================================
-- Upcoming surgery date (existing stoma patients)
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The date an existing stoma patient is coming in for an operation. It is set
--   from the patient record (Stomas & operation -> Upcoming surgery -> Add
--   surgery date). From that day the patient rides at the top of the Handover,
--   highlighted, so the ward is expecting them. It clears itself when the patient
--   is admitted (an inpatient visit is opened), or a nurse clears it by hand.
--
--   This is separate from proposed_reversal_date, which drives the "awaiting
--   reversal" row for a planned reversal specifically.
--
--   No grants or row-level-security are needed: this is a plain column on the
--   patients table, which the app already reads and writes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS upcoming_surgery_date date;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'upcoming_surgery_date';
