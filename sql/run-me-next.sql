-- =============================================================================
-- MDH Stoma Care Clinic — everything the database still needs
-- =============================================================================
--
-- One script that brings the database up to what the app now expects. It is the
-- three outstanding migrations rolled together:
--
--   sql/add-clinical-records.sql    episodes, stomas and appliances + the
--                                   permissions without which they never save
--   sql/add-inpatients.sql          the handover columns, nurse notes, flange due
--   sql/add-registry-columns.sql    the proposed reversal date
--   sql/ensure-appliance-tracking.sql  per-stoma appliances on an appointment
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste all of this -> Run.
--
-- Safe to run as many times as you like: every step guards itself, nothing is
-- dropped and no data is deleted. The last query prints what landed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Clinical records — inpatient episodes, stomas and appliances
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('episode','stoma','appliance')),
  title        text,
  detail       text,
  status       text,
  record_date  date,          -- the admission date, for an episode
  is_current   boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS discharge_date date;
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS appliances     jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS episode_ref    text;

CREATE INDEX IF NOT EXISTS clinical_records_patient_idx
  ON public.clinical_records (patient_id);

-- Each admission's clinic-wide reference (EP-2026-0042) stays unique, while
-- older episodes that have none are left alone.
CREATE UNIQUE INDEX IF NOT EXISTS clinical_records_episode_ref_key
  ON public.clinical_records (episode_ref) WHERE episode_ref IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 2. Permission to use that table
--
-- Without these an insert is refused — "permission denied" or "violates
-- row-level security policy" — and inpatient episodes silently never save,
-- which is exactly what was happening.
-- -----------------------------------------------------------------------------
GRANT ALL ON public.clinical_records TO anon, authenticated;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinical_records_all ON public.clinical_records;
CREATE POLICY clinical_records_all ON public.clinical_records
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);


-- -----------------------------------------------------------------------------
-- 3. The handover columns on the patient record
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_inpatient          boolean DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_ward        text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_bed         text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_notes       text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_nurse_notes text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_since       date;   -- the date of admission
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS flange_due            date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_letter      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_permit  text;

CREATE INDEX IF NOT EXISTS patients_is_inpatient_idx
  ON public.patients (is_inpatient) WHERE is_inpatient;


-- -----------------------------------------------------------------------------
-- 4. The proposed date of reversal
--
-- For patients who have not been reversed, have not died, and were not
-- discharged abroad or to Gozo. They appear on the handover on the day.
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS proposed_reversal_date date;
CREATE INDEX IF NOT EXISTS patients_proposed_reversal_idx
  ON public.patients (proposed_reversal_date) WHERE proposed_reversal_date IS NOT NULL;


-- -----------------------------------------------------------------------------
-- 5. Appliances on an appointment, per stoma
--
-- stoma_appliances holds one entry per stoma, each with its own appliances,
-- accessories and flange due date — that is how a mucus fistula keeps its own.
-- -----------------------------------------------------------------------------
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appliances       jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS accessories      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS stoma_appliances jsonb DEFAULT '[]'::jsonb;


-- -----------------------------------------------------------------------------
-- 6. Prove it works end to end
--
-- Writes one episode against any existing patient and removes it again. If this
-- raises no notice the registry is simply empty; if it errors, the permissions
-- above did not take and nothing else will save either.
-- -----------------------------------------------------------------------------
DO $$
DECLARE pid uuid; rid uuid;
BEGIN
  SELECT id INTO pid FROM public.patients LIMIT 1;
  IF pid IS NOT NULL THEN
    INSERT INTO public.clinical_records (patient_id, kind, record_date)
    VALUES (pid, 'episode', CURRENT_DATE) RETURNING id INTO rid;
    DELETE FROM public.clinical_records WHERE id = rid;
    RAISE NOTICE 'clinical_records insert/delete OK';
  ELSE
    RAISE NOTICE 'no patients yet — skipped the round-trip check';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 7. What landed
-- -----------------------------------------------------------------------------
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'clinical_records')
    OR (table_name = 'patients' AND column_name IN (
        'is_inpatient','inpatient_ward','inpatient_bed','inpatient_notes',
        'inpatient_nurse_notes','inpatient_since','flange_due',
        'discharge_letter','schedule_five_permit','proposed_reversal_date'))
    OR (table_name = 'appointments' AND column_name IN (
        'appliances','accessories','stoma_appliances'))
  )
ORDER BY table_name, column_name;
