-- =============================================================================
-- Tracey Galea — core nurse
-- =============================================================================
--
-- The app adds her by itself on first load, so this file is only needed if you
-- want her on the roster right now without opening the app, or if the browser
-- is not allowed to write to the staff table.
--
-- Her shift pattern is NOT stored here. It lives in the app, in defaultCode():
--   Day, Day, Day, Day, Off — a 5-day cycle of four working days then one off.
--   Anchored so that 11 September 2026 is her 3rd working day, which makes
--   13 September her off day, and so on from there.
-- Individual days can still be changed on the roster; those overrides are what
-- the roster table holds.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--   Safe to re-run: she is only added if she is not already there, and an
--   existing row is corrected rather than duplicated.
-- =============================================================================

-- Add her, or put an existing row right (role, and active again if she was
-- switched off). Matched on the name, case-insensitively, the same way the app
-- looks her up.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff
    WHERE lower(trim(full_name)) = 'tracey galea'
  ) THEN
    INSERT INTO public.staff (full_name, role, is_active)
    VALUES ('Tracey Galea', 'Senior Staff Nurse', true);
    RAISE NOTICE 'Tracey Galea added as a core nurse.';
  ELSE
    UPDATE public.staff
       SET role = 'Senior Staff Nurse',
           is_active = true
     WHERE lower(trim(full_name)) = 'tracey galea';
    RAISE NOTICE 'Tracey Galea was already on file — role and active flag confirmed.';
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- Read-only. The core nurses the roster will show.
-- -----------------------------------------------------------------------------
SELECT full_name, role, is_active
FROM public.staff
WHERE is_active
ORDER BY full_name;


-- -----------------------------------------------------------------------------
-- If she ever leaves: switch her off rather than deleting
-- her, so past appointments keep the nurse they were seen by.
-- -----------------------------------------------------------------------------
-- UPDATE public.staff SET is_active = false
--  WHERE lower(trim(full_name)) = 'tracey galea';
