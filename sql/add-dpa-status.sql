-- =============================================================================
-- DPA (Data Protection Act) status on the patient record
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: IF NOT EXISTS guards the column.
--
-- WHAT IT IS
--   The patient profile's Patient details now shows a DPA (Data Protection Act)
--   field the nurse can set to Yes, No or Not available. This stores that choice
--   as a short text value on the patients table ('yes' / 'no' / 'na', or empty
--   when not set), which the app already reads and writes — no grants or
--   row-level security changes are needed. Until it is run, the app simply drops
--   this column from its writes and the field shows as "— not set —".
-- =============================================================================

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS dpa_status text;
