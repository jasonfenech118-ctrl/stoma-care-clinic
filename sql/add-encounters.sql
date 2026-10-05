-- ============================================================================
-- Ward encounters — a stoma assessment + nursing report per inpatient episode.
--
-- WHAT IT DOES
--   Creates the `encounters` table. Each row is ONE encounter, with its own id,
--   linked to a patient and to the current inpatient EPISODE (clinical_records
--   row). A patient's admission can carry many encounters. The handover shows the
--   Appliance+notes cell green when an encounter was saved TODAY.
--
--   The stoma assessment is stored as JSON (assessment), so the structured fields
--   can be added later without another migration; the nursing report is free text.
--
-- WHY IT IS SAFE
--   • IF NOT EXISTS — running it twice does nothing the second time.
--   • patient_id / episode_id are kept as text (the app passes ids as strings),
--     so there is no dependency on the exact id type of the other tables.
--   • The app works before this is run: the handover degrades quietly (no green)
--     and saving an encounter tells you to run this file.
--
-- HOW TO RUN
--   Paste into the Supabase SQL editor and run once.
-- ============================================================================

create table if not exists encounters (
  id              uuid primary key default gen_random_uuid(),
  patient_id      text not null,
  episode_id      text,
  episode_ref     text,
  encounter_date  date not null default current_date,
  assessment      jsonb not null default '{}'::jsonb,
  nursing_report  text,
  created_by_email text,
  created_by_name  text,
  created_at      timestamptz not null default now()
);

create index if not exists encounters_patient_date_idx on encounters (patient_id, encounter_date);
create index if not exists encounters_episode_idx      on encounters (episode_id);

-- Access, matching how the app reaches its other tables.
alter table encounters enable row level security;
drop policy if exists encounters_all on encounters;
create policy encounters_all on encounters for all using (true) with check (true);
grant all on table encounters to anon, authenticated, service_role;
