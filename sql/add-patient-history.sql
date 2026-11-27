-- =============================================================================
-- Patient profile tabs copied from the hospital system: Performed procedures
-- with Patient consultation notes, Medical imaging results and iCM notes. Lists
-- and notes pasted in one go are organised into dated rows inside the app.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste ALL of
-- this -> Run. Safe to re-run. No existing patient data is read or changed.
--
-- Each command is deliberately on ONE line. On a phone the Supabase editor
-- treats a paste like typing and adds a closing bracket by itself after any
-- line that ends with an open bracket. That stray bracket lands at the very
-- end of the script and stops it with a syntax error near a closing bracket.
--
-- Columns: entry_date is empty when no date was given; date_precision is day,
-- month or year; entry_time is HH:MM when the source gave a time (HH:MM:SS for an ECG); date_text is
-- the date exactly as written; entry_type is e.g. CT, Laparoscopic, Doctor;
-- title is the operation, scan or treatment; result is the outcome, report or
-- the note itself (for an ECG, the measurements, axis and the cardiograph's
-- statements); source is who or where; raw_text is the pasted lines the
-- row came from; fingerprint skips the same entry pasted twice; batch_id is
-- shared by the rows saved from one paste; linked_stoma is a stoma chosen by
-- hand for a procedure or consultation note.
-- =============================================================================

create table if not exists public.patient_history_entries (id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade, category text not null, entry_date date, date_precision text not null default '' check (date_precision in ('','day','month','year')), entry_time text not null default '', date_text text not null default '', entry_type text not null default '', title text not null default '', result text not null default '', source text not null default '', raw_text text not null default '', fingerprint text not null default '', batch_id uuid, created_by uuid default auth.uid(), created_by_name text not null default '', created_at timestamptz not null default now(), updated_by_name text not null default '', updated_at timestamptz not null default now(), check (length(title) <= 2000 and length(result) <= 20000 and length(raw_text) <= 40000));

-- Added later; safe on a database set up with an earlier version of this script.
alter table public.patient_history_entries add column if not exists linked_stoma text not null default '';

-- Which section an entry belongs to. Re-created each run so a database set up
-- with an earlier version of this script also accepts Patient consultation,
-- consult; Entitlement CARE, poyc; and ECG, ecg.
-- Older tab names stay allowed so nothing saved before is rejected.
alter table public.patient_history_entries drop constraint if exists patient_history_entries_category_check;
alter table public.patient_history_entries add constraint patient_history_entries_category_check check (category in ('surgery','consult','imaging','ecg','doc_icm','poyc','notes','treatment','doc_onco','doc_ccp'));

create index if not exists patient_history_entries_patient on public.patient_history_entries (patient_id, category, entry_date desc);

-- Signed-in clinic staff only, not anonymous sessions.
alter table public.patient_history_entries enable row level security;
revoke all on public.patient_history_entries from public, anon, authenticated;
grant select, insert, update, delete on public.patient_history_entries to authenticated;
drop policy if exists patient_history_entries_rw on public.patient_history_entries;
create policy patient_history_entries_rw on public.patient_history_entries for all to authenticated using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) and exists (select 1 from public.patients p where p.id = patient_id));

notify pgrst, 'reload schema';

-- Check: should list the new table with its row count, 0 the first time.
select 'patient_history_entries' as table_name, count(*) as rows from public.patient_history_entries;
