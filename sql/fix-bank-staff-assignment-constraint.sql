-- =============================================================================
-- FIX: TIL / OT "duplicate key ... bank_staff_assignment_unique"
-- =============================================================================
--
-- A cancelled bank/OT assignment is deliberately retained for the audit. The
-- old unique constraint still counted that cancelled row, so the same nurse
-- could never be assigned OT or TIL on that date again. This replaces the old
-- rule with one that permits only one ACTIVE assignment per nurse and date.
-- Cancelled history remains untouched and visible in the overtime audit.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste all -> Run.
--   Safe to run again.
-- =============================================================================

ALTER TABLE public.bank_staff_assignments
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE public.bank_staff_assignments
SET status = 'active'
WHERE status IS NULL;

-- Refuse to change the rule if two active rows already exist for one
-- nurse/date. Under the previous constraint this should never fire.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bank_staff_assignments
    WHERE status IS DISTINCT FROM 'cancelled'
    GROUP BY bank_staff_id,work_date
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate active bank-staff assignments exist; resolve them before changing the unique rule.';
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  -- Drop unique constraints covering bank_staff_id + work_date. Dropping a
  -- constraint also drops the index that backs it.
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.bank_staff_assignments'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%bank_staff_id%'
      AND pg_get_constraintdef(c.oid) ILIKE '%work_date%'
  LOOP
    EXECUTE format('ALTER TABLE public.bank_staff_assignments DROP CONSTRAINT %I',r.conname);
    RAISE NOTICE 'Dropped constraint: %',r.conname;
  END LOOP;

  -- Also remove equivalent stand-alone unique indexes, while preserving the
  -- correct active-only index if this script is being run a second time.
  FOR r IN
    SELECT i.relname
    FROM pg_class i
    JOIN pg_index x ON x.indexrelid = i.oid
    WHERE x.indrelid = 'public.bank_staff_assignments'::regclass
      AND x.indisunique
      AND NOT x.indisprimary
      AND i.relname <> 'bank_staff_assignments_active_uniq'
      AND pg_get_indexdef(i.oid) ILIKE '%bank_staff_id%'
      AND pg_get_indexdef(i.oid) ILIKE '%work_date%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I',r.relname);
    RAISE NOTICE 'Dropped index: %',r.relname;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS bank_staff_assignments_active_uniq
  ON public.bank_staff_assignments (bank_staff_id,work_date)
  WHERE status IS DISTINCT FROM 'cancelled';

-- Verification: this should show bank_staff_assignments_active_uniq with a
-- WHERE clause excluding cancelled rows.
SELECT i.relname AS index_name, pg_get_indexdef(i.oid) AS definition
FROM pg_class i
JOIN pg_index x ON x.indexrelid = i.oid
WHERE x.indrelid = 'public.bank_staff_assignments'::regclass
  AND x.indisunique
ORDER BY i.relname;
