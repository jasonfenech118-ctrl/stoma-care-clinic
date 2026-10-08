-- =============================================================================
-- Audit trail — a running log of changes to patient records
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: nothing here deletes a row, and every object is guarded.
--
-- Every create, edit and delete of a PATIENT record or a ROSTER entry (duty,
-- overtime, TIL, leave, change of duty) is written here as its own line: when,
-- who (the signed-in nurse), the record, and what changed. The Audit Trail tab
-- (Audit & Reports) reads it newest-first, and can permanently delete lines to
-- free space at three sizes: a single entry, a whole month, or a whole year.
-- The app can SELECT, INSERT and DELETE — never UPDATE — so a logged line can
-- never be quietly rewritten, only added or (one entry / month / year) deleted.
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
GRANT SELECT, INSERT, DELETE ON public.audit_log TO authenticated;   -- no UPDATE: lines are never rewritten, only added or cleared

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_read ON public.audit_log;
CREATE POLICY audit_log_read ON public.audit_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS audit_log_add ON public.audit_log;
CREATE POLICY audit_log_add ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- Deleting entries from the Audit Trail tab to free space (one entry, a month
-- or a whole year — all the same DELETE permission).
DROP POLICY IF EXISTS audit_log_clear ON public.audit_log;
CREATE POLICY audit_log_clear ON public.audit_log
  FOR DELETE TO authenticated USING (true);

-- Confirm it is there.
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'audit_log'
 ORDER BY ordinal_position;
