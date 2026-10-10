-- App-wide compact recovery. Run after add-audit-log.sql and retention migration.
-- Recovery is private, trusted trigger data; public RPCs use the caller's RLS.
create schema if not exists clinic_private;
create table if not exists clinic_private.audit_recovery (
 audit_id uuid primary key references public.audit_log(id) on delete cascade,
 table_name text not null, pk_name text not null, pk_value text not null,
 operation text not null check(operation in ('UPDATE','DELETE')),
 before_values jsonb not null, after_values jsonb not null,
 transaction_id bigint not null, links jsonb not null default '[]',
 skipped_fields text[] not null default '{}', dependants jsonb not null default '[]', sequence bigint generated always as identity
);
create index if not exists audit_recovery_target_idx on clinic_private.audit_recovery(table_name,pk_value);
create index if not exists audit_recovery_transaction_idx on clinic_private.audit_recovery(transaction_id);
alter table clinic_private.audit_recovery enable row level security;
drop policy if exists clinic_recovery_read on clinic_private.audit_recovery;
create policy clinic_recovery_read on clinic_private.audit_recovery for select to authenticated using ((select private.is_clinic_member()));
revoke all on clinic_private.audit_recovery from public,anon,authenticated;
grant usage on schema clinic_private to authenticated;
grant select on clinic_private.audit_recovery to authenticated;

create or replace function clinic_private.recovery_value(t text,k text,v jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select case when t='encounters' and k='assessment' then v - array['versions','current_version'] else v end;
$$;
revoke all on function clinic_private.recovery_value(text,text,jsonb) from public,anon;
grant execute on function clinic_private.recovery_value(text,text,jsonb) to authenticated;

create or replace function clinic_private.capture_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 children jsonb:='[]'; child record; child_rows jsonb;
 b jsonb; a jsonb; bv jsonb:='{}'; av jsonb:='{}'; item record; aid uuid;
 skipped text[]:='{}'; refs jsonb:='[]'; pname text; pid text; email text;
 ignored text[]:=array['id','created_at','updated_at','created_by','created_by_email','created_by_name','updated_by','updated_by_email','updated_by_name','version','versions'];
begin
 if auth.uid() is null or not private.is_clinic_member() then return case when tg_op='DELETE' then old else new end; end if;
 b:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 a:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 if tg_op='DELETE' then
  for child in select ct.relname,sa.attname,cp.attname as pk
   from pg_catalog.pg_constraint fk join pg_catalog.pg_class ct on ct.oid=fk.conrelid join pg_catalog.pg_namespace ns on ns.oid=ct.relnamespace
   join lateral unnest(fk.conkey,fk.confkey) keys(src,dst) on true
   join pg_catalog.pg_attribute sa on sa.attrelid=ct.oid and sa.attnum=keys.src
   join pg_catalog.pg_attribute da on da.attrelid=tg_relid and da.attnum=keys.dst
   join pg_catalog.pg_index pi on pi.indrelid=ct.oid and pi.indisprimary
   join pg_catalog.pg_attribute cp on cp.attrelid=ct.oid and cp.attnum=any(pi.indkey)
   where fk.confrelid=tg_relid and fk.contype='f' and da.attname=tg_argv[0] and ns.nspname='public'
  loop
   execute format('select coalesce(jsonb_agg(jsonb_build_object(''table'',%L,''id'',%I::text,''field'',%L)),''[]''::jsonb) from public.%I where %I::text=$1',child.relname,child.pk,child.attname,child.relname,child.attname) into child_rows using b->>tg_argv[0];
   children:=children||child_rows;
  end loop;
 end if;
 if tg_op<>'INSERT' then
  for item in select key,value from jsonb_each(b) loop
   if tg_op='UPDATE' and (item.key=any(ignored) or clinic_private.recovery_value(tg_table_name,item.key,item.value) is not distinct from clinic_private.recovery_value(tg_table_name,item.key,a->item.key)) then continue; end if;
   -- No image copies, exports, or large binary/text payloads in the journal.
   if tg_table_name in ('siting_images','handover_snapshots') or (item.key ~* '(photo|image|avatar|base64)' and item.value not in ('null'::jsonb,'""'::jsonb)) or octet_length(item.value::text)>262144 then
    skipped:=array_append(skipped,item.key); continue;
   end if;
   bv:=bv||jsonb_build_object(item.key,case when tg_op='UPDATE' then clinic_private.recovery_value(tg_table_name,item.key,item.value) else item.value end);
   if tg_op='UPDATE' then av:=av||jsonb_build_object(item.key,clinic_private.recovery_value(tg_table_name,item.key,a->item.key)); end if;
  end loop;
  if tg_op='UPDATE' and bv='{}' and cardinality(skipped)=0 then return null; end if;
 end if;
 email:=lower(coalesce(auth.jwt()->>'email',''));
 pid:=coalesce((case when tg_op='DELETE' then b else a end)->>'patient_id',case when tg_table_name='patients' then coalesce(a->>tg_argv[0],b->>tg_argv[0]) end,'');
 pname:=concat_ws(' ',coalesce(a->>'first_name',b->>'first_name'),coalesce(a->>'surname',b->>'surname'));
 if pname='' and pid<>'' then select concat_ws(' ',first_name,surname) into pname from public.patients where id::text=pid; end if;
 insert into public.audit_log(at,actor,actor_email,action,entity,entity_id,patient_id,patient_name,summary,details)
 values(clock_timestamp(),initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g')),email,
 case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end,
 case when pid<>'' then 'patient' else tg_table_name end,coalesce(a->>tg_argv[0],b->>tg_argv[0]),pid,coalesce(pname,''),
 case when coalesce(current_setting('clinic.restore_source',true),'')<>'' then 'Restored ' else case tg_op when 'INSERT' then 'Added ' when 'DELETE' then 'Deleted ' else 'Edited ' end end||replace(tg_table_name,'_',' '),
 jsonb_build_object('recovery',tg_op<>'INSERT','source_table',tg_table_name,'restore_source',nullif(current_setting('clinic.restore_source',true),''),'fields',
 coalesce((select jsonb_agg(jsonb_build_object('label',replace(key,'_',' '),'value',case when jsonb_typeof(value) in ('string','number','boolean') then left(value #>> '{}',80) else '(updated)' end)) from jsonb_each(av)),'[]'::jsonb))) returning id into aid;
 if tg_op<>'INSERT' then
  select coalesce(jsonb_agg(jsonb_build_object('table',rt.relname,'id',b->>sa.attname)),'[]') into refs
  from pg_catalog.pg_constraint c join pg_catalog.pg_class rt on rt.oid=c.confrelid
  join lateral unnest(c.conkey,c.confkey) as keys(src,dst) on true
  join pg_catalog.pg_attribute sa on sa.attrelid=c.conrelid and sa.attnum=keys.src
  join pg_catalog.pg_attribute da on da.attrelid=c.confrelid and da.attnum=keys.dst
  where c.conrelid=tg_relid and c.contype='f' and da.attname in ('id','name','siting_id') and b->>sa.attname is not null;
  insert into clinic_private.audit_recovery(audit_id,table_name,pk_name,pk_value,operation,before_values,after_values,transaction_id,links,skipped_fields,dependants) values(aid,tg_table_name,tg_argv[0],b->>tg_argv[0],tg_op,bv,av,txid_current(),refs,skipped,children);
 end if;
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function clinic_private.capture_recovery() from public,anon,authenticated;

do $$ declare t text; pk text; begin
 foreach t in array array['patients','appointments','assessment_options','bank_staff','bank_staff_assignments','clinic_dated_reminders','clinic_pending_tasks','clinical_records','complication_types','daily_attendance','encounters','leave_records','localities','firms','handover_snapshots','operations_no_stoma','patient_communications','public_holidays','roster','siting_images','siting_sessions','staff'] loop
  if to_regclass('public.'||t) is null then continue; end if;
  pk:=case t when 'complication_types' then 'name' when 'siting_images' then 'siting_id' else 'id' end;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('public.'||t) and tgname='clinic_audit_capture_delete') then
   execute format('create trigger clinic_audit_capture_delete before delete on public.%I for each row execute function clinic_private.capture_recovery(%L)',t,pk);
  end if;
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('public.'||t) and tgname='clinic_audit_capture') then
   execute format('create trigger clinic_audit_capture after insert or update on public.%I for each row execute function clinic_private.capture_recovery(%L)',t,pk);
  end if;
 end loop;
end $$;

-- Connected deleted parents, cascading children and SET NULL updates share a
-- transaction. Unrelated records deleted in that transaction are not included.
create or replace function clinic_private.recovery_group(source uuid)
returns setof clinic_private.audit_recovery language sql stable security invoker set search_path='' as $$
 with recursive connected as (
  select r from clinic_private.audit_recovery r join public.audit_log l on l.id=r.audit_id where r.audit_id=source and l.at>=now()-interval '90 days'
  union
  select next from connected x join clinic_private.audit_recovery next on next.transaction_id=(x.r).transaction_id
   join public.audit_log l on l.id=next.audit_id and l.at>=now()-interval '90 days'
  where ((x.r).operation='DELETE' or next.operation='DELETE') and (
   next.links @> jsonb_build_array(jsonb_build_object('table',(x.r).table_name,'id',(x.r).pk_value)) or
   (x.r).links @> jsonb_build_array(jsonb_build_object('table',next.table_name,'id',next.pk_value)))
 ) select (r).* from connected;
$$;
revoke all on function clinic_private.recovery_group(uuid) from public,anon;
grant execute on function clinic_private.recovery_group(uuid) to authenticated;

create or replace function public.audit_restore_preview(source uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r clinic_private.audit_recovery; rows jsonb:='[]'; cur jsonb; fields jsonb; k text; selectable boolean; reason text;
begin
 if auth.uid() is null or not private.is_clinic_member() then raise exception 'Clinic sign-in required.' using errcode='42501'; end if;
 if not exists(select 1 from clinic_private.audit_recovery initial_recovery join public.audit_log l on l.id=initial_recovery.audit_id where initial_recovery.audit_id=source and l.at>=now()-interval '90 days') then raise exception 'This change has no recovery data, or its 90-day recovery period has expired.'; end if;
 for r in select * from clinic_private.recovery_group(source) loop
  execute format('select to_jsonb(t) from public.%I t where %I::text=$1',r.table_name,r.pk_name) into cur using r.pk_value;
  fields:='[]';
  for k in select jsonb_object_keys(r.before_values) loop
   reason:=null;
   if r.operation='UPDATE' then
    if cur is null then reason:='The record has since been deleted.';
    elsif clinic_private.recovery_value(r.table_name,k,cur->k)=r.before_values->k then reason:='Already restored.';
    elsif clinic_private.recovery_value(r.table_name,k,cur->k) is distinct from r.after_values->k then reason:='Changed again since this entry.';
    elsif exists(select 1 from clinic_private.audit_recovery later join public.audit_log ll on ll.id=later.audit_id join public.audit_log original on original.id=r.audit_id where later.table_name=r.table_name and later.pk_value=r.pk_value and later.audit_id<>r.audit_id and later.sequence>r.sequence and later.before_values ? k) then reason:='A later change exists for this field.';
    end if;
   elsif cur is not null then reason:='This ID already exists; it will not be overwritten.'; end if;
   fields:=fields||jsonb_build_array(jsonb_build_object('key',k,'before',r.before_values->k,'after',r.after_values->k,'current',clinic_private.recovery_value(r.table_name,k,cur->k),'available',reason is null,'reason',reason));
  end loop;
  -- Large/binary deleted records cannot be reconstructed exactly.
  selectable:=not(r.operation='DELETE' and cardinality(r.skipped_fields)>0);
  rows:=rows||jsonb_build_array(jsonb_build_object('audit_id',r.audit_id,'table',r.table_name,'id',r.pk_value,'operation',r.operation,'fields',fields,'skipped',r.skipped_fields,'available',selectable,'versioned',r.table_name in ('encounters','patient_communications')));
 end loop;
 return jsonb_build_object('source',source,'records',rows,'retention_days',90);
end;
$$;
revoke all on function public.audit_restore_preview(uuid) from public,anon;
grant execute on function public.audit_restore_preview(uuid) to authenticated;

create or replace function public.audit_restore_apply(source uuid, selected_fields text[], reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare dependent jsonb; matched boolean; r clinic_private.audit_recovery; original clinic_private.audit_recovery; cur jsonb; patch jsonb; k text; assignments text; cols text; pending uuid[]; done_ids uuid[]:='{}'; next_pending uuid[]; progress boolean; a jsonb; vers jsonb; n integer; email text; saved timestamptz:=clock_timestamp(); restored integer:=0;
begin
 if auth.uid() is null or not private.is_clinic_member() then raise exception 'Clinic sign-in required.' using errcode='42501'; end if;
 if length(trim(coalesce(reason,'')))<3 or length(reason)>1000 then raise exception 'Enter a reason for this restoration (3–1000 characters).'; end if;
 select r0.* into original from clinic_private.audit_recovery r0 join public.audit_log l on l.id=r0.audit_id where r0.audit_id=source and l.at>=now()-interval '90 days';
 if not found then raise exception 'Recovery data is unavailable or expired.'; end if;
 -- Serialize restores for this transaction group, then lock actual target rows.
 perform pg_advisory_xact_lock(original.transaction_id);
 perform set_config('clinic.restore_source',source::text,true);
 email:=lower(coalesce(auth.jwt()->>'email',''));
 if original.operation='DELETE' then
  for r in select * from clinic_private.recovery_group(source) where operation='DELETE' loop
   for dependent in select value from jsonb_array_elements(r.dependants) loop
    select exists(select 1 from clinic_private.recovery_group(source) member where member.table_name=dependent->>'table' and member.pk_value=dependent->>'id' and (member.operation='DELETE' or member.before_values ? (dependent->>'field'))) into matched;
    if not matched then raise exception 'A related recovery entry is missing or expired. No records were restored.'; end if;
   end loop;
  end loop;
  select array_agg(audit_id) into pending from clinic_private.recovery_group(source) where operation='DELETE';
  while cardinality(pending)>0 loop
   progress:=false; next_pending:='{}';
   foreach source in array pending loop
    select * into r from clinic_private.audit_recovery where audit_id=source;
    if exists(select 1 from clinic_private.audit_recovery parent where parent.audit_id=any(pending) and not(parent.audit_id=any(done_ids)) and parent.audit_id<>r.audit_id and r.links @> jsonb_build_array(jsonb_build_object('table',parent.table_name,'id',parent.pk_value))) then next_pending:=array_append(next_pending,source); continue; end if;
    if cardinality(r.skipped_fields)>0 then raise exception 'The deleted % record contains excluded photograph/export/large fields and cannot be restored exactly.',r.table_name; end if;
    execute format('select to_jsonb(t) from public.%I t where %I::text=$1 for update',r.table_name,r.pk_name) into cur using r.pk_value;
    if cur is not null then raise exception 'A % record already uses this ID. No records were restored.',r.table_name; end if;
    cols:=(select string_agg(format('%I',key),',') from jsonb_object_keys(r.before_values) key);
    begin
     perform set_config('clinic.restore_deleted',r.audit_id::text,true);
     execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1)',r.table_name,cols,cols,r.table_name) using r.before_values;
     done_ids:=array_append(done_ids,source); restored:=restored+1; progress:=true;
    exception when foreign_key_violation then next_pending:=array_append(next_pending,source);
    end;
   end loop;
   if not progress then raise exception 'A required related record is missing or outside the recovery period. No records were restored.'; end if;
   pending:=next_pending;
  end loop;
 end if;
 for r in select * from clinic_private.recovery_group(original.audit_id) where operation='UPDATE' order by table_name,pk_value loop
  execute format('select to_jsonb(t) from public.%I t where %I::text=$1 for update',r.table_name,r.pk_name) into cur using r.pk_value;
  if cur is null then raise exception 'The % record has since been deleted.',r.table_name; end if;
  patch:='{}';
  if original.operation='UPDATE' and r.audit_id<>original.audit_id then raise exception 'This change belongs to a related deletion. Restore the deleted parent entry instead.'; end if;
  for k in select jsonb_object_keys(r.before_values) loop
   if original.operation='UPDATE' and not(k=any(coalesce(selected_fields,'{}'))) then continue; end if;
   if clinic_private.recovery_value(r.table_name,k,cur->k)=r.before_values->k then continue; end if;
   if clinic_private.recovery_value(r.table_name,k,cur->k) is distinct from r.after_values->k then raise exception '% has changed again. Refresh the preview; nothing was overwritten.',replace(k,'_',' '); end if;
   if exists(select 1 from clinic_private.audit_recovery later join public.audit_log ll on ll.id=later.audit_id join public.audit_log firstlog on firstlog.id=r.audit_id where later.table_name=r.table_name and later.pk_value=r.pk_value and later.audit_id<>r.audit_id and later.sequence>r.sequence and later.before_values ? k) then raise exception 'A later change exists for %. Restore that later entry first.',k; end if;
   patch:=patch||jsonb_build_object(k,r.before_values->k);
  end loop;
  if original.operation='UPDATE' and exists(select 1 from unnest(coalesce(selected_fields,'{}')) key where not(r.before_values ? key)) then raise exception 'Invalid field selection.'; end if;
  -- A signed encounter correction appends a version; it never rewinds history.
  if r.table_name='encounters' and patch<>'{}' then
   if (r.before_values ? 'assessment' and not('assessment'=any(selected_fields))) or (r.before_values ? 'nursing_report' and not('nursing_report'=any(selected_fields))) then raise exception 'Select the encounter assessment and nursing report together.'; end if;
   a:=coalesce(patch->'assessment',cur->'assessment','{}'); vers:=coalesce(cur->'assessment'->'versions','[]');
   if jsonb_array_length(vers)=0 then vers:=jsonb_build_array(jsonb_build_object('version',1,'saved_at',cur->'created_at','author_email',cur->'created_by_email','author_name',cur->'created_by_name','snapshot',coalesce(cur->'assessment'->'snapshot',cur->'assessment'),'report',cur->'nursing_report')); end if;
   select coalesce(max((v->>'version')::integer),0)+1 into n from jsonb_array_elements(vers) v;
   a:=a||jsonb_build_object('current_version',n,'versions',vers||jsonb_build_array(jsonb_build_object('version',n,'saved_at',saved,'author_email',email,'author_name',initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g')),'snapshot',a->'snapshot','report',coalesce(patch->>'nursing_report',cur->>'nursing_report'),'restoration_reason',reason)));
   patch:=patch||jsonb_build_object('assessment',a);
  end if;
  if patch='{}' then continue; end if;
  assignments:=(select string_agg(format('%I=x.%I',key,key),',') from jsonb_object_keys(patch) key);
  execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I,$1) x where t.%I::text=$2',r.table_name,assignments,r.table_name,r.pk_name) using patch,r.pk_value;
  restored:=restored+1;
 end loop;
 if restored=0 then raise exception 'Select an available field to restore. Already-restored values are unchanged.'; end if;
 insert into public.audit_log(actor,actor_email,action,entity,entity_id,patient_id,patient_name,summary,details)
 select initcap(regexp_replace(split_part(email,'@',1),'[._-]+',' ','g')),email,'update',entity,entity_id,patient_id,patient_name,'Restoration: '||trim(reason),jsonb_build_object('restore_source',original.audit_id,'restored_records',restored) from public.audit_log where id=original.audit_id;
 perform set_config('clinic.restore_source','',true); perform set_config('clinic.restore_deleted','',true);
 return jsonb_build_object('restored_records',restored);
end;
$$;
revoke all on function public.audit_restore_apply(uuid,text[],text) from public,anon;
grant execute on function public.audit_restore_apply(uuid,text[],text) to authenticated;

-- Preserve authentic deleted communication signatures, and append a signed
-- restoration version. The original is fetched from the protected journal.
create or replace function clinic_private.deleted_communication(id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select r.before_values from clinic_private.audit_recovery r join public.audit_log l on l.id=r.audit_id
 where r.audit_id::text=current_setting('clinic.restore_deleted',true) and r.table_name='patient_communications' and r.pk_value=$1::text and r.operation='DELETE' and l.at>=now()-interval '90 days' and private.is_clinic_member();
$$;
revoke all on function clinic_private.deleted_communication(uuid) from public,anon;
grant execute on function clinic_private.deleted_communication(uuid) to authenticated;
do $$ declare definition text; begin
 if to_regprocedure('public.stamp_patient_communication()') is null then return; end if;
 definition:=pg_get_functiondef('public.stamp_patient_communication()'::regprocedure);
 if position('recovery_original' in definition)>0 then return; end if;
 definition:=replace(definition,'issue public.patient_communications%rowtype;','issue public.patient_communications%rowtype; recovery_original jsonb;');
 definition:=replace(definition,'author := initcap','if tg_op=''INSERT'' then recovery_original:=clinic_private.deleted_communication(new.id); end if; author := initcap');
 definition:=replace(definition,'elsif row(new.status', 'elsif tg_op=''UPDATE'' and row(new.status');
 definition:=replace(definition,'if tg_op=''INSERT'' then'||chr(10)||'      if issue.status=', 'if tg_op=''INSERT'' and recovery_original is null then'||chr(10)||'      if issue.status=');
 definition:=replace(definition,'new.created_at := saved_at; new.version := 1; new.versions := ''[]''::jsonb;', 'new.created_at := saved_at; new.version := 1; new.versions := ''[]''::jsonb;
    if recovery_original is not null then
      new.created_by:=(recovery_original->>''created_by'')::uuid; new.created_by_email:=recovery_original->>''created_by_email''; new.created_by_name:=recovery_original->>''created_by_name''; new.created_at:=(recovery_original->>''created_at'')::timestamptz;
      new.version:=(recovery_original->>''version'')::integer+1; new.versions:=recovery_original->''versions'';
    end if;');
 if position('recovery_original:=clinic_private.deleted_communication' in definition)=0 or position('new.versions:=recovery_original' in definition)=0 then raise exception 'Communication signature function differs; review before migration.'; end if;
 execute definition;
end $$;
