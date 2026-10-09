-- =============================================================================
-- Siting session cancellation reason — why a siting session was cancelled
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- When a siting session is cancelled the clinic now records WHY, the same split
-- it already uses on a cancelled appointment:
--   cancellation_reason - 'patient'  (due to the patient) or
--                         'hospital' (a hospital complication)
--   cancellation_note    - an optional free-text note
--   cancelled_by         - the signed-in nurse who cancelled it
--   cancelled_at         - when it was cancelled
--
-- Until this is run, a session can still be cancelled — the app simply cannot
-- store the reason yet, and says so. Sessions cancelled before this was added
-- read "Cancelled" with no reason; nothing already on file changes.
-- =============================================================================

ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancellation_reason text;   -- 'patient' | 'hospital'
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancellation_note   text;
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancelled_by        text;
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz;

-- Confirm they landed (four rows expected).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'siting_sessions'
   AND column_name IN ('cancellation_reason','cancellation_note','cancelled_by','cancelled_at')
 ORDER BY column_name;
