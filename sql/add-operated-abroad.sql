-- ============================================================================
-- "Operated abroad" flag for the New Patients register.
--
-- WHAT IT DOES
--   Adds one column, patients.operated_abroad, so a stoma formed at another
--   hospital / outside Malta can be marked as such. The New Patients register
--   then keeps those out of MDH's operative count by default, showing them only
--   when the "Operated abroad" toggle is on (tagged "🌍 abroad").
--
-- WHY IT IS SAFE
--   • IF NOT EXISTS — running it twice does nothing the second time.
--   • Defaults to FALSE, so every existing patient stays "formed at MDH" until
--     someone ticks the box or uses the "Operated abroad" quick-add.
--   • The app works before this is run: writes drop the unknown column and warn,
--     reads fall back without it — so nothing breaks, the flag just will not
--     persist until this has been run once.
--
-- HOW TO RUN
--   Paste into the Supabase SQL editor and run once.
-- ============================================================================

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS operated_abroad boolean NOT NULL DEFAULT false;
