-- Record the planned follow-up due month on the appointment itself, so the
-- patient-profile visit report can show the due month per visit (not only the
-- patient's current plan). Run once in Supabase. Until then the report falls back
-- to the patient's current due month for the latest visit only.
alter table appointments add column if not exists followup_due_month integer;
alter table appointments add column if not exists followup_year integer;
