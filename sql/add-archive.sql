-- =============================================================================
-- Archive a patient instead of deleting them
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- WHAT IT IS
--   Archiving takes a patient out of the registry while keeping their full
--   record, so a duplicate or a patient entered by mistake can be removed from
--   the active list without the finality of a delete — and restored later.
--
--     archived     - true once archived; the registry hides these unless
--                    "show archived" is pressed, where each has a Restore action
--     archived_at  - when it was archived
--     archived_by  - who archived it (the signed-in user's email)
--
--   Permanent deletion still exists, but now sits behind the Archive step rather
--   than as a prominent red button. Nothing already on file is touched; every
--   existing patient simply starts un-archived.
--
--   No grants or row-level-security are needed: these are plain columns on the
--   patients table, which the app already reads and writes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS archived    boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS archived_by text;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('archived','archived_at','archived_by')
ORDER BY column_name;
