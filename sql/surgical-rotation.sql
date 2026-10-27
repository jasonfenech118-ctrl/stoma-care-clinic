create table public.surgical_rotation_current (
 id smallint primary key default 1 check (id=1),
 data jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 updated_by text not null default ''
);
alter table public.surgical_rotation_current enable row level security;
revoke all on public.surgical_rotation_current from anon, authenticated;
grant select,update on public.surgical_rotation_current to authenticated;
create policy clinic_members_read on public.surgical_rotation_current for select to authenticated using ((select private.is_clinic_member()));
create policy clinic_members_update on public.surgical_rotation_current for update to authenticated using ((select private.is_clinic_member())) with check ((select private.is_clinic_member()));
create function public.replace_surgical_rotation(rotation jsonb,expected_revision bigint,actor_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare saved public.surgical_rotation_current;
begin
 if auth.uid() is null then raise exception 'Please sign in again.'; end if;
 if rotation is null or pg_column_size(rotation)>1048576 or jsonb_typeof(rotation->'sections') is distinct from 'array' or jsonb_typeof(rotation->'columns') is distinct from 'array' then
   raise exception 'Invalid rotation format.';
 end if;
 if jsonb_array_length(rotation->'columns')<>5 or jsonb_array_length(rotation->'sections') not between 1 and 100 then raise exception 'Invalid rotation columns or specialties.'; end if;
 if exists(select 1 from jsonb_array_elements(rotation->'sections') s where jsonb_typeof(s->'rows') is distinct from 'array') then raise exception 'Invalid team rows.'; end if;
 if exists(select 1 from jsonb_array_elements(rotation->'sections') s cross join lateral jsonb_array_elements(s->'rows') r where jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>5) then raise exception 'Each team must have five columns.'; end if;
 if (select count(*) from jsonb_array_elements(rotation->'sections') s cross join lateral jsonb_array_elements(s->'rows') r) not between 1 and 1000 then raise exception 'Invalid number of team rows.'; end if;
 update public.surgical_rotation_current set data=rotation,revision=revision+1,updated_at=now(),updated_by=left(coalesce(actor_name,''),200)
 where id=1 and revision=expected_revision returning * into saved;
 if not found then raise exception 'The rotation changed in another session. Refresh and upload again.'; end if;
 return to_jsonb(saved)-'id';
end;
$$;
revoke all on function public.replace_surgical_rotation(jsonb,bigint,text) from public,anon;
grant execute on function public.replace_surgical_rotation(jsonb,bigint,text) to authenticated;
