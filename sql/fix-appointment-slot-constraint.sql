-- =============================================================================
-- FIX: "Booking blocked by a database slot rule"  (HTTP 409 on POST /appointments)
-- =============================================================================
--
-- SYMPTOM
--   Booking a patient fails with a 409 and the app shows "Booking blocked by a
--   database slot rule". It happens in two situations:
--     1. The slot already holds a CANCELLED appointment. The cancelled row is
--        kept as history, but the old constraint still counts it, so the slot
--        can never be reused.
--     2. Two nurses each have a patient at the same time on the same day. The
--        clinic runs one column per nurse, so that is normal — but a constraint
--        on (appt_date, appt_slot) alone treats it as a duplicate.
--
-- WHAT THIS DOES
--   Replaces any unique rule covering appt_date + appt_slot with a partial
--   unique index that:
--     - allows the same time in DIFFERENT nurse columns on the same day
--     - ignores cancelled rows, so a freed slot can be rebooked
--     - still blocks genuine double-booking of the same column at the same time
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Run the steps in order. Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — Look at what is constraining the table right now. (Read-only.)
--          Run this first and keep the output, so there is a record of what
--          existed before anything is dropped.
-- -----------------------------------------------------------------------------
SELECT c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.appointments'::regclass
  AND c.contype IN ('u', 'p')
ORDER BY c.conname;

SELECT i.relname AS index_name,
       pg_get_indexdef(i.oid) AS definition
FROM pg_class i
JOIN pg_index x ON x.indexrelid = i.oid
WHERE x.indrelid = 'public.appointments'::regclass
  AND x.indisunique
ORDER BY i.relname;


-- -----------------------------------------------------------------------------
-- STEP 2 — Check for existing clashes that would stop the new rule being
--          created. This should return NO ROWS.
--
--          If it returns rows, those are real double-bookings: the same nurse
--          column holding two active patients at the same time. Step 4 cannot
--          run until they are resolved — it will fail with
--          "ERROR: 23505 ... is duplicated". Work through 2a to 2c below.
-- -----------------------------------------------------------------------------
SELECT appt_date,
       appt_slot,
       COALESCE(assigned_to::text, bank_staff_id::text, 'common') AS column_key,
       COUNT(*) AS active_rows
FROM public.appointments
WHERE status IS DISTINCT FROM 'cancelled'
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY 1, 2;


-- -----------------------------------------------------------------------------
-- STEP 2a — See who the clashing appointments actually are, before changing
--           anything. Read-only.
--
--           Read the "same_patient" column: TRUE means the row is a duplicate
--           entry for one patient, FALSE means two different patients are
--           genuinely booked into the same nurse column at the same time.
-- -----------------------------------------------------------------------------
WITH clashes AS (
  SELECT appt_date,
         appt_slot,
         COALESCE(assigned_to::text, bank_staff_id::text, 'common') AS column_key
  FROM public.appointments
  WHERE status IS DISTINCT FROM 'cancelled'
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
)
SELECT a.appt_date,
       a.appt_slot,
       COALESCE(s.full_name, bs.full_name, 'Common')                AS nurse_column,
       COALESCE(p.first_name || ' ' || p.surname, '(no patient)')   AS patient,
       p.id_card,
       a.status,
       COUNT(*) OVER (PARTITION BY a.appt_date, a.appt_slot, c.column_key, a.patient_id) > 1
                                                                    AS same_patient,
       a.id AS appointment_id
FROM public.appointments a
JOIN clashes c
  ON c.appt_date = a.appt_date
 AND c.appt_slot = a.appt_slot
 AND c.column_key = COALESCE(a.assigned_to::text, a.bank_staff_id::text, 'common')
LEFT JOIN public.patients   p  ON p.id  = a.patient_id
LEFT JOIN public.staff      s  ON s.id  = a.assigned_to
LEFT JOIN public.bank_staff bs ON bs.id = a.bank_staff_id
WHERE a.status IS DISTINCT FROM 'cancelled'
ORDER BY a.appt_date, a.appt_slot, nurse_column, patient;


-- -----------------------------------------------------------------------------
-- STEP 2b — Remove exact duplicate entries: the SAME patient recorded twice in
--           the same column at the same time. Only these rows are deleted, and
--           the most meaningful one is kept (an attended record beats a DNTU,
--           which beats a plain booking).
--
--           Nothing is lost clinically here — the surviving row is the visit.
-- -----------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY appt_date,
                        appt_slot,
                        COALESCE(assigned_to::text, bank_staff_id::text, 'common'),
                        patient_id
           ORDER BY CASE status
                      WHEN 'attended'       THEN 0
                      WHEN 'did_not_attend' THEN 1
                      ELSE 2
                    END,
                    id
         ) AS rn
  FROM public.appointments
  WHERE status IS DISTINCT FROM 'cancelled'
    AND patient_id IS NOT NULL
)
DELETE FROM public.appointments a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;


-- -----------------------------------------------------------------------------
-- STEP 2c — Anything still clashing is two DIFFERENT patients in one column at
--           one time. One of them has to move.
--
--           This marks the extra ones cancelled rather than deleting them, so
--           they stay in the app as cancelled history on that slot, with their
--           Edit and Rebook buttons — the displaced patient can be rebooked
--           properly. The kept row is again the most meaningful one.
--
--           Re-run STEP 2 afterwards: it should return no rows.
-- -----------------------------------------------------------------------------
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY appt_date,
                        appt_slot,
                        COALESCE(assigned_to::text, bank_staff_id::text, 'common')
           ORDER BY CASE status
                      WHEN 'attended'       THEN 0
                      WHEN 'did_not_attend' THEN 1
                      ELSE 2
                    END,
                    id
         ) AS rn
  FROM public.appointments
  WHERE status IS DISTINCT FROM 'cancelled'
)
UPDATE public.appointments a
SET status = 'cancelled'
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;


-- -----------------------------------------------------------------------------
-- STEP 3 — Drop every old unique rule that covers appt_date + appt_slot.
--          The primary key is left alone. Each drop is reported in the output.
-- -----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  -- Unique CONSTRAINTS (dropping one also drops the index behind it).
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.appointments'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%appt_date%'
      AND pg_get_constraintdef(c.oid) ILIKE '%appt_slot%'
  LOOP
    EXECUTE format('ALTER TABLE public.appointments DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Dropped constraint: %', r.conname;
  END LOOP;

  -- Stand-alone unique INDEXES that are not backing a constraint.
  FOR r IN
    SELECT i.relname
    FROM pg_class i
    JOIN pg_index x ON x.indexrelid = i.oid
    WHERE x.indrelid = 'public.appointments'::regclass
      AND x.indisunique
      AND NOT x.indisprimary
      AND i.relname <> 'appointments_active_slot_uniq'
      AND pg_get_indexdef(i.oid) ILIKE '%appt_date%'
      AND pg_get_indexdef(i.oid) ILIKE '%appt_slot%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.relname);
    RAISE NOTICE 'Dropped index: %', r.relname;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- STEP 4 — Create the correct rule.
--
--          One active appointment per nurse column, per slot, per day.
--          COALESCE gives each column its own identity: the assigned core
--          nurse, or the bank/OT nurse, or 'common' for the shared column.
--          Cancelled rows are excluded, so they stay as history without ever
--          blocking a rebooking.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot_uniq
ON public.appointments (
  appt_date,
  appt_slot,
  (COALESCE(assigned_to::text, bank_staff_id::text, 'common'))
)
WHERE status IS DISTINCT FROM 'cancelled';


-- -----------------------------------------------------------------------------
-- STEP 5 — Optional. Only run this if booking fails with a DATE constraint
--          error ("violates check constraint ... appt_date ...").
--
--          Some installs have an old check that refuses appointment dates
--          outside a fixed window, which blocks planning into future years.
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_appt_date_check;


-- -----------------------------------------------------------------------------
-- STEP 6 — Confirm the result. Expect to see appointments_active_slot_uniq
--          with a WHERE clause excluding cancelled rows.
-- -----------------------------------------------------------------------------
SELECT i.relname AS index_name,
       pg_get_indexdef(i.oid) AS definition
FROM pg_class i
JOIN pg_index x ON x.indexrelid = i.oid
WHERE x.indrelid = 'public.appointments'::regclass
  AND x.indisunique
ORDER BY i.relname;
