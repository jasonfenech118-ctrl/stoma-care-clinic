-- =============================================================================
-- Complication catalogue — a managed list, not a plain dropdown
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: every change is guarded and touches nothing already on file.
--
-- WHAT IT IS
--   The complication choices already live in the complication_types table and
--   can be grown in-app. This upgrade turns that plain list into a managed
--   catalogue so authorised staff can, from Clinical lists:
--
--     scope         - which stomas a complication applies to:
--                       'all'         offered for every stoma (the default)
--                       'colostomy'   offered only for a colostomy
--                       'ileostomy'   offered only for an ileostomy
--     display_order - the order it appears in the dropdown (low numbers first;
--                     ties fall back to alphabetical)
--     active        - true shows it in NEW dropdowns; false hides it from new
--                     records but keeps it visible in historical ones (a used
--                     complication is made inactive, never deleted)
--     created_by / created_at / updated_by / updated_at - a light audit trail
--
--   Nothing already recorded on a patient is touched: each patient's running
--   complications list is a JSON snapshot of the text, so past records read the
--   same whatever happens to the catalogue afterwards.
--
--   The app reads these columns tolerantly — until this runs it simply behaves
--   as it did before (a flat, always-active, all-stomas list).
-- =============================================================================

-- 1. New catalogue columns. IF NOT EXISTS on each, so a re-run is a no-op.
ALTER TABLE public.complication_types
  ADD COLUMN IF NOT EXISTS scope         text        NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS display_order integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active        boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by    text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by    text;

-- 2. Keep scope to the three known values; anything odd falls back to 'all'.
ALTER TABLE public.complication_types
  DROP CONSTRAINT IF EXISTS complication_types_scope_chk;
ALTER TABLE public.complication_types
  ADD  CONSTRAINT complication_types_scope_chk
  CHECK (scope IN ('all','colostomy','ileostomy'));

-- 3. Give the existing rows a sensible starting order (alphabetical) so they do
--    not all share order 0. Only touches rows still at the default 0.
WITH ordered AS (
  SELECT name, row_number() OVER (ORDER BY name) * 10 AS ord
  FROM public.complication_types
)
UPDATE public.complication_types c
SET display_order = ordered.ord
FROM ordered
WHERE c.name = ordered.name
  AND c.display_order = 0;

-- 4. Grants / row-level security, unchanged from add-complications.sql and safe
--    to re-run. Without this the app cannot read or grow the catalogue.
GRANT ALL ON public.complication_types TO anon, authenticated;
ALTER TABLE public.complication_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complication_types_all ON public.complication_types;
CREATE POLICY complication_types_all ON public.complication_types
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT name, scope, display_order, active
FROM public.complication_types
ORDER BY display_order, name;
