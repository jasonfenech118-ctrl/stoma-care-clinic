-- ============================================================================
-- Switch Tracey Galea to her built-in "Shift A" rota (2 days on, 1 day off)
-- from 8 October 2026 onward.
--
-- WHY THIS IS NEEDED
--   The app fills each nurse's roster automatically from a built-in pattern.
--   Any cell that was SAVED BY HAND (an explicit row in the `roster` table)
--   overrides that automatic pattern. Tracey's plain Day / Rest cells from
--   8 Oct were saved by hand under her previous 4-on / 1-off rota, so they hide
--   the new Shift A (Day, Day, Off) pattern the app now knows for her.
--
--   Removing just those plain Day / Rest cells lets the app draw her Shift A
--   pattern again (and keeps doing so for every future month automatically).
--
-- WHAT IT TOUCHES
--   • ONLY plain "working" / "off" cells, ONLY from 2026-10-08 onward.
--   • It does NOT touch annual leave, sick, maternity, study leave, overtime,
--     TIL, or change-of-duty (COD) entries.
--   • It does NOT touch any date before 8 Oct 2026.
--
-- HOW TO RUN
--   Paste this into the Supabase SQL editor and run it once. To preview first,
--   change "DELETE FROM roster r" to "SELECT r.* FROM roster r" and run that.
-- ============================================================================

DELETE FROM roster r
USING staff s
WHERE r.staff_id = s.id
  AND s.full_name ILIKE '%galea%'                       -- Tracey Galea
  AND r.roster_date >= '2026-10-08'
  AND r.status IN ('working','off')                     -- only her plain pattern cells
  AND COALESCE(r.notes,'') NOT LIKE 'COD-%'              -- keep change-of-duty
  AND COALESCE(r.notes,'') NOT LIKE 'Auto roster:%';     -- keep auto-generated
