-- =============================================================================
-- Fix the San Ġwann locality — repair the mojibake "St. John's (San Ġwann)"
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
--
-- WHAT IT IS
--   Some patients have their locality stored as a double-encoded (mojibake)
--   version of "St. John's (San Ġwann)" — it shows as "St. Johnâ€™s (San Ä wann)".
--   The corruption is bad enough that the app cannot repair it on the fly, so it
--   showed on patient cards, the booking list and the register, and would not
--   place on the map. This sets those records to the clean locality "San Ġwann",
--   the same spelling the rest of the app uses.
--
--   Match is on the intact ASCII parts "san ... wann", so it catches every
--   variant (clean "San Ġwann", "San Gwann", the mojibake "San Ä wann", and the
--   "St. John's (…)" prefixed forms) without depending on the corrupted byte.
--
--   It is safe to re-run: rows already reading 'San Ġwann' are updated to the
--   same value, and no other locality in Malta contains "san…wann".
-- =============================================================================

-- 1. PREVIEW — see exactly which stored values (and how many patients) will be
--    changed, before you change anything. Run this on its own first.
SELECT locality AS as_recorded, count(*) AS patients
FROM public.patients
WHERE locality ILIKE '%san%wann%'
GROUP BY locality
ORDER BY patients DESC;

-- 2. APPLY — rename every matching record to the clean spelling.
UPDATE public.patients
SET locality = 'San Ġwann'
WHERE locality ILIKE '%san%wann%'
  AND locality <> 'San Ġwann';

-- 3. CONFIRM — should now show a single row: San Ġwann with the full count.
SELECT locality AS as_recorded, count(*) AS patients
FROM public.patients
WHERE locality ILIKE '%san%wann%'
GROUP BY locality
ORDER BY patients DESC;
