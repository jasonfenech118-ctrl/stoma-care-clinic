-- =============================================================================
-- Patient details signature — who entered the record and who last edited it
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- Every patient now carries a signature on their details card:
--   created_by / created_at - the nurse who first entered the patient, and when
--   updated_by / updated_at - the nurse who last saved the details, and when
--
-- The name is the signed-in nurse's display name. Patients entered before this
-- was added simply read "Author not recorded"; nothing already on file changes.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Confirm they landed (four rows expected).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'patients'
   AND column_name IN ('created_by','created_at','updated_by','updated_at');
