-- =============================================================================
-- Visit review — complications and appliances confirmed at every attended visit
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards every column.
--
-- WHAT IT IS
--   When a visit is completed (marked Seen) the nurse now makes two explicit
--   review decisions, stored on the appointment:
--
--     complication_review  - 'none'  (no complications identified today)
--                            'existing-reviewed' (an existing one was reviewed)
--                            'new-added' (a new complication was added)
--     complication_reviews - the per-complication review states recorded this
--                            visit, as JSON: [{id, type, state, note}] where
--                            state is Ongoing / Improving / Deteriorating /
--                            Resolved. A review never duplicates the running
--                            complications list; it just records this visit's view.
--     appliance_review     - 'unchanged' (regimen kept, reviewed)
--                            'changed'   (appliances/accessories changed)
--                            'first'     (first appliance recorded)
--                            'none'      (no appliance required / recorded)
--
--   Nothing already on file is touched; older appointments simply have none of
--   these set. The app reads them tolerantly — until this runs, completing a
--   visit works exactly as before.
-- =============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS complication_review  text;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS complication_reviews jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appliance_review     text;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'appointments'
  AND column_name IN ('complication_review','complication_reviews','appliance_review')
ORDER BY column_name;
