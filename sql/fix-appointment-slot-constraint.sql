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
--          If it does return rows, those are real double-bookings: the same
--          nurse column holding two active patients at the same time. Fix them
--          in the app first (cancel or move one), then continue.
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
