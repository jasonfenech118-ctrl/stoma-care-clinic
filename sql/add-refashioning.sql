-- =============================================================================
-- Stoma refashioning columns
-- =============================================================================
--
-- Adds the fields for a stoma refashioning — the old stoma closed and a new one
-- formed, usually at the same operation:
--   refashion_closure_date - date the previous stoma was closed
--   refashion_formed_date  - date the new stoma was formed
--   refashion_findings     - the operation and findings for the refashioning
--
-- All nullable and optional. Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_closure_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_formed_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_findings     text;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'patients'
  AND column_name IN ('refashion_closure_date','refashion_formed_date','refashion_findings')
ORDER BY column_name;
