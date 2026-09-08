-- =============================================================================
-- Handover snapshots — a picture of the handover kept once a day
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: it creates the table only if it is not already there.
--
-- WHAT IT IS
--   At 4pm the app takes a screenshot of the handover sheet and saves it here,
--   one row per day. The Archived Handover tab (under Handover) lists them,
--   newest first, with a date search, and opens any day's picture in a new
--   browser tab. A nurse can also press "Capture now" to save one on the spot,
--   which replaces that day's. The archive is read only for reference: a saved
--   day can be opened or downloaded, never changed or deleted.
--
--   The picture is a PNG stored inline as a data URL, so nothing else needs
--   setting up — no storage bucket, no extra keys. One row a day keeps it small.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.handover_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date NOT NULL UNIQUE,        -- one snapshot per day
  captured_at     timestamptz NOT NULL DEFAULT now(),
  image_data      text NOT NULL,               -- the PNG as a data: URL
  inpatient_count int,                          -- how many were on the sheet
  created_by      text,                         -- who/what took it
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Newest first is how the tab reads them.
CREATE INDEX IF NOT EXISTS handover_snapshots_date_idx
  ON public.handover_snapshots (snapshot_date DESC);
