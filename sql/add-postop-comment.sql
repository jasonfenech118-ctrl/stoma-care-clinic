-- Postop Discharges: a free-text comment per discharge, and the exact time the
-- postop discharge was recorded (so an appointment booked earlier the same day
-- does not take the patient off the list).
-- Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.
-- No patient data is read or changed.
alter table public.clinical_records add column if not exists postop_comment text;
alter table public.clinical_records add column if not exists postop_discharged_at timestamptz;
notify pgrst, 'reload schema';
