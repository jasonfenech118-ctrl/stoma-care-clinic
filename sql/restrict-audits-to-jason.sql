begin;
alter table public.audit_log enable row level security;
drop policy if exists audit_read_jason_only on public.audit_log;
create policy audit_read_jason_only on public.audit_log as restrictive for select to authenticated
 using ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid);
drop policy if exists audit_update_jason_only on public.audit_log;
create policy audit_update_jason_only on public.audit_log as restrictive for update to authenticated
 using ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid)
 with check ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid);
drop policy if exists audit_delete_jason_only on public.audit_log;
create policy audit_delete_jason_only on public.audit_log as restrictive for delete to authenticated
 using ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid);
alter table clinic_private.audit_recovery enable row level security;
drop policy if exists recovery_read_jason_only on clinic_private.audit_recovery;
create policy recovery_read_jason_only on clinic_private.audit_recovery as restrictive for select to authenticated
 using ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid);
commit;
