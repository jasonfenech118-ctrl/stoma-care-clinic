-- =============================================================================
-- Follow-up action — what happens next after a visit
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The Follow-up step of the visit now begins with an explicit choice, stored
--   on the appointment:
--
--     followup_action - 'review-month'  (a due-month plan — reviewed around a
--                                        target month, no exact date yet)
--                       'book-exact'    (an exact date/time appointment booked)
--                       'none'          (no further appointment; the due month
--                                        is cleared, the patient status is NOT
--                                        changed automatically)
--                       'urgent'        (urgent review flagged)
--                       'status-review' (the follow-up status needs a decision)
--
--   Nothing already on file is touched; older appointments simply have none set.
--   The app reads it tolerantly — until this runs, the Follow-up step still works
--   and simply does not persist which action was chosen.
-- =============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS followup_action text;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'appointments'
  AND column_name = 'followup_action';
