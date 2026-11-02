-- =============================================================================
-- Deceased date for a REVERSED patient (kept in the Reversed list)
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   Some reversed patients later die, but should stay classified and listed as
--   REVERSED (not moved to the Deceased list). The Reversed registry now has a
--   "Deceased date" button on each row that records this date. It is stored in
--   its own column — separate from the real deceased_date used for the Deceased
--   outcome — so these patients are never treated as a Deceased outcome; the
--   registry just marks their name (black, with a ✝) and shows the date.
--
--   It is a plain column on the patients table, which the app reads and writes.
--   Until it is run, the app drops this column from its writes and the button
--   reports that the migration still needs to be run.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversed_deceased_date date;
