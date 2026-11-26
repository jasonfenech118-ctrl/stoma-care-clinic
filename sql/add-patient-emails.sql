-- =============================================================================
-- Emails linked to the patient, being tested by the administrators before the
-- move to Dataverse.
--
-- Each email is saved as a contact of a Patient correspondence issue, so it gets
-- its encounter code. Its email details are kept here: From, To, CC, when it was
-- sent, the text, the original email word for word, the attachment names and
-- the Message-ID, used to skip an email already saved. The attachments
-- themselves go to the private picture store; run sql/add-patient-images.sql
-- first.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste ALL of
-- this -> Run. Safe to re-run. No existing patient data is read or changed.
-- Each command is on ONE line on purpose, so it can be pasted safely on a phone.
-- =============================================================================

create table if not exists public.patient_emails (id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade, communication_id uuid not null unique references public.patient_communications(id) on delete cascade, issue_id uuid, direction text not null default 'Incoming' check (direction in ('Incoming','Outgoing')), from_text text not null default '', to_text text not null default '', cc_text text not null default '', sent_at timestamptz, subject text not null default '', body text not null default '', original text not null default '', attachment_names text not null default '', message_id text not null default '', source text not null default '' check (source in ('','file','paste','reply')), created_by uuid default auth.uid(), created_by_name text not null default '', created_at timestamptz not null default now(), check (length(original) <= 200000 and length(body) <= 100000 and length(message_id) <= 400));
create index if not exists patient_emails_patient on public.patient_emails (patient_id, issue_id);
create unique index if not exists patient_emails_message on public.patient_emails (patient_id, message_id) where message_id <> '';

-- Signed-in clinic staff only, not anonymous sessions.
alter table public.patient_emails enable row level security;
revoke all on public.patient_emails from public, anon, authenticated;
grant select, insert, update, delete on public.patient_emails to authenticated;
drop policy if exists patient_emails_rw on public.patient_emails;
create policy patient_emails_rw on public.patient_emails for all to authenticated using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) and exists (select 1 from public.patients p where p.id = patient_id));

notify pgrst, 'reload schema';

-- Check: should list the new table with its row count, 0 the first time.
select 'patient_emails' as table_name, count(*) as emails from public.patient_emails;
