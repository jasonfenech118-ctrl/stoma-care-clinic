-- =============================================================================
-- Schedule 5 permit — "Collected from pharmacy" date
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The Schedule 5 permit button now has a "Collected" step for when the patient
--   has collected the controlled-drugs items from pharmacy. This adds the date
--   that step was reached, alongside the day it was left in the ward and the day
--   it came back signed (sql/add-handover-status-dates.sql). The date shows under
--   the button on the handover and prints on the sheet.
--
--   It is a plain column on the patients table, which the app already reads and
--   writes — no grants or row-level security changes are needed. Until it is run,
--   the app simply drops this column from its writes and no collected date shows.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_collected_date date;

NOTIFY pgrst, 'reload schema';
