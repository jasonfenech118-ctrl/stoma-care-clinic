-- Match the clinic's follow-up owner dropdown. Existing patients are unchanged.
BEGIN;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_followup_owner_check;
ALTER TABLE public.patients ADD CONSTRAINT patients_followup_owner_check
 CHECK (followup_owner IN ('Common','Jason','Jacqueline','Lorraine','Tracey'));
COMMIT;
