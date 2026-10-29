alter table public.patients add column if not exists stoma_care_links jsonb not null default '{}'::jsonb;
comment on column public.patients.stoma_care_links is 'Explicit stoma UID links for patient history records, keyed by record type and ID. Protected by existing patient row policies.';
