-- =============================================================================
-- Archived Handover — save the day as data, not a picture
-- =============================================================================
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run.
-- Safe to re-run: IF NOT EXISTS guards the column, and dropping NOT NULL twice
-- is harmless.
--
-- The daily "Archived Handover" used to store a PNG screenshot of the sheet
-- (image_data) — roughly half a megabyte a day. It now stores the sheet as its
-- own small self-contained HTML (html_data) instead — a few KB a day — so the
-- archive barely uses space. This adds the html_data column and lets image_data
-- be empty for the new rows (the old picture rows are untouched and still open).
-- =============================================================================

ALTER TABLE public.handover_snapshots ADD COLUMN IF NOT EXISTS html_data text;
ALTER TABLE public.handover_snapshots ALTER COLUMN image_data DROP NOT NULL;

-- Optional: to reclaim the space the old PNG archive is using, clear the
-- pictures once you are happy the HTML archive is working (keeps the row and its
-- date; only drops the heavy image). Uncomment, then VACUUM to free the space.
--   UPDATE public.handover_snapshots SET image_data = NULL WHERE image_data IS NOT NULL;
--   VACUUM FULL public.handover_snapshots;

-- Confirm the column is there.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'handover_snapshots'
   AND column_name IN ('html_data','image_data')
 ORDER BY column_name;
