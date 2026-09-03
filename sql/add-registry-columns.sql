-- =============================================================================
-- Registry columns and follow-up statuses
-- =============================================================================
--
-- Run this ONE file. It replaces sql/add-patient-clinical-dates.sql, which is
-- kept only so older notes still make sense — everything in it is repeated
-- here, so running this alone is enough.
--
-- WHAT IT ADDS
--   date_of_birth  - the patient's date of birth
--   surgery_date   - date of the stoma surgery
--   discharge_date - date the patient was discharged after the operation
--   reversal_date  - date the stoma was reversed
--   deceased_date  - date of death (RIP)
--   stoma_type     - free text, e.g. "End Colostomy", "Urostomy", "Ileostomy"
--   sex            - free text, normalised to Male / Female on import
--   procedure_performed - the operation, e.g. "Hartmann's", "Radical cystectomy"
--   findings       - what was found / the indication, e.g. "CA - Rectum"
--   locality       - the patient's town or village
--
-- There is no "outcome" column on purpose: the Clinical Record works it out
-- from the status and the matching date, so it can never disagree with them.
--
-- AND IT ALLOWS TWO NEW FOLLOW-UP STATUSES
--   relocated_overseas - the patient has left Malta
--   discharged_gozo    - the patient is followed up in Gozo
--   Both mean the same thing to the recall lists as 'paused': on file, out of
--   recall, and able to come back. They are separate so the register can say
--   which it is, and so the Registry can colour the row.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: every step guards itself. Nothing is deleted.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — The optional patient columns. All nullable: a patient may have none,
--          some, or all of them.
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS surgery_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS discharge_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS reversal_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS deceased_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS stoma_type    text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS stoma_location text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS initial_stomas jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sex           text;
-- "procedure" is a keyword in some tools, so the column spells itself out.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS procedure_performed text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS findings      text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS locality      text;
-- Stoma refashioning: old stoma closed and a new one formed.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_closure_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_formed_date  date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_findings     text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_location   text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS refashion_discharge_date date;
-- Multiple stoma refashionings, stored as a JSON array.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_refashionings jsonb DEFAULT '[]'::jsonb;
-- Other statuses a patient also carries, beyond followup_status — e.g.
-- discharged to Gozo and later deceased. Stored as a JSON array.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_statuses jsonb DEFAULT '[]'::jsonb;
-- New stoma formation: an additional stoma formed, the previous one still present.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_formed_date date;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_findings    text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_location    text;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS newstoma_closure_date date;
-- Multiple new stoma formations, stored as a JSON array.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS extra_stomas jsonb DEFAULT '[]'::jsonb;


-- -----------------------------------------------------------------------------
-- STEP 2 — Let followup_status hold the two new values.
--
--          Some installs have a CHECK constraint listing the allowed statuses.
--          If one exists it is replaced with the full list; if there is none,
--          nothing happens and the column already accepts them.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.patients'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%followup_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.patients DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Dropped old status constraint: %', r.conname;
  END LOOP;

  ALTER TABLE public.patients
    ADD CONSTRAINT patients_followup_status_check
    CHECK (followup_status IN (
      'active',
      'awaiting_feedback',
      'paused',
      'relocated_overseas',
      'discharged_gozo',
      'reversed',
      'deceased'
    ));
  RAISE NOTICE 'Status constraint now allows relocated_overseas and discharged_gozo.';
EXCEPTION
  WHEN check_violation THEN
    -- Existing rows hold a status outside the list. Leave the column free
    -- rather than failing the whole migration, and report it.
    RAISE NOTICE 'Some rows hold a status outside the list, so no constraint was added. Run STEP 3 to see which.';
END $$;


-- -----------------------------------------------------------------------------
-- STEP 3 — Read-only. What statuses are actually in the table right now.
--          Anything not in the list above will show as 'Active' in the app.
-- -----------------------------------------------------------------------------
SELECT COALESCE(followup_status, '(null)') AS followup_status,
       COUNT(*) AS patients
FROM public.patients
GROUP BY 1
ORDER BY 2 DESC;


-- -----------------------------------------------------------------------------
-- STEP 4 — Optional. Only run this if your registry already stores these two
--          as free text and you want them moved onto the new statuses.
--          Check STEP 3 first to see whether any rows look like this.
-- -----------------------------------------------------------------------------
-- UPDATE public.patients
--    SET followup_status = 'relocated_overseas'
--  WHERE lower(trim(followup_status)) IN ('relocated overseas', 'relocated', 'overseas', 'abroad');
--
-- UPDATE public.patients
--    SET followup_status = 'discharged_gozo'
--  WHERE lower(trim(followup_status)) IN ('discharged to gozo', 'discharged gozo', 'gozo');


-- -----------------------------------------------------------------------------
-- STEP 5 — Confirm the columns landed.
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'patients'
  AND column_name IN ('date_of_birth','surgery_date','discharge_date','reversal_date','deceased_date',
                      'stoma_type','sex','procedure_performed','findings','locality')
ORDER BY column_name;

-- -----------------------------------------------------------------------------
-- Proposed date for reversal surgery. Only offered to patients who have not had
-- their stoma reversed, have not died, and have not been discharged abroad or to
-- Gozo. On that date the patient shows on the handover sheet and raises a
-- reminder. Added later; safe to re-run.
-- -----------------------------------------------------------------------------
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS proposed_reversal_date date;
CREATE INDEX IF NOT EXISTS patients_proposed_reversal_idx
  ON public.patients (proposed_reversal_date) WHERE proposed_reversal_date IS NOT NULL;
