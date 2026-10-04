-- ============================================================================
-- Tracey Galea — switch to "Shift A" (2 days on, 1 day off) from 8 Oct 2026,
-- and mark 25 Oct 2026 as OVERTIME (07:00–18:00).
--
-- WHY STEP 1 IS NEEDED
--   The app fills each nurse's roster automatically from a built-in pattern.
--   Any cell SAVED BY HAND (an explicit row in `roster`) overrides that pattern.
--   Tracey's plain Day / Rest cells from 8 Oct were saved by hand under her old
--   4-on / 1-off rota, so they hide the new Shift A (Day, Day, Off) pattern.
--   Removing just those plain Day / Rest cells lets the app draw Shift A again
--   (and it keeps doing so for every future month automatically).
--
-- WHAT IT TOUCHES
--   • STEP 1 removes ONLY plain "working" / "off" cells, ONLY from 2026-10-08 on.
--     It does NOT touch annual leave, sick, maternity, study leave, overtime,
--     TIL or change-of-duty (COD), and nothing before 8 Oct 2026.
--   • STEP 2 adds one overtime record for 25 Oct (07:00–18:00). On the roster
--     that day then shows OT (overtime always wins over the pattern), and the
--     11 hours appear in the Overtime list / audit. It will not duplicate if the
--     script is run again.
--
-- HOW TO RUN
--   Paste into the Supabase SQL editor and run once. To preview step 1 first,
--   change its "DELETE FROM roster r" to "SELECT r.* FROM roster r".
-- ============================================================================

-- STEP 1 — clear Tracey's hand-saved plain Day/Rest cells from 8 Oct onward.
DELETE FROM roster r
USING staff s
WHERE r.staff_id = s.id
  AND s.full_name ILIKE '%galea%'                       -- Tracey Galea
  AND r.roster_date >= '2026-10-08'
  AND r.status IN ('working','off')                     -- only her plain pattern cells
  AND COALESCE(r.notes,'') NOT LIKE 'COD-%'              -- keep change-of-duty
  AND COALESCE(r.notes,'') NOT LIKE 'Auto roster:%';     -- keep auto-generated

-- STEP 2 — mark 25 Oct 2026 as overtime 07:00–18:00 (shows as OT on the roster).
INSERT INTO leave_records (staff_id, leave_type, start_date, end_date, total_days, notes)
SELECT s.id, 'overtime', '2026-10-25', '2026-10-25', 1, 'Core OT: 07:00–18:00 [07:00–18:00]'
FROM staff s
WHERE s.full_name ILIKE '%galea%'
  AND NOT EXISTS (
    SELECT 1 FROM leave_records lr
    WHERE lr.staff_id = s.id
      AND lr.leave_type = 'overtime'
      AND lr.start_date = '2026-10-25'
  );
