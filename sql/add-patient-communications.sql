-- Patient correspondence is not an inpatient admission or an encounter.
-- Each record has its own history; corrections retain the original wording.
-- Shared clinic access follows the caller's existing patients RLS visibility.
create table if not exists public.patient_communications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  kind text not null check (kind in ('community','patient')),
  communication_date date not null,
  communication_time time,
  method text not null check (method in ('Telephone','Email','In person','Letter','Other')),
  direction text not null check (direction in ('Outgoing','Incoming')),
  contact_name text not null check (length(btrim(contact_name)) between 1 and 200),
  service text not null default '' check (length(service) <= 200),
  subject text not null check (length(btrim(subject)) between 1 and 200),
  notes text not null check (length(btrim(notes)) between 1 and 20000),
  status text not null default 'Recorded' check (status in ('Recorded','Awaiting response','Follow-up required','Completed')),
  followup_action text not null default '' check (length(followup_action) <= 2000),
  followup_date date check (followup_date >= communication_date),
  created_by uuid not null,
  created_by_email text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_by uuid not null,
  updated_by_email text not null,
  updated_by_name text not null,
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  versions jsonb not null default '[]'::jsonb check (jsonb_typeof(versions)='array'),
  check (kind <> 'community' or length(btrim(service)) > 0)
);
create index if not exists patient_communications_history_idx
  on public.patient_communications(patient_id, communication_date desc, communication_time desc nulls last, created_at desc, id);

alter table public.patient_communications enable row level security;
revoke all on public.patient_communications from public, anon, authenticated;
grant select, insert, update on public.patient_communications to authenticated;
drop policy if exists patient_communications_read on public.patient_communications;
create policy patient_communications_read on public.patient_communications
  for select to authenticated using (
    (select auth.uid()) is not null
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and exists (select 1 from public.patients p where p.id=patient_id)
  );
drop policy if exists patient_communications_insert on public.patient_communications;
create policy patient_communications_insert on public.patient_communications
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and exists (select 1 from public.patients p where p.id=patient_id)
  );
drop policy if exists patient_communications_update on public.patient_communications;
create policy patient_communications_update on public.patient_communications
  for update to authenticated using (
    (select auth.uid()) is not null
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and exists (select 1 from public.patients p where p.id=patient_id)
  ) with check (
    updated_by=(select auth.uid())
    and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
    and exists (select 1 from public.patients p where p.id=patient_id)
  );

-- The trigger also protects audit history if an authenticated caller writes
-- directly via the Data API. Authors, versions and timestamps are server-owned.
create or replace function public.stamp_patient_communication()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := auth.uid();
  email text := lower(coalesce(auth.jwt()->>'email',''));
  author text;
  snapshot jsonb;
  saved_at timestamptz := clock_timestamp();
begin
  if actor is null or email='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to record a communication.' using errcode='42501';
  end if;
  author := initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g'));
  if tg_op='INSERT' then
    new.created_by := actor; new.created_by_email := email; new.created_by_name := author;
    new.created_at := saved_at; new.version := 1; new.versions := '[]'::jsonb;
  else
    if new.id<>old.id or new.patient_id<>old.patient_id or new.kind<>old.kind then
      raise exception 'A communication cannot be moved to another patient or category.';
    end if;
    new.created_by := old.created_by; new.created_by_email := old.created_by_email;
    new.created_by_name := old.created_by_name; new.created_at := old.created_at;
    new.version := old.version+1; new.versions := old.versions;
  end if;
  new.updated_by := actor; new.updated_by_email := email; new.updated_by_name := author; new.updated_at := saved_at;
  snapshot := to_jsonb(new) - array['id','patient_id','kind','created_by','created_by_email','created_by_name','created_at','updated_by','updated_by_email','updated_by_name','updated_at','version','versions'];
  new.versions := new.versions || jsonb_build_array(jsonb_build_object('version',new.version,'saved_at',saved_at,'author_name',author,'author_email',email,'snapshot',snapshot));
  return new;
end;
$$;
revoke all on function public.stamp_patient_communication() from public, anon;
drop trigger if exists stamp_patient_communication on public.patient_communications;
create trigger stamp_patient_communication before insert or update on public.patient_communications
  for each row execute function public.stamp_patient_communication();

-- A row lock and expected version prevent one nurse/device overwriting another.
-- A client-generated id makes retrying a new record after a lost response safe.
create or replace function public.save_patient_communication(
  p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_kind text, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  rec public.patient_communications%rowtype;
  incoming public.patient_communications%rowtype;
  identical boolean;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'email','')='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to record a communication.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('community','patient') or p_expected_version is null or p_expected_version<0
     or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>100000 then
    raise exception 'Invalid communication record.';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('communication_date','communication_time','method','direction','contact_name','service','subject','notes','status','followup_action','followup_date')) then
    raise exception 'Unsupported communication field.';
  end if;
  if not exists(select 1 from public.patients p where p.id=p_patient_id) then
    raise exception 'The patient could not be found.' using errcode='42501';
  end if;
  incoming := jsonb_populate_record(null::public.patient_communications, p_payload || jsonb_build_object(
    'communication_time',nullif(p_payload->>'communication_time',''),
    'followup_date',nullif(p_payload->>'followup_date',''),
    'contact_name',btrim(coalesce(p_payload->>'contact_name','')),
    'service',btrim(coalesce(p_payload->>'service','')),
    'subject',btrim(coalesce(p_payload->>'subject','')),
    'notes',btrim(coalesce(p_payload->>'notes','')),
    'followup_action',btrim(coalesce(p_payload->>'followup_action',''))));
  if incoming.communication_date is null or incoming.method is null or incoming.direction is null or incoming.status is null
     or incoming.contact_name='' or incoming.subject='' or incoming.notes='' or p_kind='community' and incoming.service='' then
    raise exception 'Complete the date, contact, subject, notes and community service where required.';
  end if;
  select * into rec from public.patient_communications where id=p_record_id for update;
  if found then
    if rec.patient_id<>p_patient_id or rec.kind<>p_kind then
      raise exception 'The communication does not belong to this patient and category.' using errcode='42501';
    end if;
    identical := row(rec.communication_date,rec.communication_time,rec.method,rec.direction,rec.contact_name,rec.service,rec.subject,rec.notes,rec.status,rec.followup_action,rec.followup_date)
      is not distinct from row(incoming.communication_date,incoming.communication_time,incoming.method,incoming.direction,incoming.contact_name,incoming.service,incoming.subject,incoming.notes,incoming.status,incoming.followup_action,incoming.followup_date);
    if p_expected_version=0 and rec.version=1 and identical then return to_jsonb(rec); end if;
    if rec.version<>p_expected_version then
      raise exception 'This communication has a newer saved version. Reopen the record before editing; your changes were not overwritten.' using errcode='40001';
    end if;
    if identical then return to_jsonb(rec); end if;
    update public.patient_communications set communication_date=incoming.communication_date,communication_time=incoming.communication_time,
      method=incoming.method,direction=incoming.direction,contact_name=incoming.contact_name,service=incoming.service,
      subject=incoming.subject,notes=incoming.notes,status=incoming.status,followup_action=incoming.followup_action,followup_date=incoming.followup_date
      where id=rec.id returning * into rec;
  else
    if p_expected_version<>0 then raise exception 'The communication could not be found. Reopen the patient before editing.'; end if;
    insert into public.patient_communications(id,patient_id,kind,communication_date,communication_time,method,direction,contact_name,service,subject,notes,status,followup_action,followup_date)
      values(coalesce(p_record_id,gen_random_uuid()),p_patient_id,p_kind,incoming.communication_date,incoming.communication_time,
        incoming.method,incoming.direction,incoming.contact_name,incoming.service,incoming.subject,incoming.notes,incoming.status,incoming.followup_action,incoming.followup_date)
      returning * into rec;
  end if;
  return to_jsonb(rec);
end;
$$;
revoke all on function public.save_patient_communication(uuid,uuid,integer,text,jsonb) from public, anon;
grant execute on function public.save_patient_communication(uuid,uuid,integer,text,jsonb) to authenticated;
-- Reuse the clinic's private notifications when that optional setup exists.
do $$
begin
  if to_regprocedure('clinic_private.notify_realtime()') is not null then
    execute 'drop trigger if exists clinic_realtime_changed on public.patient_communications';
    execute 'create trigger clinic_realtime_changed after insert or update or delete on public.patient_communications for each statement execute function clinic_private.notify_realtime()';
  end if;
end;
$$;
notify pgrst,'reload schema';
