-- ============================================================================
-- Optional location for an "Operated Outside MDH" stoma.
--
-- WHAT IT DOES
--   Adds two optional text columns to patients:
--     • operated_abroad_hospital — the hospital where the operation was performed
--     • operated_abroad_country  — the country
--   They are shown on the patient page (next to the green "Operated Outside MDH"
--   badge) and under the operation in the Operated-Outside-MDH register view.
--
-- WHY IT IS SAFE
--   • IF NOT EXISTS — running it twice does nothing the second time.
--   • Both are nullable with no default, so every existing record is unaffected.
--   • The app works before this is run: writes drop the unknown columns and warn,
--     reads fall back without them.
--
-- NOTE
--   Run sql/add-operated-abroad.sql first (it adds the operated_abroad flag).
--
-- HOW TO RUN
--   Paste into the Supabase SQL editor and run once.
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS operated_abroad_hospital text,
  ADD COLUMN IF NOT EXISTS operated_abroad_country  text;
