-- =============================================================================
-- Audit trail — a running log of changes to patient records
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: nothing here deletes a row, and every object is guarded.
--
-- Every create, edit and delete of a PATIENT record is written here as its own
-- line: when, who (the signed-in nurse), the patient, and what changed. The
-- Audit Trail tab (Audit & Reports) reads it newest-first. Rows are immutable:
-- the app is granted INSERT and SELECT only — never UPDATE or DELETE — so the
-- trail cannot be rewritten from the app.
-- =============================================================================

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
GRANT SELECT, INSERT ON public.audit_log TO authenticated;   -- immutable: no UPDATE/DELETE

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_read ON public.audit_log;
CREATE POLICY audit_log_read ON public.audit_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS audit_log_add ON public.audit_log;
CREATE POLICY audit_log_add ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Confirm it is there.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'audit_log'
 ORDER BY ordinal_position;
