-- Options Jason adds himself in the stoma assessment ("+ Add other…") for
-- colour / appearance, function / output and peristomal skin, so they appear in
-- the lists on every computer. Until this runs, added options are kept on the
-- computer they were added on only.
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run. Safe to re-run.
CREATE TABLE IF NOT EXISTS public.assessment_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field text NOT NULL CHECK (field IN ('colour','output','skin')), name text NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (field, name));
GRANT ALL ON public.assessment_options TO anon, authenticated;
ALTER TABLE public.assessment_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_options_all ON public.assessment_options;
CREATE POLICY assessment_options_all ON public.assessment_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
