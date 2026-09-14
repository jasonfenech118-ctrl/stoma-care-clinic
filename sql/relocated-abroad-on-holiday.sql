-- =============================================================================
-- Relocated abroad → locality "On Holiday"
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
--
-- WHAT IT IS
--   Patients who have relocated overseas are no longer at a Malta locality. This
--   sets their stored locality to "On Holiday" so they read that way everywhere
--   and land on the fictitious "On Holiday" island on the registry map. (The map
--   already places them there by status; this makes the stored field match.)
--
--   It matches patients whose follow-up status is any spelling of relocated
--   overseas, OR who carry a relocated-overseas date, and — to mirror the map,
--   where a death outranks a relocation — it leaves deceased patients alone.
--
--   NOTE: this REPLACES the patient's original Malta locality. If you want to
--   keep a copy first, run step 0 and save its result before step 2.
--
--   Safe to re-run: rows already reading 'On Holiday' are skipped.
-- =============================================================================

-- 0. OPTIONAL BACKUP — the original locality of every record about to change.
--    Run this and export/save the result if you want the old towns on record.
SELECT id, first_name, surname, id_card, followup_status,
       locality AS original_locality, relocated_overseas_date
FROM public.patients
WHERE ( lower(coalesce(followup_status,'')) IN
        ('relocated_overseas','relocated_abroad','overseas','abroad','relocated')
     OR relocated_overseas_date IS NOT NULL )
  AND deceased_date IS NULL
  AND coalesce(locality,'') <> 'On Holiday'
ORDER BY surname, first_name;

-- 1. PREVIEW — how many patients, grouped by their current locality.
SELECT locality AS current_locality, count(*) AS patients
FROM public.patients
WHERE ( lower(coalesce(followup_status,'')) IN
        ('relocated_overseas','relocated_abroad','overseas','abroad','relocated')
     OR relocated_overseas_date IS NOT NULL )
  AND deceased_date IS NULL
GROUP BY locality
ORDER BY patients DESC;

-- 2. APPLY — set them all to "On Holiday".
UPDATE public.patients
SET locality = 'On Holiday'
WHERE ( lower(coalesce(followup_status,'')) IN
        ('relocated_overseas','relocated_abroad','overseas','abroad','relocated')
     OR relocated_overseas_date IS NOT NULL )
  AND deceased_date IS NULL
  AND coalesce(locality,'') <> 'On Holiday';

-- 3. CONFIRM — the total now sitting on "On Holiday".
SELECT locality, count(*) AS patients
FROM public.patients
WHERE locality = 'On Holiday'
GROUP BY locality;
