-- Make Jacqueline Sammut a co-administrator for the App Access Audit.
-- The original policy restricted reads of clinic_app_access to Jason's user id;
-- this widens it to also allow Jacqueline, matched by her account email (her
-- user id is not known here). The app already shows her the audit button; run
-- this once in Supabase so the records actually load for her.
-- If her login email is not jacqueline.sammut@gov.mt, change it below.
drop policy if exists app_access_jason_only on public.clinic_app_access;
drop policy if exists app_access_admins on public.clinic_app_access;
create policy app_access_admins on public.clinic_app_access for select to authenticated
  using (
    (select auth.uid()) = 'dd084e24-e851-4243-883d-f6404299585c'::uuid
    or lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'jacqueline.sammut@gov.mt'
  );
