-- Read-only date evidence. Recomputed on every patient read; no manual flags,
-- patient-history rewrites, or copied reports. Existing table RLS applies.
CREATE OR REPLACE FUNCTION public.patient_documentation_dates(p_patient_ids text[])
RETURNS TABLE(patient_id text,surgery_date date,first_episode_date date,
 first_encounter_date date,first_episode_entered_date date,first_encounter_entered_date date)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT p.id::text,
 least(p.surgery_date,p.fistula_operation_date,
   (SELECT min(c.record_date) FROM public.clinical_records c WHERE c.patient_id=p.id AND c.kind='stoma')),
 ep.record_date,enc.encounter_date,
 (ep.created_at AT TIME ZONE 'Europe/Malta')::date,
 (enc.created_at AT TIME ZONE 'Europe/Malta')::date
 FROM public.patients p
 LEFT JOIN LATERAL (
   SELECT c.record_date,c.created_at FROM public.clinical_records c
   WHERE c.patient_id=p.id AND c.kind='episode'
   ORDER BY c.record_date NULLS LAST,c.created_at,c.id LIMIT 1
 ) ep ON true
 LEFT JOIN LATERAL (
   SELECT e.encounter_date,e.created_at FROM public.encounters e
   WHERE e.patient_id=p.id::text
   ORDER BY e.encounter_date NULLS LAST,e.created_at,e.id LIMIT 1
 ) enc ON true
 WHERE p.id=ANY(p_patient_ids::uuid[]) AND private.is_clinic_member();
$$;
REVOKE ALL ON FUNCTION public.patient_documentation_dates(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.patient_documentation_dates(text[]) TO authenticated;
COMMENT ON FUNCTION public.patient_documentation_dates(text[]) IS
 'Automatic documentation chronology; dates suggest coverage and do not establish whether a physical paper file exists.';
NOTIFY pgrst,'reload schema';
