-- Support referrals (Psychologist, Dietitian, Doctor / surgeon, Social worker)
-- kept on the PATIENT so they carry across episodes, encounters and visits:
-- [{id, profession, referred_on, referred_by, seen, seen_on, seen_by}].
-- Run ONCE in Supabase: SQL Editor -> New query (empty) -> paste -> Run. Safe to re-run.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS support_referrals jsonb;
