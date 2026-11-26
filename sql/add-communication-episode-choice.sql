-- =============================================================================
-- Correspondence during an admission. By default it is filed under the
-- admission, as an encounter of it. A row here means the nurse chose to open
-- that correspondence as an episode of its own instead; deleting the row files
-- it under the admission again.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste ALL of
-- this -> Run. Safe to re-run. No existing patient data is read or changed.
-- Each command is on ONE line on purpose, so it can be pasted safely on a phone.
-- =============================================================================

create table if not exists public.communication_episode_choices (communication_id uuid primary key references public.patient_communications(id) on delete cascade, patient_id uuid not null references public.patients(id) on delete cascade, separate_episode boolean not null default true, created_by uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists communication_episode_choices_patient on public.communication_episode_choices (patient_id);

-- Signed-in clinic staff only, not anonymous sessions.
alter table public.communication_episode_choices enable row level security;
revoke all on public.communication_episode_choices from public, anon, authenticated;
grant select, insert, update, delete on public.communication_episode_choices to authenticated;
drop policy if exists communication_episode_choices_rw on public.communication_episode_choices;
create policy communication_episode_choices_rw on public.communication_episode_choices for all to authenticated using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) and exists (select 1 from public.patients p where p.id = patient_id));

notify pgrst, 'reload schema';

-- Check: should list the new table with its row count, 0 the first time.
select 'communication_episode_choices' as table_name, count(*) as choices from public.communication_episode_choices;
