-- =============================================================================
-- Firms (consultant / surgical team)
-- =============================================================================
--
-- Adds one table that holds the Firm list shown in the patient Firm dropdown,
-- so firms can be added, renamed or removed from inside the app
-- (Add Patient -> Manage firms) instead of being fixed in the code.
--
-- It starts empty — add your own firms in the app. Editing the list here or in
-- the app does not change any patient already saved with a firm: their stored
-- value is kept and still shows.
--
-- This is separate from the patients.consultant column, which holds the firm
-- chosen for each patient — add that with sql/add-consultant.sql if you have
-- not already.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: it guards itself and nothing is deleted.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.firms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per name (case-insensitive), so the same firm can't be added twice.
CREATE UNIQUE INDEX IF NOT EXISTS firms_name_uniq
  ON public.firms (lower(name));

-- Let the app read and manage the list, the same way the rest of the registry
-- is reached (anon key + a signed-in session).
GRANT ALL ON public.firms TO anon, authenticated;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS firms_all ON public.firms;
CREATE POLICY firms_all ON public.firms
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- Confirm it landed.
SELECT count(*) AS firms FROM public.firms;
