-- Private recovery data only. This never edits or signs a clinical encounter.
create table if not exists public.clinic_encounter_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  episode_id uuid not null references public.clinical_records(id) on delete cascade,
  draft_day date not null,
  encounter_id uuid references public.encounters(id) on delete cascade,
  baseline_version integer not null check (baseline_version >= 0),
  baseline jsonb not null check (jsonb_typeof(baseline)='object'),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<500000),
  revision integer not null check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id,patient_id,episode_id,draft_day)
);
alter table public.clinic_encounter_drafts enable row level security;
create index if not exists clinic_drafts_patient_idx on public.clinic_encounter_drafts(patient_id);
create index if not exists clinic_drafts_episode_idx on public.clinic_encounter_drafts(episode_id);
create index if not exists clinic_drafts_encounter_idx on public.clinic_encounter_drafts(encounter_id);
revoke all on public.clinic_encounter_drafts from public,anon;
grant select,insert,update,delete on public.clinic_encounter_drafts to authenticated;

drop policy if exists clinic_drafts_read on public.clinic_encounter_drafts;
create policy clinic_drafts_read on public.clinic_encounter_drafts for select to authenticated
  using(user_id=(select auth.uid()));
drop policy if exists clinic_drafts_delete on public.clinic_encounter_drafts;
create policy clinic_drafts_delete on public.clinic_encounter_drafts for delete to authenticated
  using(user_id=(select auth.uid()));
drop policy if exists clinic_drafts_insert on public.clinic_encounter_drafts;
create policy clinic_drafts_insert on public.clinic_encounter_drafts for insert to authenticated
  with check(user_id=(select auth.uid()) and draft_day=(now() at time zone 'Europe/Malta')::date
    and exists(select 1 from public.patients p where p.id=patient_id)
    and exists(select 1 from public.clinical_records e where e.id=episode_id and e.patient_id=clinic_encounter_drafts.patient_id and e.kind='episode'));
drop policy if exists clinic_drafts_update on public.clinic_encounter_drafts;
create policy clinic_drafts_update on public.clinic_encounter_drafts for update to authenticated
  using(user_id=(select auth.uid()))
  with check(user_id=(select auth.uid()) and draft_day=(now() at time zone 'Europe/Malta')::date
    and exists(select 1 from public.patients p where p.id=patient_id)
    and exists(select 1 from public.clinical_records e where e.id=episode_id and e.patient_id=clinic_encounter_drafts.patient_id and e.kind='episode'));

create or replace function public.save_clinic_encounter_draft(
  p_patient_id uuid,p_episode_id uuid,p_encounter_id uuid,
  p_baseline_version integer,p_baseline jsonb,p_snapshot jsonb,p_expected_revision integer
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.clinic_encounter_drafts%rowtype;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'email','')='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to protect an encounter draft.' using errcode='42501';
  end if;
  if p_expected_revision<0 or p_baseline_version<0 or jsonb_typeof(p_snapshot) is distinct from 'object'
     or jsonb_typeof(p_baseline) is distinct from 'object' then raise exception 'Invalid recovery draft.'; end if;
  if not exists(select 1 from public.clinical_records e where e.id=p_episode_id and e.patient_id=p_patient_id and e.kind='episode' and e.is_current and e.discharge_date is null) then
    raise exception 'This admission is no longer open. Keep your wording and review the patient.';
  end if;
  if p_encounter_id is not null and not exists(select 1 from public.encounters e where e.id=p_encounter_id and e.patient_id=p_patient_id::text and e.episode_id=p_episode_id::text and e.encounter_date=(now() at time zone 'Europe/Malta')::date) then
    raise exception 'The signed encounter cannot be edited today.';
  end if;
  if p_expected_revision>0 and not exists(select 1 from public.clinic_encounter_drafts d where d.user_id=auth.uid() and d.patient_id=p_patient_id and d.episode_id=p_episode_id and d.draft_day=(now() at time zone 'Europe/Malta')::date) then raise exception 'The recovery draft was discarded on another device.' using errcode='40001'; end if;
  -- A stale tab must not overwrite a newer private draft from another device.
  insert into public.clinic_encounter_drafts as d(user_id,patient_id,episode_id,draft_day,encounter_id,baseline_version,baseline,snapshot,revision,updated_at)
  values(auth.uid(),p_patient_id,p_episode_id,(now() at time zone 'Europe/Malta')::date,p_encounter_id,p_baseline_version,p_baseline,p_snapshot,1,clock_timestamp())
  on conflict(user_id,patient_id,episode_id,draft_day) do update
    set encounter_id=excluded.encounter_id,baseline_version=excluded.baseline_version,baseline=excluded.baseline,snapshot=excluded.snapshot,revision=d.revision+1,updated_at=clock_timestamp()
    where d.revision=p_expected_revision
  returning * into result;
  if not found then raise exception 'The recovery draft changed on another device.' using errcode='40001'; end if;
  delete from public.clinic_encounter_drafts where user_id=auth.uid() and draft_day<(now() at time zone 'Europe/Malta')::date-7;
  return to_jsonb(result);
end;
$$;
revoke all on function public.save_clinic_encounter_draft(uuid,uuid,uuid,integer,jsonb,jsonb,integer) from public,anon;
grant execute on function public.save_clinic_encounter_draft(uuid,uuid,uuid,integer,jsonb,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
