-- =============================================================================
-- Deceased patient — minimise stored data
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- A deceased patient is never followed up again, so their heaviest stored data —
-- the base64 stoma-siting photograph(s) — is pure weight once encounters start
-- piling up. The patient record gains a "Minimise stored data" button that saves
-- a compact self-contained HTML summary of the whole profile, then permanently
-- removes only those photographs (every other row is kept). These columns hold
-- the stamp and the saved summary:
--   minimised_at      - when the record was minimised (blank = not yet done)
--   minimised_by      - the nurse who did it
--   minimised_archive - the compact HTML summary, a few KB, kept on file
--
-- Until this is run the button says so and removes nothing. Nothing already on
-- file changes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS minimised_at      timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS minimised_by      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS minimised_archive text;

-- Confirm they landed (three rows expected).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'patients'
   AND column_name IN ('minimised_at','minimised_by','minimised_archive')
 ORDER BY column_name;
