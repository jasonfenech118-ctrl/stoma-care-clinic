-- Who holds the physical copy of the care plan on a community-care discharge
-- (e.g. "Ward nurse (Mary Borg)", "Patient", "Relative"). Set in the discharge
-- wizard's "physical copy" step. Run once in Supabase. Until then the discharge
-- still works but who holds the physical copy is not stored (it is still written
-- into the Comcare email body either way).
alter table patients add column if not exists care_plan_copy_with text;
