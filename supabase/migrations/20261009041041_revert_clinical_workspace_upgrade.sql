-- Undo only the 8 October clinical-workspace database additions.
-- Original patients, encounters, admissions and all shared tasks remain intact.
-- Stop rather than discard any upgrade data written since the preflight check.
set local lock_timeout = '5s';
lock table public.clinic_pending_tasks in access exclusive mode;
do $guard$
begin
  if to_regclass('public.clinic_encounter_drafts') is not null then
    lock table public.clinic_encounter_drafts in access exclusive mode;
    if exists(select 1 from public.clinic_encounter_drafts) then
      raise exception 'Rollback stopped: private drafts must be preserved before removing their table.';
    end if;
  end if;
  if exists(
    select 1 from public.clinic_pending_tasks t
    where nullif(to_jsonb(t)->>'patient_id','') is not null
       or nullif(to_jsonb(t)->>'stoma_uid','') is not null
       or nullif(to_jsonb(t)->>'assigned_staff_id','') is not null
       or nullif(to_jsonb(t)->>'assigned_name','') is not null
       or nullif(to_jsonb(t)->>'due_date','') is not null
       or coalesce(to_jsonb(t)->>'task_kind','general') <> 'general'
       or coalesce((to_jsonb(t)->>'revision')::integer,0) <> 0
       or nullif(to_jsonb(t)->>'updated_at','') is not null
       or nullif(to_jsonb(t)->>'updated_by_name','') is not null
  ) then
    raise exception 'Rollback stopped: task assignments must be preserved before removing their columns.';
  end if;
end;
$guard$;

drop function if exists public.save_clinic_encounter_draft(uuid,uuid,uuid,integer,jsonb,jsonb,integer);
drop function if exists public.save_clinic_task(uuid,integer,text,uuid,text,uuid,date);
drop function if exists public.set_clinic_task_completed(uuid,integer,boolean);
drop table if exists public.clinic_encounter_drafts;
drop index if exists public.clinic_tasks_patient_idx;
drop index if exists public.clinic_tasks_staff_due_idx;
drop index if exists public.clinic_tasks_due_idx;
alter table public.clinic_pending_tasks
  drop column if exists patient_id,
  drop column if exists stoma_uid,
  drop column if exists assigned_staff_id,
  drop column if exists assigned_name,
  drop column if exists due_date,
  drop column if exists task_kind,
  drop column if exists revision,
  drop column if exists updated_at,
  drop column if exists updated_by_name;
notify pgrst, 'reload schema';
