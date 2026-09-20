-- =============================================================================
-- Rod removal — which stoma the rod belongs to
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The rod (bridge) belongs to one particular stoma — usually a loop
--   ileostomy. The rod removal date is already stored on the patient
--   (rod_removal_date / rod_removed_date); this column records WHICH stoma the
--   rod is for, so the reminder and the record show the rod against that stoma.
--
--     rod_stoma_uid - the uid of the stoma whose rod this is (matches the uid
--                     used in extra_stomas / initial_stomas, or 'base' for the
--                     first stoma). NULL when not tied to a stoma.
--
--   Read tolerantly — until this runs, the rod date still saves and the stoma
--   link is simply not persisted.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS rod_stoma_uid text;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'rod_stoma_uid';
