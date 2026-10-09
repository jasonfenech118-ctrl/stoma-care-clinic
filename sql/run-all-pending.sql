-- =============================================================================
-- MDH Stoma Care Clinic — run-all-pending
-- =============================================================================
-- Everything the app needs that may not be on your database yet, in ONE script.
--
-- HOW TO RUN (once):
--   Supabase -> SQL Editor -> New query (empty) -> paste ALL of this -> Run.
--
-- Safe to run even if some parts were already applied: every change is guarded
-- (IF NOT EXISTS / IF NOT EXISTS constraint / DROP POLICY ... then CREATE), so
-- re-running does nothing the second time. Nothing here deletes patient data.
--
-- It covers five features:
--   1. Audit trail            (audit_log table)
--   2. Fistulas & bagging      (patients: patient_kind + fistula_* columns)
--   3. Patient signature       (patients: created_by/at, updated_by/at)
--   4. Siting cancellation     (siting_sessions: cancellation_* columns)
--   5. Handover saved as data  (handover_snapshots: html_data column)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. AUDIT TRAIL — a running log of changes to patient / roster records
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at           timestamptz NOT NULL DEFAULT now(),
  actor        text,              -- the signed-in nurse's display name
  actor_email  text,
  action       text NOT NULL,     -- 'create' | 'update' | 'delete'
  entity       text NOT NULL DEFAULT 'patient',
  entity_id    text,
  patient_id   text,
  patient_name text,
  summary      text,              -- a human line, e.g. "Edited Phone, Locality"
  details      jsonb              -- the changed fields and their new values
);

CREATE INDEX IF NOT EXISTS audit_log_at_idx      ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_patient_idx ON public.audit_log (patient_id);

REVOKE ALL ON public.audit_log FROM anon;
REVOKE ALL ON public.audit_log FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.audit_log TO authenticated;   -- no UPDATE: lines are never rewritten, only added or cleared

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_read ON public.audit_log;
CREATE POLICY audit_log_read ON public.audit_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS audit_log_add ON public.audit_log;
CREATE POLICY audit_log_add ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS audit_log_clear ON public.audit_log;
CREATE POLICY audit_log_clear ON public.audit_log
  FOR DELETE TO authenticated USING (true);


-- -----------------------------------------------------------------------------
-- 2. FISTULAS & BAGGING ADVICE — patients with no stoma, kept off stoma lists
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS patient_kind text NOT NULL DEFAULT 'stoma';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS fistula_category text;        -- 'fistula' | 'bagging'
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


-- -----------------------------------------------------------------------------
-- 3. PATIENT SIGNATURE — who entered the record and who last edited it
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS updated_at timestamptz;


-- -----------------------------------------------------------------------------
-- 4. SITING CANCELLATION — why a siting session was cancelled
-- -----------------------------------------------------------------------------
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancellation_reason text;   -- 'patient' | 'hospital'
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancellation_note   text;
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancelled_by        text;
ALTER TABLE public.siting_sessions ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz;


-- -----------------------------------------------------------------------------
-- 5. HANDOVER SAVED AS DATA — store the sheet as small HTML, not a PNG
-- -----------------------------------------------------------------------------
ALTER TABLE public.handover_snapshots ADD COLUMN IF NOT EXISTS html_data text;
ALTER TABLE public.handover_snapshots ALTER COLUMN image_data DROP NOT NULL;

-- Optional space reclaim — run LATER, only once you are happy the HTML archive
-- works. Clears the old PNG pictures (keeps each row and its date) and frees the
-- space. Uncomment both lines to use.
--   UPDATE public.handover_snapshots SET image_data = NULL WHERE image_data IS NOT NULL;
--   VACUUM FULL public.handover_snapshots;


-- -----------------------------------------------------------------------------
-- CONFIRM — one combined check that every piece landed.
-- -----------------------------------------------------------------------------
SELECT 'audit_log table'            AS piece, to_regclass('public.audit_log') IS NOT NULL AS ok
UNION ALL
SELECT 'patients.patient_kind',           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'          AND column_name='patient_kind')
UNION ALL
SELECT 'patients.fistula_category',       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'          AND column_name='fistula_category')
UNION ALL
SELECT 'patients.created_by',             EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'          AND column_name='created_by')
UNION ALL
SELECT 'patients.updated_by',             EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='patients'          AND column_name='updated_by')
UNION ALL
SELECT 'siting_sessions.cancellation_reason', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='siting_sessions' AND column_name='cancellation_reason')
UNION ALL
SELECT 'handover_snapshots.html_data',    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='handover_snapshots' AND column_name='html_data')
ORDER BY piece;
