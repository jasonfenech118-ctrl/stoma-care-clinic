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
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_location   text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_discharge_date date;
-- Multiple stoma refashionings, stored as a JSON array.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_refashionings jsonb DEFAULT '[]'::jsonb;
-- New stoma formation: an additional stoma formed, the previous one still present.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_formed_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_findings    text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_location    text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_closure_date date;
-- Multiple new stoma formations, stored as a JSON array.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_stomas jsonb DEFAULT '[]'::jsonb;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'patients'
  AND column_name IN ('refashion_closure_date','refashion_formed_date','refashion_findings')
ORDER BY column_name;
