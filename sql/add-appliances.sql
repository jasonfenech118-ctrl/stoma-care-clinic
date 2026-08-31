-- =============================================================================
-- Appliances and accessories on an appointment
-- =============================================================================
--
-- What was used at a visit, recorded with the visit.
--
--   stoma_appliances - the detail, one entry per stoma
--   appliances       - the whole visit's appliances, flattened
--   accessories      - the whole visit's accessories, flattened
--
-- A patient can have more than one stoma at the same time, and a refashioned
-- stoma is a NEW stoma with its own id, so the detail is held against the
-- stoma rather than the patient:
--
--   [{"uid":"s1a2b","code":"S2","label":"S2 · Loop Ileostomy · formed 12 Mar 2025",
--     "appliances":["Stomahesive Flange 57mm","Drainable Bag 57mm"],
--     "accessories":["Filler Paste"]}]
--
-- The two flat columns hold the same names again for the visit as a whole, so
-- counting across the register stays a single read with no digging into the
-- per-stoma detail.
--
-- All three are optional and default to an empty list: a visit with nothing
-- recorded simply has none. Safe to re-run; nothing is deleted.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- =============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS appliances       jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS accessories      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS stoma_appliances jsonb DEFAULT '[]'::jsonb;


-- -----------------------------------------------------------------------------
-- Confirm all three landed.
-- -----------------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'appointments'
  AND column_name IN ('appliances','accessories','stoma_appliances')
ORDER BY column_name;


-- -----------------------------------------------------------------------------
-- Handy afterwards. Uncomment whichever you need.
-- -----------------------------------------------------------------------------

-- How often each appliance was used, most used first.
-- SELECT item AS appliance, count(*) AS visits
--   FROM public.appointments a, jsonb_array_elements_text(a.appliances) item
--  WHERE a.status = 'attended'
--  GROUP BY 1 ORDER BY 2 DESC;

-- The same for accessories, ignoring the "None" answer.
-- SELECT item AS accessory, count(*) AS visits
--   FROM public.appointments a, jsonb_array_elements_text(a.accessories) item
--  WHERE a.status = 'attended' AND item <> 'None'
--  GROUP BY 1 ORDER BY 2 DESC;

-- Every visit stoma by stoma — one row per stoma per visit.
-- SELECT a.appt_date,
--        p.first_name, p.surname,
--        s->>'code'  AS stoma,
--        s->>'label' AS stoma_detail,
--        s->'appliances'  AS appliances,
--        s->'accessories' AS accessories
--   FROM public.appointments a
--   JOIN public.patients p ON p.id = a.patient_id
--   CROSS JOIN LATERAL jsonb_array_elements(a.stoma_appliances) s
--  WHERE a.status = 'attended'
--  ORDER BY a.appt_date DESC, s->>'code';

-- Visits marked as Seen that have nothing recorded — should be none from the
-- day the per-stoma cards went in, and shows the backlog from before it.
-- SELECT a.appt_date, p.first_name, p.surname
--   FROM public.appointments a
--   JOIN public.patients p ON p.id = a.patient_id
--  WHERE a.status = 'attended'
--    AND COALESCE(jsonb_array_length(a.stoma_appliances), 0) = 0
--    AND COALESCE(jsonb_array_length(a.appliances), 0) = 0
--  ORDER BY a.appt_date DESC;
