-- Upgrade existing communication records to issues with linked contacts and reminders.
-- Existing records, access policies, grants, trigger bindings and signatures are preserved.
-- If patient_communications is not installed, use add-patient-communications.sql first.

-- Each original record is an issue. Further contacts belong to that issue,
-- while its current status/reminder is kept on the original row.
alter table public.patient_communications add column if not exists parent_id uuid;
alter table public.patient_communications add column if not exists reminder_enabled boolean not null default false;
alter table public.patient_communications add column if not exists resolved_at timestamptz;
alter table public.patient_communications add column if not exists resolved_by uuid;
alter table public.patient_communications add column if not exists resolved_by_name text;
create unique index if not exists patient_communications_identity_idx
  on public.patient_communications(id,patient_id,kind);
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.patient_communications'::regclass and conname='patient_communications_issue_fk') then
    alter table public.patient_communications add constraint patient_communications_issue_fk
      foreign key(parent_id,patient_id,kind) references public.patient_communications(id,patient_id,kind);
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.patient_communications'::regclass and conname='patient_communications_reminder_check') then
    alter table public.patient_communications add constraint patient_communications_reminder_check
      check(not reminder_enabled or (status<>'Completed' and followup_date is not null and length(btrim(followup_action))>0));
  end if;
end $$;
create index if not exists patient_communications_contacts_idx
  on public.patient_communications(parent_id,created_at desc) where parent_id is not null;
create index if not exists patient_communications_due_idx
  on public.patient_communications(followup_date,patient_id)
  where parent_id is null and reminder_enabled and status<>'Completed';


create or replace function public.stamp_patient_communication()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  actor uuid := auth.uid();
  email text := lower(coalesce(auth.jwt()->>'email',''));
  author text;
  snapshot jsonb;
  saved_at timestamptz := clock_timestamp();
  issue public.patient_communications%rowtype;
begin
  if actor is null or email='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to record a communication.' using errcode='42501';
  end if;
  author := initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g'));
  if tg_op='UPDATE' and new.parent_id is distinct from old.parent_id then
    raise exception 'A contact cannot be moved to another issue.';
  end if;
  if new.status='Completed' then new.reminder_enabled:=false; end if;
  if new.parent_id is not null then
    select * into issue from public.patient_communications where id=new.parent_id for update;
    if not found or issue.parent_id is not null or issue.patient_id<>new.patient_id or issue.kind<>new.kind or issue.id=new.id then
      raise exception 'The contact must belong to an issue for this patient and category.' using errcode='42501';
    end if;
    if new.communication_date<issue.communication_date then
      raise exception 'A contact cannot be dated before the issue was opened.';
    end if;
    if tg_op='INSERT' then
      if issue.status='Completed' then raise exception 'Reopen this resolved issue before adding a contact.' using errcode='40001'; end if;
      -- Locking and updating the issue makes concurrent contacts/resolution atomic.
      update public.patient_communications set status=new.status,followup_action=new.followup_action,
        followup_date=new.followup_date,reminder_enabled=new.reminder_enabled where id=issue.id;
    elsif row(new.status,new.followup_action,new.followup_date,new.reminder_enabled)
      is distinct from row(old.status,old.followup_action,old.followup_date,old.reminder_enabled) then
      raise exception 'Edit the issue to change its status or reminder; a correction only changes this contact.';
    end if;
    new.resolved_at:=null;new.resolved_by:=null;new.resolved_by_name:=null;
  elsif new.status='Completed' then
    new.resolved_at:=case when tg_op='UPDATE' and old.status='Completed' then old.resolved_at else saved_at end;
    new.resolved_by:=case when tg_op='UPDATE' and old.status='Completed' then old.resolved_by else actor end;
    new.resolved_by_name:=case when tg_op='UPDATE' and old.status='Completed' then old.resolved_by_name else author end;
  else new.resolved_at:=null;new.resolved_by:=null;new.resolved_by_name:=null;
  end if;
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

create or replace function public.save_patient_communication(
  p_patient_id uuid, p_record_id uuid, p_expected_version integer, p_kind text, p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  rec public.patient_communications%rowtype;
  incoming public.patient_communications%rowtype;
  identical boolean;
  issue public.patient_communications%rowtype;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'email','')='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to record a communication.' using errcode='42501';
  end if;
  if p_kind is null or p_kind not in ('community','patient') or p_expected_version is null or p_expected_version<0
     or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>100000 then
    raise exception 'Invalid communication record.';
  end if;
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('communication_date','communication_time','method','direction','contact_name','service','subject','notes','status','followup_action','followup_date','parent_id','parent_version','reminder_enabled')) then
    raise exception 'Unsupported communication field.';
  end if;
  if not exists(select 1 from public.patients p where p.id=p_patient_id) then
    raise exception 'The patient could not be found.' using errcode='42501';
  end if;
  incoming := jsonb_populate_record(null::public.patient_communications, p_payload || jsonb_build_object(
    'communication_time',nullif(p_payload->>'communication_time',''),
    'followup_date',nullif(p_payload->>'followup_date',''),
    'parent_id',nullif(p_payload->>'parent_id',''),
    'reminder_enabled',coalesce((p_payload->>'reminder_enabled')::boolean,false),
    'contact_name',btrim(coalesce(p_payload->>'contact_name','')),
    'service',btrim(coalesce(p_payload->>'service','')),
    'subject',btrim(coalesce(p_payload->>'subject','')),
    'notes',btrim(coalesce(p_payload->>'notes','')),
    'followup_action',btrim(coalesce(p_payload->>'followup_action',''))));
  if incoming.communication_date is null or incoming.method is null or incoming.direction is null or incoming.status is null
     or incoming.contact_name='' or incoming.subject='' or incoming.notes='' or p_kind='community' and incoming.service='' then
    raise exception 'Complete the date, contact, subject, notes and community service where required.';
  end if;
  if incoming.status='Completed' then incoming.reminder_enabled:=false; end if;
  if incoming.parent_id is not null then
    select * into issue from public.patient_communications where id=incoming.parent_id for update;
    if not found or issue.patient_id<>p_patient_id or issue.kind<>p_kind or issue.parent_id is not null then
      raise exception 'The issue could not be found for this patient and category.' using errcode='42501';
    end if;
  end if;
  select * into rec from public.patient_communications where id=p_record_id for update;
  if found then
    if rec.patient_id<>p_patient_id or rec.kind<>p_kind or rec.parent_id is distinct from incoming.parent_id then
      raise exception 'The communication does not belong to this patient and category.' using errcode='42501';
    end if;
    -- An older open browser can still correct a root record without silently
    -- clearing a reminder configured on another device.
    if not (p_payload ? 'reminder_enabled') then incoming.reminder_enabled:=rec.reminder_enabled; end if;
    if incoming.status='Completed' then incoming.reminder_enabled:=false; end if;
    identical := row(rec.communication_date,rec.communication_time,rec.method,rec.direction,rec.contact_name,rec.service,rec.subject,rec.notes,rec.status,rec.followup_action,rec.followup_date,rec.reminder_enabled)
      is not distinct from row(incoming.communication_date,incoming.communication_time,incoming.method,incoming.direction,incoming.contact_name,incoming.service,incoming.subject,incoming.notes,incoming.status,incoming.followup_action,incoming.followup_date,incoming.reminder_enabled);
    if p_expected_version=0 and rec.version=1 and identical then
      return to_jsonb(rec)||case when rec.parent_id is not null then jsonb_build_object('issue',to_jsonb(issue)) else '{}'::jsonb end;
    end if;
    if rec.version<>p_expected_version then
      raise exception 'This communication has a newer saved version. Reopen the record before editing; your changes were not overwritten.' using errcode='40001';
    end if;
    if identical then return to_jsonb(rec)||case when rec.parent_id is not null then jsonb_build_object('issue',to_jsonb(issue)) else '{}'::jsonb end; end if;
    update public.patient_communications set communication_date=incoming.communication_date,communication_time=incoming.communication_time,
      method=incoming.method,direction=incoming.direction,contact_name=incoming.contact_name,service=incoming.service,
      subject=incoming.subject,notes=incoming.notes,status=incoming.status,followup_action=incoming.followup_action,followup_date=incoming.followup_date,reminder_enabled=incoming.reminder_enabled
      where id=rec.id returning * into rec;
  else
    if p_expected_version<>0 then raise exception 'The communication could not be found. Reopen the patient before editing.'; end if;
    if incoming.parent_id is not null and (p_payload->>'parent_version')::integer is distinct from issue.version then
      raise exception 'This issue has a newer saved update. Reopen the issue before adding a contact; your wording is still here.' using errcode='40001';
    end if;
    insert into public.patient_communications(id,patient_id,kind,communication_date,communication_time,method,direction,contact_name,service,subject,notes,status,followup_action,followup_date,parent_id,reminder_enabled)
      values(coalesce(p_record_id,gen_random_uuid()),p_patient_id,p_kind,incoming.communication_date,incoming.communication_time,
        incoming.method,incoming.direction,incoming.contact_name,incoming.service,incoming.subject,incoming.notes,incoming.status,incoming.followup_action,incoming.followup_date,incoming.parent_id,incoming.reminder_enabled)
      returning * into rec;
  end if;
  if rec.parent_id is not null then
    select * into issue from public.patient_communications where id=rec.parent_id;
    return to_jsonb(rec)||jsonb_build_object('issue',to_jsonb(issue));
  end if;
  return to_jsonb(rec);
end;
$$;

notify pgrst,'reload schema';
