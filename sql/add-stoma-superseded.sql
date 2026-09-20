-- =============================================================================
-- Stoma superseded date — a new stoma formed at the same site
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   A stoma sometimes ends not by reversal but because a NEW stoma is later
--   formed at the SAME site (the original is taken down). That is not a
--   refashioning and it is not a reversal, so it must not inflate the reversal
--   counts — but the earlier stoma should stop being counted as present.
--
--   The date this happened is stored:
--     - for a LATER / SAME-OPERATION stoma: as "superseded_date" inside the
--       existing extra_stomas / initial_stomas JSON (NO migration needed);
--     - for the FIRST (base) stoma: in this new column.
--
--     stoma_superseded_date - the date a new stoma was formed at the base
--                             stoma's site, closing it. NULL for every other
--                             patient.
--
--   The app reads it tolerantly — until this runs, superseding the base stoma
--   simply is not persisted; superseding a later or same-operation stoma works
--   already because it lives in JSON.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS stoma_superseded_date date;

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'stoma_superseded_date';
