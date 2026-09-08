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
  ('Necrosis / ischaemia'),
  ('Mucocutaneous separation'),
  ('Peristomal skin excoriation / dermatitis'),
  ('Leakage'),
  ('High output'),
  ('Bleeding'),
  ('Granuloma'),
  ('Stomal fistula'),
  ('Obstruction / blockage')
ON CONFLICT (name) DO NOTHING;
