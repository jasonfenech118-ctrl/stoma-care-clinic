-- =============================================================================
-- Appliances and accessories on an appointment
-- =============================================================================
--
-- Adds the two columns behind the "Appliance & accessories" section of the
-- Edit / Seen appointment form:
--   appliances  - the appliances used at that visit
--   accessories - the accessories used at that visit
--
-- Both are JSON arrays of plain names, e.g.
--   ["Drainable Bag 57mm", "Stomahesive Flange 57mm"]
-- so a visit can record as many as were actually used, and the Registry can
-- count them later without any parsing.
--
-- Nothing is required: an appointment with no appliance recorded simply keeps
-- an empty list. Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appliances  jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS accessories jsonb DEFAULT '[]'::jsonb;

-- Confirm they landed.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'appointments'
  AND column_name IN ('appliances','accessories')
ORDER BY column_name;
