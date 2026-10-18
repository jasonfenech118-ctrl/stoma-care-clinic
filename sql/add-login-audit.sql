-- Successful logins are captured by the server, never supplied by a browser.
begin;
create schema if not exists clinic_private;
create table if not exists public.clinic_login_audit (
  session_id uuid primary key,
  user_id uuid not null,
  email text not null,
  logged_in_at timestamptz not null
);
alter table public.clinic_login_audit enable row level security;
revoke all on public.clinic_login_audit from public, anon, authenticated;
grant select on public.clinic_login_audit to authenticated;
drop policy if exists login_audit_jason_only on public.clinic_login_audit;
create policy login_audit_jason_only on public.clinic_login_audit
  for select to authenticated
  using ((select auth.uid()) = 'dd084e24-e851-4243-883d-f6404299585c'::uuid);
create index if not exists clinic_login_audit_time on public.clinic_login_audit(logged_in_at desc, session_id);

-- This trigger needs owner privileges to read auth.users and insert an
-- immutable audit row. It is private and cannot be invoked by API users.
create or replace function clinic_private.capture_clinic_login()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.clinic_login_audit(session_id,user_id,email,logged_in_at)
  select new.id,new.user_id,coalesce(u.email,'Unknown account'),coalesce(new.created_at,now())
  from auth.users u where u.id=new.user_id
  on conflict(session_id) do nothing;
  return new;
end;
$$;
revoke all on function clinic_private.capture_clinic_login() from public,anon,authenticated;
drop trigger if exists clinic_capture_login on auth.sessions;
create trigger clinic_capture_login after insert on auth.sessions
  for each row execute function clinic_private.capture_clinic_login();

-- Match the clinic's existing 90-day audit retention period.
select cron.schedule('clinic-login-audit-retention','25 2 * * *',
  $$delete from public.clinic_login_audit where logged_in_at < now()-interval '90 days'$$);
commit;
