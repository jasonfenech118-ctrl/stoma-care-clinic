-- =============================================================================
-- Fistulas & Bagging Advice
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards every change.
--
-- The Fistulas & Bagging Advice registry holds patients with NO stoma whom the
-- stoma nurses still manage an appliance for on the ward handover: either a
-- fistula, or a drain / wound we were asked to assess and advise a bag for
-- (bagging advice, e.g. a percutaneous drain). They are kept in the same
-- patients table (so inpatient episodes, appliance history and encounters work
-- for them) and marked here, so the app keeps them out of every stoma list:
--
--   patient_kind           - 'stoma' (every existing patient) or 'fistula'
--                            ('fistula' covers both a fistula and bagging advice)
--   fistula_category       - 'fistula' or 'bagging' (which kind within the section)
--   fistula_operation_date - date of the operation / procedure
--   fistula_closed_date    - the day the case was closed; blank = open case
--   fistula_closed_reason  - why it closed (e.g. Healed / resolved, Drain removed)
--
-- Operation performed and findings are kept as one thing in the existing
-- procedure_performed column.
--
-- Fistula patients have no nurse owner and no due month: they are booked from
-- the clinic when needed (long-term fistulas), so nothing here plans follow-up.
--
-- The consultant uses the existing consultant column. Nothing already on file
-- changes: every existing patient becomes 'stoma'.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_kind text NOT NULL DEFAULT 'stoma';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS fistula_category text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS fistula_operation_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS fistula_closed_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS fistula_closed_reason text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_patient_kind_check') THEN
    ALTER TABLE public.patients
      ADD CONSTRAINT patients_patient_kind_check CHECK (patient_kind IN ('stoma','fistula'));
  END IF;
END $$;

-- Confirm they landed (five rows expected).
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'patients'
   AND column_name IN ('patient_kind','fistula_category','fistula_operation_date','fistula_closed_date','fistula_closed_reason');
