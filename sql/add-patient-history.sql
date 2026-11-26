-- =============================================================================
-- Patient profile › Surgeries (with Medical imaging), Patient notes and
-- Patient documentation tabs: lists pasted in one go and organised into dated
-- rows inside the app.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste ALL of
-- this -> Run. Safe to re-run. No existing patient data is read or changed.
-- =============================================================================

create table if not exists public.patient_history_entries (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null references public.patients(id) on delete cascade,
  category        text not null,
  entry_date      date,                                   -- null when no date was given
  date_precision  text not null default '' check (date_precision in ('','day','month','year')),
  entry_time      text not null default '',               -- HH:MM when the source gave a time
  date_text       text not null default '',               -- the date exactly as it was written
  entry_type      text not null default '',               -- e.g. CT / Laparoscopic / Chemotherapy / Doctor
  title           text not null default '',               -- operation, scan or treatment
  result          text not null default '',               -- outcome, report, details or the note itself
  source          text not null default '',               -- who / where (surgeon, radiologist, hospital, author)
  raw_text        text not null default '',               -- the pasted lines this row came from
  fingerprint     text not null default '',               -- used to skip the same entry pasted twice
  batch_id        uuid,                                   -- rows saved from one paste share it
  created_by      uuid default auth.uid(),
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_by_name text not null default '',
  updated_at      timestamptz not null default now(),
  check (length(title) <= 2000 and length(result) <= 20000 and length(raw_text) <= 40000)
);
-- Which tab an entry belongs to. Re-created each run so a database set up with
-- the first version of this script also accepts the Patient documentation tabs.
alter table public.patient_history_entries drop constraint if exists patient_history_entries_category_check;
alter table public.patient_history_entries add constraint patient_history_entries_category_check
  check (category in ('surgery','imaging','notes','treatment','doc_icm','doc_onco','doc_ccp'));

create index if not exists patient_history_entries_patient
  on public.patient_history_entries (patient_id, category, entry_date desc);

-- Signed-in clinic staff only (not anonymous sessions).
alter table public.patient_history_entries enable row level security;
revoke all on public.patient_history_entries from public, anon, authenticated;
grant select, insert, update, delete on public.patient_history_entries to authenticated;

drop policy if exists patient_history_entries_rw on public.patient_history_entries;
create policy patient_history_entries_rw on public.patient_history_entries
  for all to authenticated
  using (
    (select auth.uid()) is not null
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
  )
  with check (
    (select auth.uid()) is not null
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
    and exists (select 1 from public.patients p where p.id = patient_id)
  );

notify pgrst, 'reload schema';

-- Check: should list the new table with its row count (0 the first time).
select 'patient_history_entries' as table_name, count(*) as rows from public.patient_history_entries;
