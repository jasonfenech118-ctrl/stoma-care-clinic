-- =============================================================================
-- The patient's full address
-- =============================================================================
--
-- The registry already keeps the locality — the town or village — because that
-- is what the map and the area counts are built on. The register book carries
-- the whole address, and the New Patients page prints it as it is written
-- there, so the street and house name need a column of their own:
--
--   address - the full address, e.g. "62, St. Anthony Flt No.1, Triq Giacint
--             Tua, Gżira GŻR 06"
--
-- The locality stays as it is. A patient may have one, both, or neither: the
-- column is nullable and nothing already on file is touched.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: IF NOT EXISTS guards the column.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS address text;

-- Confirm it landed.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name = 'address';
