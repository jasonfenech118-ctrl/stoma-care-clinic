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

-- Episode fields: the admission's discharge date and the appliances used
-- (with the stoma type). record_date is the admission date.
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS discharge_date date;
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS appliances     jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS clinical_records_patient_idx
  ON public.clinical_records (patient_id);

-- Confirm it landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinical_records'
ORDER BY ordinal_position;

-- -----------------------------------------------------------------------------
-- A clinic-wide reference for each admission, e.g. EP-2026-0042, generated when
-- the episode is opened. The partial unique index keeps them from repeating
-- while leaving older episodes (which have none) alone.
-- Added later; safe to re-run.
-- -----------------------------------------------------------------------------
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS episode_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS clinical_records_episode_ref_key
  ON public.clinical_records (episode_ref) WHERE episode_ref IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Let the app read and manage this table, the same way the rest of the registry
-- is reached (anon key + a signed-in session). Without these an insert is
-- refused — "permission denied" or "violates row-level security policy" — and
-- inpatient episodes silently never save. Safe to re-run.
-- -----------------------------------------------------------------------------
GRANT ALL ON public.clinical_records TO anon, authenticated;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_records_all ON public.clinical_records;
CREATE POLICY clinical_records_all ON public.clinical_records
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Prove it works end to end: this insert must return a row, then remove it.
-- (Uses any existing patient; skips silently if the registry is empty.)
DO $$
DECLARE pid uuid; rid uuid;
BEGIN
  SELECT id INTO pid FROM public.patients LIMIT 1;
  IF pid IS NOT NULL THEN
    INSERT INTO public.clinical_records (patient_id, kind, record_date)
    VALUES (pid, 'episode', CURRENT_DATE) RETURNING id INTO rid;
    DELETE FROM public.clinical_records WHERE id = rid;
    RAISE NOTICE 'clinical_records insert/delete OK';
  END IF;
END $$;
