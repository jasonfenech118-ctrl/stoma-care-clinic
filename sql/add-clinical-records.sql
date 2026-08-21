-- =============================================================================
-- Clinical records — episodes, stomas and appliances
-- =============================================================================
--
-- Adds one table that holds the per-patient clinical records shown on the
-- "Clinical records" tab of the patient summary: care episodes, stomas and
-- stoma appliances. Each row is one record of one kind, tied to a patient.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: it guards itself and nothing is deleted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clinical_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('episode','stoma','appliance')),
  title        text,          -- e.g. "Stoma surgery", "End colostomy", "One-piece closed pouch"
  detail       text,          -- e.g. "Left lower quadrant"
  status       text,          -- e.g. "Still in follow-up", "Active", "Current"
  record_date  date,          -- when it started / was formed / was fitted
  is_current   boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   text,          -- name of the nurse who added it
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_records_patient_idx
  ON public.clinical_records (patient_id);

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinical_records'
ORDER BY ordinal_position;
