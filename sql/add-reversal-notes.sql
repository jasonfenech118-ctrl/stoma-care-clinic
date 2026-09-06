-- =============================================================================
-- Notes against a reversal
-- =============================================================================
--
-- The register book never records a reversal as a bare date. It records what
-- was done — "Reversal of Hartmann's", "Closure of Ileostomy", "Reversal of
-- covering loop ileostomy / Anterior Resection" — and that sentence is often
-- the only clinical detail the reversal has. The reversal modal now asks for
-- it, so it needs somewhere to live:
--
--   reversal_notes - what was done at the reversal of the FIRST stoma
--
-- Every other stoma keeps its own note inside its own JSON entry
-- (initial_stomas, extra_stomas, extra_refashionings each gain a
-- "reversal_notes" key), so no migration is needed for those and nothing
-- already stored in them is touched.
--
-- Nullable, additive, and nothing is deleted or overwritten.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: IF NOT EXISTS guards the column.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversal_notes text;

-- Confirm it landed.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'reversal_notes';
