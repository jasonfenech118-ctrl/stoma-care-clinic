-- Retains operation identity and outcomes when the exact date is unknown.
-- Existing records and access policies are unchanged.
BEGIN;
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS stoma_operation_history jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
NOTIFY pgrst, 'reload schema';
