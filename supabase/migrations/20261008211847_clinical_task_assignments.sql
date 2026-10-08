-- Extend the shared task list without rewriting or removing existing tasks.
alter table public.clinic_pending_tasks
  add column if not exists patient_id uuid references public.patients(id) on delete set null,
  add column if not exists stoma_uid text,
  add column if not exists assigned_staff_id uuid references public.staff(id) on delete set null,
  add column if not exists assigned_name text,
  add column if not exists due_date date,
  add column if not exists task_kind text not null default 'general',
  add column if not exists revision integer not null default 0,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by_name text;
create index if not exists clinic_tasks_patient_idx on public.clinic_pending_tasks(patient_id);
create index if not exists clinic_tasks_staff_due_idx on public.clinic_pending_tasks(assigned_staff_id,due_date) where not is_completed;
create index if not exists clinic_tasks_due_idx on public.clinic_pending_tasks(due_date) where not is_completed;
alter table public.clinic_pending_tasks enable row level security;
revoke all on public.clinic_pending_tasks from anon;
grant select,insert,update on public.clinic_pending_tasks to authenticated;

create or replace function public.save_clinic_task(
  p_id uuid,p_expected_revision integer,p_task_text text,p_patient_id uuid,
  p_stoma_uid text,p_assigned_staff_id uuid,p_due_date date
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.clinic_pending_tasks%rowtype; responsible text;
  email text:=lower(coalesce(auth.jwt()->>'email',''));
  author text:=initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g'));
begin
  if auth.uid() is null or email='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to manage clinical tasks.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_task_text,''))) not between 1 and 240 or length(coalesce(p_stoma_uid,''))>160 then raise exception 'Enter a task of up to 240 characters.'; end if;
  if p_patient_id is not null then
    if p_due_date is null or p_assigned_staff_id is null then raise exception 'Choose a responsible nurse and a due date.'; end if;
    if not exists(select 1 from public.patients p where p.id=p_patient_id) then raise exception 'The patient is not available.'; end if;
  elsif coalesce(p_stoma_uid,'')<>'' then raise exception 'A stoma task must link to a patient.'; end if;
  if p_assigned_staff_id is not null then
    select full_name into responsible from public.staff where id=p_assigned_staff_id and coalesce(is_active,true);
    if not found then raise exception 'Choose an active nurse.'; end if;
  end if;
  if p_id is null then
    insert into public.clinic_pending_tasks(task_text,patient_id,stoma_uid,assigned_staff_id,assigned_name,due_date,task_kind,revision,created_by_email,created_by_name,updated_at,updated_by_name)
    values(btrim(p_task_text),p_patient_id,nullif(btrim(p_stoma_uid),''),p_assigned_staff_id,responsible,p_due_date,case when p_patient_id is null then 'general' else 'clinical' end,1,email,author,clock_timestamp(),author) returning * into row;
  else
    select * into row from public.clinic_pending_tasks where id=p_id for update;
    if not found then raise exception 'The task is no longer available.'; end if;
    if row.revision<>p_expected_revision then raise exception 'Another nurse changed this task. Refresh before editing.' using errcode='40001'; end if;
    update public.clinic_pending_tasks set task_text=btrim(p_task_text),patient_id=p_patient_id,stoma_uid=nullif(btrim(p_stoma_uid),''),assigned_staff_id=p_assigned_staff_id,assigned_name=responsible,due_date=p_due_date,task_kind=case when p_patient_id is null then 'general' else 'clinical' end,revision=revision+1,updated_at=clock_timestamp(),updated_by_name=author where id=p_id returning * into row;
  end if;
  return to_jsonb(row);
end;
$$;
create or replace function public.set_clinic_task_completed(p_id uuid,p_expected_revision integer,p_done boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare row public.clinic_pending_tasks%rowtype;
  email text:=lower(coalesce(auth.jwt()->>'email',''));
  author text:=initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g'));
begin
  if auth.uid() is null or email='' or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to update a task.' using errcode='42501'; end if;
  if p_done is null then raise exception 'Choose the task status.'; end if;
  select * into row from public.clinic_pending_tasks where id=p_id for update;
  if not found then raise exception 'The task is no longer available.'; end if;
  if row.is_completed=p_done then return to_jsonb(row); end if;
  if row.revision<>p_expected_revision then raise exception 'Another nurse changed this task. Refresh before updating.' using errcode='40001'; end if;
  update public.clinic_pending_tasks set is_completed=p_done,completed_on=case when p_done then (now() at time zone 'Europe/Malta')::date end,completed_at=case when p_done then clock_timestamp() end,completed_by_email=case when p_done then email end,completed_by_name=case when p_done then author end,revision=revision+1,updated_at=clock_timestamp(),updated_by_name=author where id=p_id returning * into row;
  return to_jsonb(row);
end;
$$;
revoke all on function public.save_clinic_task(uuid,integer,text,uuid,text,uuid,date) from public,anon;
revoke all on function public.set_clinic_task_completed(uuid,integer,boolean) from public,anon;
grant execute on function public.save_clinic_task(uuid,integer,text,uuid,text,uuid,date) to authenticated;
grant execute on function public.set_clinic_task_completed(uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
