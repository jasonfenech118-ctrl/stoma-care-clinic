-- =============================================================================
-- FIX — the Audit Trail misses changes made by some nurses (e.g. Erika Psaila)
-- =============================================================================
-- SYMPTOM
--   Changes Erika (or another nurse given a login later) makes are saved, but
--   most of them never appear in Audit & Reports › Audit Trail.
--
-- CAUSE
--   The database recorder (trigger clinic_private.capture_recovery, from
--   add-audit-restore.sql) writes an audit line ONLY when
--   private.is_clinic_member() is true for the signed-in user. Nurses were later
--   given access to the clinic tables for every signed-in account
--   (fix-nurse-access-all-tables.sql / tighten-nurse-access-policies.sql), but
--   not added to that membership check — so their edits are saved and silently
--   left out of the trail.
--
-- WHAT THIS DOES
--   Re-creates the same recorder with one change: it records the change for ANY
--   signed-in user (anonymous writes are still skipped). Who may READ the trail is
--   unchanged (still Jason only — restrict-audits-to-jason.sql). No patient data
--   is read, changed or deleted. Changes made BEFORE this is run cannot be
--   recovered — the database never recorded them.
--
-- HOW TO RUN
--   On a COMPUTER: Supabase Dashboard -> SQL Editor -> New query (clear it) ->
--   paste ALL of this -> Run. Safe to re-run.
--
-- OPTIONAL CHECK (run separately, before or after): shows who the old
-- membership rule recognised.
--   select pg_get_functiondef('private.is_clinic_member'::regproc);
-- =============================================================================

create or replace function clinic_private.capture_recovery()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 children jsonb:='[]'; child record; child_rows jsonb;
 b jsonb; a jsonb; bv jsonb:='{}'; av jsonb:='{}'; item record; aid uuid;
 skipped text[]:='{}'; refs jsonb:='[]'; pname text; pid text; email text;
 ignored text[]:=array['id','created_at','updated_at','created_by','created_by_email','created_by_name','updated_by','updated_by_email','updated_by_name','version','versions'];
begin
 -- Record EVERY signed-in user's change (each nurse can edit the clinic tables,
 -- so each nurse's edits must be traced). Only anonymous writes are skipped.
 if auth.uid() is null then return case when tg_op='DELETE' then old else new end; end if;
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

-- Confirm: the recorder now only skips anonymous writes.
select position('is_clinic_member' in pg_get_functiondef('clinic_private.capture_recovery'::regproc))=0 as records_every_signed_in_nurse;
