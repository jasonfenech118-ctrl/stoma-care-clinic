-- =============================================================================
-- Shared pending-task list in the reminder bell
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run. Nothing in this script deletes a saved task.
--
-- Unfinished tasks remain visible every day. When a nurse ticks a task, the app
-- crosses it out for the rest of that calendar day and stops showing it on the
-- following day. The completed row remains in this table as an audit record.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.clinic_pending_tasks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_text          text NOT NULL CHECK (
    length(btrim(task_text)) BETWEEN 1 AND 240
  ),
  is_completed       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by_email   text,
  created_by_name    text,
  completed_on       date,
  completed_at       timestamptz,
  completed_by_email text,
  completed_by_name  text
);

CREATE INDEX IF NOT EXISTS clinic_pending_tasks_visible_idx
  ON public.clinic_pending_tasks (is_completed, completed_on, created_at);

-- This is a shared list for signed-in clinic users. Deliberately do not grant
-- DELETE: completed rows are retained instead of being erased.
REVOKE ALL ON public.clinic_pending_tasks FROM anon;
REVOKE ALL ON public.clinic_pending_tasks FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.clinic_pending_tasks TO authenticated;

ALTER TABLE public.clinic_pending_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_pending_tasks_read ON public.clinic_pending_tasks;
CREATE POLICY clinic_pending_tasks_read
  ON public.clinic_pending_tasks
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS clinic_pending_tasks_add ON public.clinic_pending_tasks;
CREATE POLICY clinic_pending_tasks_add
  ON public.clinic_pending_tasks
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS clinic_pending_tasks_update ON public.clinic_pending_tasks;
CREATE POLICY clinic_pending_tasks_update
  ON public.clinic_pending_tasks
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.clinic_pending_tasks IS
  'Shared clinic reminder-bell tasks; completed rows are retained and hidden after their completion day.';

NOTIFY pgrst, 'reload schema';

-- Confirmation: returns the table name and the number of saved tasks.
SELECT 'clinic_pending_tasks' AS table_name, count(*) AS saved_tasks
FROM public.clinic_pending_tasks;
