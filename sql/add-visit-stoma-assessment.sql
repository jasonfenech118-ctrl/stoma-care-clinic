-- Jason's per-stoma assessment at a clinic visit (Complete visit -> Clinical review).
-- Run ONCE in Supabase: SQL Editor -> New query -> paste the single line below -> Run.
-- Safe to re-run. Until it runs, visits still save; only the assessment is skipped.
--
-- stoma_assessment: [{uid, type, name, colour, output[], rod{status,due,removed}, notes}]

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS stoma_assessment jsonb;
