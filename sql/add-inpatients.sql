-- =============================================================================
-- Inpatients / Handover
-- =============================================================================
--
-- Marks a patient as currently an inpatient and holds what the handover sheet
-- needs for them:
--
--   is_inpatient         - on the handover list right now
--   inpatient_ward       - e.g. "SW1-15", "ITU-12", "Burns-1"
--   inpatient_bed        - the bed within the ward, e.g. "Bed 4"
--   inpatient_notes      - the appliance and notes line, as it is written today
--   inpatient_since      - the date they went onto the list
--   discharge_letter     - the care discharge letter: '' or 'done'
--   schedule_five_permit - the Schedule 5 permit: '' , 'in_ward' or 'signed'
--
-- The two document columns are text rather than a tick, because a permit left
-- in the ward waiting for a signature is not the same as a signed one, and the
-- difference is the whole point of tracking it.
--
-- Nothing here is required and nothing is deleted. Discharging a patient sets
-- is_inpatient back to false and keeps the patient exactly as they were.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run.
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_inpatient         boolean DEFAULT false;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_ward       text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_bed        text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_notes      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_since      date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_letter     text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS schedule_five_permit text;

-- The handover list is read by ward, every day, so it gets its own small index.
CREATE INDEX IF NOT EXISTS patients_is_inpatient_idx
  ON public.patients (is_inpatient) WHERE is_inpatient;


-- -----------------------------------------------------------------------------
-- Confirm they landed.
-- -----------------------------------------------------------------------------
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'patients'
  AND column_name IN ('is_inpatient','inpatient_ward','inpatient_bed','inpatient_notes',
                      'inpatient_since','discharge_letter','schedule_five_permit')
ORDER BY column_name;


-- -----------------------------------------------------------------------------
-- Handy afterwards. Uncomment whichever you need.
-- -----------------------------------------------------------------------------

-- Today's handover list, in ward order.
-- SELECT inpatient_ward AS ward, id_card, surname, first_name,
--        inpatient_notes AS appliance_and_notes,
--        COALESCE(NULLIF(discharge_letter,''),'not done')     AS discharge_letter,
--        COALESCE(NULLIF(schedule_five_permit,''),'not done') AS schedule_5_permit,
--        inpatient_since
--   FROM public.patients
--  WHERE is_inpatient
--  ORDER BY inpatient_ward, surname;

-- Permits left in the ward and still not signed — the chasing list.
-- SELECT inpatient_ward AS ward, surname, first_name, inpatient_since
--   FROM public.patients
--  WHERE is_inpatient AND schedule_five_permit = 'in_ward'
--  ORDER BY inpatient_since;

-- Anyone on the list for a long stay.
-- SELECT inpatient_ward AS ward, surname, first_name, inpatient_since,
--        current_date - inpatient_since AS days_on_the_list
--   FROM public.patients
--  WHERE is_inpatient AND inpatient_since IS NOT NULL
--  ORDER BY inpatient_since;

-- -----------------------------------------------------------------------------
-- The nurse's own handover note, kept apart from the appliance line.
-- inpatient_notes holds the appliance (written by the Set appliance wizard and
-- overwritten each time it runs), so a hand-typed note needs its own column or
-- it would be wiped the next time an appliance is set.
-- Added later; safe to re-run.
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS inpatient_nurse_notes text;

-- -----------------------------------------------------------------------------
-- The next date a two-piece flange is due to be changed, editable inline on the
-- handover. A plain date on the patient so it always saves, whatever way the
-- appliance was recorded. Added later; safe to re-run.
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS flange_due date;
