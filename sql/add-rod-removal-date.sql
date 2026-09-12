-- =============================================================================
-- ROD removal date
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The date a patient's stoma ROD (rod / bridge that supports a loop stoma) is
--   due to be removed. It is set from the handover's Complications/ROD button.
--   The app raises a reminder on that day (and keeps it in the reminder bell
--   until the date is cleared, which a nurse does once the rod is out).
--
--   No grants or row-level-security are needed: this is a plain column on the
--   patients table, which the app already reads and writes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS rod_removal_date date;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'rod_removal_date';
