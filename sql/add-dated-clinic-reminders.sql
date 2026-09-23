-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Dated reminders remain visible until completed; completed rows remain in
-- the database and appear crossed out on the day they are completed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.clinic_dated_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_text text NOT NULL CHECK (length(btrim(reminder_text)) BETWEEN 1 AND 240),
  reminder_date date NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  created_by_name text,
  completed_on date,
  completed_at timestamptz,
  completed_by_email text,
  completed_by_name text
);

CREATE INDEX IF NOT EXISTS clinic_dated_reminders_visible_idx
  ON public.clinic_dated_reminders (is_completed, reminder_date, completed_on);

REVOKE ALL ON public.clinic_dated_reminders FROM anon;
REVOKE ALL ON public.clinic_dated_reminders FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.clinic_dated_reminders TO authenticated;
ALTER TABLE public.clinic_dated_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_dated_reminders_read ON public.clinic_dated_reminders;
CREATE POLICY clinic_dated_reminders_read ON public.clinic_dated_reminders
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS clinic_dated_reminders_add ON public.clinic_dated_reminders;
CREATE POLICY clinic_dated_reminders_add ON public.clinic_dated_reminders
  FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS clinic_dated_reminders_update ON public.clinic_dated_reminders;
CREATE POLICY clinic_dated_reminders_update ON public.clinic_dated_reminders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
