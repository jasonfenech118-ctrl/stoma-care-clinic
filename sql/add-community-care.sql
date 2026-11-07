-- Community care (Comcare) on discharge: whether the patient goes home with
-- community nursing, when that was decided, and when the care plan was emailed
-- to Comcare. Run once in Supabase. Until then the discharge still works but the
-- community-care decision and plan-sent date are not stored.
alter table patients add column if not exists community_care text;          -- 'yes' | 'no'
alter table patients add column if not exists community_care_date date;
alter table patients add column if not exists comcare_plan_sent_date date;
