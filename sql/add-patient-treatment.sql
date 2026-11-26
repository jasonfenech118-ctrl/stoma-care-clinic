-- Patient profile › Treatment: the patient's current treatment (anti-hypertensives,
-- oral hypoglycaemic agents, insulin, other). Stored as one JSON value per patient.
-- Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to re-run.
-- No patient data is read or changed.
alter table public.patients add column if not exists treatment jsonb;
notify pgrst, 'reload schema';
