-- =============================================================================
-- When each handover document reached its status
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- WHAT IT IS
--   The handover's two document buttons record WHEN they changed, not just their
--   current state. The Schedule 5 permit keeps both dates that matter for a
--   controlled-drugs permit — the day it was left in the ward, and the day it
--   came back signed — and the discharge letter keeps the day it was done. The
--   dates show under each button on the handover and print on the sheet.
--
--   No grants or row-level-security are needed: these are plain columns on the
--   patients table, which the app already reads and writes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_letter_done_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_left_date    date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_signed_date  date;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('discharge_letter_done_date','schedule_five_left_date','schedule_five_signed_date')
ORDER BY column_name;
