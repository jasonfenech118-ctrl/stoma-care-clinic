-- =============================================================================
-- LAUNCH — everything the database needs for encounters, visit assessments,
-- visit reviews, support referrals and "+ Add other…" options, for EVERY nurse.
--
-- Run ONCE in Supabase on a computer (not the phone): SQL Editor -> New query
-- (empty) -> paste ALL of this -> Run. Safe to re-run; nothing saved is changed.
-- It is the four pieces below rolled together:
--   sql/add-visit-stoma-assessment.sql   visit stoma assessment + reviews
--   sql/add-assessment-options.sql       "+ Add other…" options shared
--   sql/add-support-referrals.sql        referrals kept on the patient
--   sql/open-encounters-to-all-nurses.sql encounters for every nurse, signed by name
-- =============================================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS stoma_assessment jsonb;

CREATE TABLE IF NOT EXISTS public.assessment_options (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), field text NOT NULL CHECK (field IN ('colour','output','skin')), name text NOT NULL, created_by text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (field, name));
GRANT ALL ON public.assessment_options TO anon, authenticated;
ALTER TABLE public.assessment_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_options_all ON public.assessment_options;
CREATE POLICY assessment_options_all ON public.assessment_options FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS support_referrals jsonb;

-- Encounters for every signed-in nurse (replaces the Jason-only check). Each
-- encounter and version is signed with the nurse's name, taken from the login
-- email (jacqueline.sammut@… → Jacqueline Sammut). Existing records stay intact.
-- A transaction keeps encounter revisions, episode appliances and patient care
-- together. SECURITY INVOKER retains the caller's existing RLS permissions.
create or replace function public.save_jason_encounter(
  p_patient_id uuid, p_episode_id uuid, p_encounter_id uuid,
  p_expected_version integer, p_snapshot jsonb, p_report text, p_impact jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  pat public.patients%rowtype;
  ep public.clinical_records%rowtype;
  rec public.encounters%rowtype;
  history jsonb;
  revision jsonb;
  n integer;
  now_at timestamptz := clock_timestamp();
  email text := lower(coalesce(auth.jwt()->>'email',''));
  author text := initcap(regexp_replace(split_part(lower(coalesce(auth.jwt()->>'email','')),'@',1),'[._-]+',' ','g'));
  published boolean;
  products jsonb := coalesce(p_impact->'appliances','[]'::jsonb);
  patient_patch jsonb := coalesce(p_impact->'patient_patch','{}'::jsonb);
  expected_patient jsonb := coalesce(p_impact->'expected_patient','{}'::jsonb);
  product jsonb;
  entries jsonb;
  key text;
begin
  if auth.uid() is null or email = '' then
    raise exception 'Sign in to record an encounter.' using errcode='42501';
  end if;
  if jsonb_typeof(p_snapshot) is distinct from 'object'
     or jsonb_typeof(p_snapshot->'stomas') is distinct from 'array'
     or jsonb_typeof(p_snapshot->'scope') is distinct from 'array'
     or jsonb_array_length(p_snapshot->'scope') = 0
     or pg_column_size(p_snapshot) > 500000 then
    raise exception 'Choose the stoma or stomas covered by the encounter.';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_snapshot->'scope') uid
       where not exists(select 1 from jsonb_array_elements(p_snapshot->'stomas') s where s->>'uid'=uid)) then
    raise exception 'The report includes a stoma that is not in the encounter.';
  end if;
  -- One lock order across all calls; no client-side partial writes.
  select * into pat from public.patients where id=p_patient_id for update;
  if not found then raise exception 'The patient could not be found.'; end if;
  select * into ep from public.clinical_records where id=p_episode_id and patient_id=p_patient_id and kind='episode' for update;
  if not found then raise exception 'The linked inpatient episode could not be found.'; end if;
  if p_encounter_id is null then
    if p_expected_version<>0 or not coalesce(ep.is_current,false) or ep.discharge_date is not null then
      raise exception 'This admission has closed. Refresh the patient before recording a new encounter.';
    end if;
    insert into public.encounters(patient_id,episode_id,episode_ref,encounter_date,created_by_email,created_by_name)
    values(p_patient_id::text,p_episode_id::text,ep.episode_ref,(now_at at time zone 'Europe/Malta')::date,email,author) returning * into rec;
    history := '[]'::jsonb;
    n := 0;
  else
    select * into rec from public.encounters where id=p_encounter_id for update;
    if not found or rec.patient_id<>p_patient_id::text or rec.episode_id<>p_episode_id::text then
      raise exception 'The encounter does not belong to this patient and episode.';
    end if;
    if jsonb_typeof(rec.assessment->'versions')='array' and jsonb_array_length(rec.assessment->'versions')>0 then
      history := rec.assessment->'versions';
    else
      -- Keep the original free-text encounter exactly, including its original
      -- assessment object, report, date and author, when first amended.
      history := jsonb_build_array(jsonb_build_object('version',1,'saved_at',rec.created_at,
        'author_email',rec.created_by_email,'author_name',rec.created_by_name,
        'snapshot',jsonb_build_object('notes',concat_ws(E'\n\n',nullif(rec.assessment->>'notes',''),nullif(rec.nursing_report,'')),
           'scope','[]'::jsonb,'stomas','[]'::jsonb,'infection',jsonb_build_object('status','Not recorded','organism',''),'referrals','[]'::jsonb),
        'report',rec.nursing_report,'legacy_assessment',rec.assessment));
    end if;
    n := jsonb_array_length(history);
    if n<>p_expected_version then
      raise exception 'This encounter has a newer saved version. Reopen it before editing; your changes were not overwritten.' using errcode='40001';
    end if;
    if rec.assessment->'snapshot'=p_snapshot then return to_jsonb(rec); end if;
  end if;
  -- Amending an older encounter/closed episode changes its history, never
  -- today's current appliances or alerts.
  published := coalesce(ep.is_current,false) and ep.discharge_date is null
    and not exists(select 1 from public.encounters e where e.episode_id=p_episode_id::text and e.id<>rec.id and e.created_at>rec.created_at);
  if published then
    if jsonb_array_length(products)>0 and coalesce(ep.appliances,'null'::jsonb) is distinct from coalesce(p_impact->'expected_appliances','null'::jsonb) then
      raise exception 'The appliance setup changed while you were editing. Reopen the encounter to use the latest setup.' using errcode='40001';
    end if;
    for key in select jsonb_object_keys(patient_patch) loop
      if key not in ('complications','rod_stoma_uid','rod_removal_date','rod_removed_date','inpatient_nurse_notes') then raise exception 'Unsupported clinical update.'; end if;
      if coalesce(to_jsonb(pat)->key,'null'::jsonb) is distinct from coalesce(expected_patient->key,'null'::jsonb) then
        raise exception 'The patient care record changed while you were editing. Reopen the encounter before saving.' using errcode='40001';
      end if;
    end loop;
    if jsonb_array_length(products)>0 then
      entries := case when jsonb_typeof(ep.appliances)='array' then ep.appliances
        when jsonb_typeof(ep.appliances)='object' then jsonb_build_array(ep.appliances) else '[]'::jsonb end;
      for product in select value from jsonb_array_elements(products) loop
        if not exists(select 1 from jsonb_array_elements(p_snapshot->'stomas') s where s->>'uid'=product->>'stoma_uid') then raise exception 'The appliance is not linked to a selected stoma.'; end if;
        product := product || jsonb_build_object('changed_on',rec.encounter_date,'changed_at',now_at,
          'changed_by',author,'encounter_id',rec.id,'encounter_version',n+1,'ward',pat.inpatient_ward,'bed',pat.inpatient_bed);
        -- Revisions replace their own contribution in place; they do not stack
        -- a second appliance selection for the same logical encounter.
        if exists(select 1 from jsonb_array_elements(entries) r where r->>'encounter_id'=rec.id::text and r->>'stoma_uid'=product->>'stoma_uid') then
          select coalesce(jsonb_agg(case when r->>'encounter_id'=rec.id::text and r->>'stoma_uid'=product->>'stoma_uid' then product else r end order by ord),'[]'::jsonb)
            into entries from jsonb_array_elements(entries) with ordinality a(r,ord);
        else entries := entries || jsonb_build_array(product); end if;
      end loop;
      update public.clinical_records set appliances=entries where id=ep.id;
      update public.patients set inpatient_notes=p_impact->>'ward_note',flange_due=nullif(p_impact->>'flange_due','')::date where id=pat.id;
    end if;
    if patient_patch?'complications' then update public.patients set complications=patient_patch->>'complications' where id=pat.id; end if;
    if patient_patch?'rod_stoma_uid' then
      update public.patients set rod_stoma_uid=patient_patch->>'rod_stoma_uid',
        rod_removal_date=nullif(patient_patch->>'rod_removal_date','')::date,
        rod_removed_date=nullif(patient_patch->>'rod_removed_date','')::date where id=pat.id;
    end if;
    if patient_patch?'inpatient_nurse_notes' then update public.patients set inpatient_nurse_notes=patient_patch->>'inpatient_nurse_notes' where id=pat.id; end if;
  end if;
  revision := jsonb_build_object('version',n+1,'saved_at',now_at,'author_email',email,'author_name',author,
    'snapshot',p_snapshot,'report',p_report,'published_current_care',published);
  update public.encounters set assessment=jsonb_build_object('schema',2,'current_version',n+1,'snapshot',p_snapshot,
    'notes',coalesce(p_snapshot->>'notes',''),'versions',history||jsonb_build_array(revision)),nursing_report=p_report
    where id=rec.id returning * into rec;
  return to_jsonb(rec);
end;
$$;
revoke all on function public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb) from public,anon;
grant execute on function public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb) to authenticated;

-- What landed (expect: 1, 1, assessment_options, and the function owner line).
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name='appointments' AND column_name='stoma_assessment') AS visit_column,
       (SELECT count(*) FROM information_schema.columns WHERE table_name='patients' AND column_name='support_referrals') AS referrals_column,
       to_regclass('public.assessment_options') AS options_table,
       (SELECT position('Sign in to record an encounter' in pg_get_functiondef('public.save_jason_encounter(uuid,uuid,uuid,integer,jsonb,text,jsonb)'::regprocedure))>0) AS encounters_open_to_all;
