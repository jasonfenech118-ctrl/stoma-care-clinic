-- Make a retried encounter request return its committed result. Patch only the
-- save body: retain this installation's authentication, RLS, signing and grants.
-- No patient or encounter rows are changed by this migration.
do $migration$
declare
  signature regprocedure := 'public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  anchor text := '  if p_encounter_id is null then';
  recovery text := $recovery$
  -- Encounter save recovery: the patient lock above serializes retry checks.
  if p_snapshot ? 'save_request_id' then
    if jsonb_typeof(p_snapshot->'save_request_id') is distinct from 'string'
       or (p_snapshot->>'save_request_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Invalid encounter save request.' using errcode='22023';
    end if;
    select e.* into rec from public.encounters e
    where e.patient_id=p_patient_id::text and e.episode_id=p_episode_id::text
      and (p_encounter_id is null or e.id=p_encounter_id)
      and e.assessment @> jsonb_build_object('versions',jsonb_build_array(jsonb_build_object(
        'author_email',email,'snapshot',jsonb_build_object('save_request_id',p_snapshot->>'save_request_id'))))
    order by e.created_at desc limit 1;
    if found then return to_jsonb(rec); end if;
  elsif p_encounter_id is null and coalesce(ep.is_current,false) and ep.discharge_date is null then
    -- Older open tabs have no request ID. An identical repeated submission by
    -- the same nurse on the same day still must not create a second encounter.
    select e.* into rec from public.encounters e
    where e.patient_id=p_patient_id::text and e.episode_id=p_episode_id::text
      and e.created_by_email=email
      and e.encounter_date=(now_at at time zone 'Europe/Malta')::date
      and e.assessment->'snapshot'=p_snapshot
    order by e.created_at desc limit 1;
    if found then return to_jsonb(rec); end if;
  end if;
$recovery$;
begin
  if position('Encounter save recovery:' in definition)=0 then
    if position(anchor in definition)=0 or position('for update;' in definition)=0 then
      raise exception 'Encounter save function differs from the expected version; no changes applied.';
    end if;
    execute replace(definition,anchor,recovery || anchor);
  end if;
end;
$migration$;

-- Fail a busy row quickly and keep a save within the client's request window.
alter function public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb)
  set lock_timeout = '4s';
alter function public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb)
  set statement_timeout = '15s';
notify pgrst, 'reload schema';
