-- =============================================================================
-- Fistula patients
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards every change.
--
-- A fistula patient has no stoma, but the stoma nurses manage their appliance
-- and they appear on the ward handover. They are kept in the same patients
-- table (so inpatient episodes, appliance history and encounters work for them)
-- and marked here, so the app keeps them out of every stoma list and count:
--
--   patient_kind           - 'stoma' (every existing patient) or 'fistula'
--   fistula_operation_date - date of the operation that led to the fistula
--                            (kept apart from surgery_date, which means "stoma formed")
--   fistula_closed_date    - the day the fistula case was closed; blank = open case
--   fistula_closed_reason  - why it closed (e.g. Healed / resolved)
--
-- Fistula patients have no nurse owner and no due month: they are booked from
-- the clinic when needed (long-term fistulas), so nothing here plans follow-up.
--
-- The operation performed and findings use the existing procedure_performed and
-- findings columns; the consultant uses the existing consultant column.
-- Nothing already on file changes: every existing patient becomes 'stoma'.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_kind text NOT NULL DEFAULT 'stoma';
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

-- Confirm they landed (four rows expected).
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'patients'
   AND column_name IN ('patient_kind','fistula_operation_date','fistula_closed_date','fistula_closed_reason');
