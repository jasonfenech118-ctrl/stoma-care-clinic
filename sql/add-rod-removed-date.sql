-- =============================================================================
-- ROD removed — record whether a stoma rod (bridge) was actually removed
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   A patient already carries rod_removal_date — the day the rod is due out,
--   which raises a reminder. This adds rod_removed_date: the day it was actually
--   removed. When it is set, the patient drops off the "ROD removal" reminders
--   and the record shows "✓ Rod removed on <date>".
--
--   Until this runs the app still works: pressing "✓ Rod removed" falls back to
--   clearing the due date so the reminder still stops, it just does not keep the
--   removal date on record.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS rod_removed_date date;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'rod_removed_date';
