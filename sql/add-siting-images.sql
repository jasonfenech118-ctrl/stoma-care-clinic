-- =============================================================================
-- Pre-operative stoma siting photographs
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: it only creates what is not already there.
--
-- WHAT IT IS
--   A clinical photograph of the marked stoma site, kept for a siting session.
--   The picture is stored inline as a data: URL, so nothing else needs setting
--   up — no storage bucket, no extra keys. It lives in its OWN table (one row
--   per siting) so the siting lists and reminders never carry the image bytes;
--   the patient record fetches the picture only when it is opened.
--
--   Deleting a siting session removes its photo automatically (ON DELETE
--   CASCADE). Only the marked-site photograph belongs here — no patient
--   identifiers are stored with it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.siting_images (
  siting_id   uuid PRIMARY KEY REFERENCES public.siting_sessions(id) ON DELETE CASCADE,
  image_data  text NOT NULL,               -- the photo as a data: URL
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Let the app read and manage the photos the same way as the rest of the
-- registry (anon key + a signed-in session). WITHOUT this block a write comes
-- back 403. Safe to re-run even when the table already exists.
GRANT ALL ON public.siting_images TO anon, authenticated;
ALTER TABLE public.siting_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS siting_images_all ON public.siting_images;
CREATE POLICY siting_images_all ON public.siting_images
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT count(*) AS siting_images FROM public.siting_images;
