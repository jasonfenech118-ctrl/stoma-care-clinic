-- =============================================================================
-- Weekly stores ordering (Ordering tab)
-- =============================================================================
--
-- One row per weekly order, keyed by the week-ending Saturday. Holds the two
-- order forms the clinic sends to the disposables stores every Saturday:
--   • Part 1 — M.M.M.U. IRO top-up list (disposables)
--   • Part 2 — Cleaning consumables order list
-- entered quantities live in the part1 / part2 JSON arrays (aligned to the fixed
-- item lists in assets/ordering.js), with the header details in `header`.
-- `status` is 'draft' until the order is emailed, then 'sent' — which stops the
-- Saturday reminder until the next week.
--
-- Until this runs, the Ordering tab still works but saves only to the current
-- browser (and the shared "already sent" state is not shared between devices).
--
-- Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clinic_orders (
  week_ending  date PRIMARY KEY,                 -- the Saturday this order is for
  header       jsonb,                            -- date, officer, ext, remarks, etc.
  part1        jsonb,                            -- disposables quantities (by item index)
  part2        jsonb,                            -- cleaning quantities (by item index)
  status       text NOT NULL DEFAULT 'draft',    -- 'draft' | 'sent'
  sent_at      timestamptz,
  sent_by      text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Reached the same way as the rest of the registry (anon key + a signed-in
-- session).
GRANT ALL ON public.clinic_orders TO anon, authenticated;
ALTER TABLE public.clinic_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_orders_all ON public.clinic_orders;
CREATE POLICY clinic_orders_all ON public.clinic_orders
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT 'clinic_orders' AS table, count(*) FROM public.clinic_orders;
