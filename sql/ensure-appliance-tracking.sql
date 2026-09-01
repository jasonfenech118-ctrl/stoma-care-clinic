-- =============================================================================
-- Ensure everything the ward appliance tracking needs is in place
-- =============================================================================
--
-- The newest handover features — Set appliance from the ward, the flange due
-- date, the stoma shorthand, and "Inpatient · SW4" on the stoma history —
-- store their extra detail (ward, bed, flange_due, changed_on, changed_by)
-- as keys INSIDE the existing clinical_records.appliances jsonb. That means
-- there is NO new column to add for them.
--
-- This script adds nothing new; it only makes sure the columns those features
-- read and write already exist, so a database set up before they went in is
-- brought up to date in one run. Everything here is IF NOT EXISTS and nothing
-- is ever deleted, so it is safe to run as many times as you like.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

-- 1. The handover list itself: the inpatient columns on the patient.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_inpatient        boolean DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_ward       text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_bed        text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_notes      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_since      date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_letter     text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_permit text;

-- 2. The admission record the ward appliances are filed against.
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('episode','stoma','appliance')),
  title        text,
  detail       text,
  status       text,
  record_date  date,
  is_current   boolean NOT NULL DEFAULT true,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The admission's discharge date, and the appliances used on it. The ward,
-- bed, flange_due, changed_on and changed_by all live inside this jsonb — one
-- entry per stoma per change — so no column is needed for them.
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS discharge_date date;
ALTER TABLE public.clinical_records ADD COLUMN IF NOT EXISTS appliances     jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS clinical_records_patient_idx
  ON public.clinical_records (patient_id);

-- 3. Appliances recorded against a seen appointment (the follow-up side).
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appliances       jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS accessories      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS stoma_appliances jsonb DEFAULT '[]'::jsonb;

-- -----------------------------------------------------------------------------
-- Confirm the key columns are all present.
-- -----------------------------------------------------------------------------
SELECT 'patients'          AS table, column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='patients'
    AND column_name IN ('is_inpatient','inpatient_ward','inpatient_bed','inpatient_notes',
                        'discharge_letter','schedule_five_permit')
UNION ALL
SELECT 'clinical_records', column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='clinical_records'
    AND column_name IN ('kind','record_date','is_current','discharge_date','appliances')
UNION ALL
SELECT 'appointments',     column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='appointments'
    AND column_name IN ('appliances','accessories','stoma_appliances')
ORDER BY 1, 2;

-- -----------------------------------------------------------------------------
-- Handy afterwards: every ward appliance change, newest first, with the ward
-- it was made on. Uncomment to run.
-- -----------------------------------------------------------------------------
-- SELECT p.surname, p.first_name,
--        e->>'stoma_short' AS stoma,
--        e->>'ward'        AS ward,
--        e->>'changed_on'  AS changed_on,
--        e->'appliances'   AS appliances,
--        e->>'flange_due'  AS flange_due
--   FROM public.clinical_records r
--   JOIN public.patients p ON p.id = r.patient_id
--   CROSS JOIN LATERAL jsonb_array_elements(r.appliances) e
--  WHERE r.kind = 'episode'
--  ORDER BY (e->>'changed_on') DESC NULLS LAST;
