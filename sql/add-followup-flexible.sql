-- =============================================================================
-- Follow-up flexible — "according to clinic availability"
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   When a follow-up is set to "According to clinic availability" the app used
--   to turn that into a fixed due month and forget the choice. This column
--   remembers it, so Follow-up Planning can list those patients per nurse and
--   slot them in wherever there is space.
--
--     followup_flexible - true when the follow-up is "according to clinic
--                         availability"; false / NULL for a fixed due month.
--
--   Read tolerantly — until this runs, the follow-up still saves and the choice
--   simply is not remembered.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS followup_flexible boolean;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'followup_flexible';
