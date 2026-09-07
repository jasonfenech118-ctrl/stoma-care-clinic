-- The patients table as the LIVE database actually has it: the columns the app
-- created before any of the register work, and nothing else.
--
-- The first run of the import failed on "column patient_notes does not exist"
-- because the test database here was built with that column in it — invented
-- while writing the test, not taken from the real thing. The import's own
-- preamble was therefore never exercised, and a missing column could not fail.
-- Every column the import needs must now be created by the import itself, and
-- this file is deliberately minimal so that it is.
--
-- inpatient_notes is here, and patient_notes is NOT, because that is what the
-- error message from the live database said.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE public.patients (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name            text,
  surname               text,
  id_card               text UNIQUE NOT NULL,
  phone_number          text,
  followup_owner        text,
  followup_due_month    int,
  followup_year         int,
  followup_status       text,
  followup_type         text,
  is_inpatient          boolean DEFAULT false,
  inpatient_ward        text,
  inpatient_bed         text,
  inpatient_notes       text,
  inpatient_nurse_notes text,
  inpatient_since       date,
  flange_due            date,
  discharge_letter      text,
  schedule_five_permit  text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
