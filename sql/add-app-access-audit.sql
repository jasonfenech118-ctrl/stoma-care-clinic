-- App visits include automatic/restored sessions. Identity and times are server supplied.
begin;
create table if not exists public.clinic_app_access (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  email text not null,
  nurse_name text not null,
  accessed_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
alter table public.clinic_app_access enable row level security;
revoke all on public.clinic_app_access from public,anon,authenticated;
grant select on public.clinic_app_access to authenticated;
drop policy if exists app_access_jason_only on public.clinic_app_access;
create policy app_access_jason_only on public.clinic_app_access for select to authenticated
  using ((select auth.uid())='dd084e24-e851-4243-883d-f6404299585c'::uuid);
create index if not exists clinic_app_access_session on public.clinic_app_access(session_id,last_activity_at desc);
create index if not exists clinic_app_access_time on public.clinic_app_access(accessed_at desc,id);

-- Owner privileges allow immutable, self-only writes without exposing auth data.
create or replace function clinic_private.record_app_access()
returns void language plpgsql security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  sid uuid := nullif(auth.jwt()->>'session_id','')::uuid;
  account_email text;
  visit uuid;
begin
  if uid is null or sid is null or not exists(
    select 1 from auth.sessions s where s.id=sid and s.user_id=uid
      and (s.not_after is null or s.not_after>now())
  ) then raise exception 'A valid signed-in session is required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
  select email into account_email from auth.users where id=uid;
  select id into visit from public.clinic_app_access
    where session_id=sid and user_id=uid and last_activity_at>now()-interval '15 minutes'
    order by last_activity_at desc limit 1;
  if visit is null then
    insert into public.clinic_app_access(session_id,user_id,email,nurse_name)
    values(sid,uid,coalesce(account_email,'Unknown account'),
      initcap(replace(split_part(coalesce(account_email,'Unknown account'),'@',1),'.',' ')));
  else
    update public.clinic_app_access set last_activity_at=now() where id=visit;
  end if;
end;
$$;
revoke all on function clinic_private.record_app_access() from public,anon,authenticated;
grant usage on schema clinic_private to authenticated;
grant execute on function clinic_private.record_app_access() to authenticated;

create or replace function public.record_clinic_app_access()
returns void language sql security invoker set search_path='' as $$
  select clinic_private.record_app_access();
$$;
revoke all on function public.record_clinic_app_access() from public,anon,authenticated;
grant execute on function public.record_clinic_app_access() to authenticated;

select cron.schedule('clinic-app-access-retention','30 2 * * *',
  $$delete from public.clinic_app_access where last_activity_at<now()-interval '90 days'$$);
commit;
