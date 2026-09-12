-- =============================================================================
-- Complications — a running list on the patient card
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: it only adds what is not already there.
--
-- WHAT IT IS
--   Each patient keeps a running list of stoma complications. A nurse adds one
--   as they go along — from the handover (for an inpatient) or from the Seen /
--   appointment card — picking from a standard list or typing a new one. Every
--   entry is stamped with the date and where it was added, and the whole list
--   shows under "Complications" on the patient card.
--
--   Two things are set up:
--     1. patients.complications — the per-patient list, stored as JSON.
--     2. complication_types      — the choices offered in the dropdown, seeded
--        with the standard list below and grown whenever a nurse types a new one
--        (exactly like the firms and localities lists).
-- =============================================================================

-- 1. The per-patient running list. JSON, so it needs no extra table.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS complications jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. The dropdown choices, managed in-app like firms / localities.
CREATE TABLE IF NOT EXISTS public.complication_types (
  name       text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed the standard stoma-complications list. ON CONFLICT DO NOTHING means a
-- re-run never disturbs a name a nurse has since added or removed.
INSERT INTO public.complication_types (name) VALUES
  ('Parastomal hernia'),
  ('Prolapse'),
  ('Retraction'),
  ('Stenosis'),
  ('Mucocutaneous separation'),
  ('Peristomal skin excoriation / dermatitis'),
  ('Skin redness'),
  ('High output'),
  ('Bleeding'),
  ('Granuloma')
ON CONFLICT (name) DO NOTHING;

-- Retired complications — removed from the dropdown. Safe to re-run; if a nurse
-- re-adds one of these later, the next run removes it again.
DELETE FROM public.complication_types
WHERE name IN ('Necrosis / ischaemia','Leakage','Stomal fistula','Obstruction / blockage');

-- Let the app read and grow the dropdown the same way the rest of the registry
-- is reached (anon key + a signed-in session). WITHOUT this block a complication
-- a nurse picks or types comes back 403 and will not save. It must run even when
-- the table already exists — all of it is safe to re-run.
GRANT ALL ON public.complication_types TO anon, authenticated;
ALTER TABLE public.complication_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complication_types_all ON public.complication_types;
CREATE POLICY complication_types_all ON public.complication_types
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT count(*) AS complication_types FROM public.complication_types;
