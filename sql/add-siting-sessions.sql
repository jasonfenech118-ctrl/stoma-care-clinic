-- =============================================================================
-- Siting sessions and no-stoma operations
-- =============================================================================
--
-- Two tables for the pre-operative siting workflow.
--
-- siting_sessions  — a booked 1-hour siting session for a patient who may not
--   yet be in the registry (they only become a registry patient if a stoma is
--   formed). Holds who it is for, the firm, and the booked date/time; the
--   post-operative fields (surgery performed, surgery date, stoma formed, and
--   the link to the registry patient once converted) are filled in later.
--
-- operations_no_stoma — the record kept when the operation was performed but NO
--   stoma was formed. These are deliberately kept OUT of the patient registry,
--   as their own list.
--
-- Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.siting_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_card           text,
  first_name        text,
  surname           text,
  consultant        text,          -- the firm
  session_date      date,          -- the booked day
  session_slot      text,          -- start time of the 1-hour block, e.g. "09:00"
  status            text NOT NULL DEFAULT 'booked',  -- booked / done / cancelled
  surgery_performed boolean,       -- filled in post-operatively
  surgery_date      date,
  stoma_formed      boolean,
  patient_id        uuid REFERENCES public.patients(id) ON DELETE SET NULL, -- set when a stoma is formed and the patient is created
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS siting_sessions_date_idx ON public.siting_sessions (session_date);

CREATE TABLE IF NOT EXISTS public.operations_no_stoma (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  siting_session_id uuid REFERENCES public.siting_sessions(id) ON DELETE SET NULL,
  id_card           text,
  first_name        text,
  surname           text,
  consultant        text,
  surgery_date      date,
  operation         text,          -- the operation performed
  findings          text,
  notes             text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operations_no_stoma_date_idx ON public.operations_no_stoma (surgery_date);

-- Let the app read and manage both, the same way the rest of the registry is
-- reached (anon key + a signed-in session).
GRANT ALL ON public.siting_sessions      TO anon, authenticated;
GRANT ALL ON public.operations_no_stoma  TO anon, authenticated;
ALTER TABLE public.siting_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_no_stoma ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS siting_sessions_all ON public.siting_sessions;
CREATE POLICY siting_sessions_all ON public.siting_sessions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS operations_no_stoma_all ON public.operations_no_stoma;
CREATE POLICY operations_no_stoma_all ON public.operations_no_stoma
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT 'siting_sessions' AS table, count(*) FROM public.siting_sessions
UNION ALL
SELECT 'operations_no_stoma', count(*) FROM public.operations_no_stoma;
