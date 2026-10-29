create table public.patient_discharge_letters (
 id uuid primary key default gen_random_uuid(),
 patient_id uuid not null references public.patients(id) on delete cascade,
 created_at timestamptz not null default now(),
 created_by uuid not null default auth.uid(),
 created_by_name text not null default '',
 letter_date text not null default '',
 filename text not null,
 letter_html text not null check (length(letter_html) between 1 and 1000000),
 letter_text text not null default '',
 stoma_uids jsonb not null default '[]'::jsonb
);
create index patient_discharge_letters_patient_date on public.patient_discharge_letters(patient_id,created_at desc);
alter table public.patient_discharge_letters enable row level security;
revoke all on public.patient_discharge_letters from public,anon,authenticated;
grant select,insert on public.patient_discharge_letters to authenticated;
create policy clinic_read_discharge_letters on public.patient_discharge_letters for select to authenticated using ((select private.is_clinic_member()));
create policy clinic_save_discharge_letters on public.patient_discharge_letters for insert to authenticated with check ((select private.is_clinic_member()) and created_by=(select auth.uid()));
comment on table public.patient_discharge_letters is 'Immutable saved discharge-letter snapshots. Revisions are saved as new copies; access is restricted to clinic members.';
