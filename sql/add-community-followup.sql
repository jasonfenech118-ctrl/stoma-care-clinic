-- Community (Comcare) follow-up: an email-based follow-up saved in appointments.
-- Run once in Supabase. Until then the app degrades gracefully (a community
-- follow-up is saved as a normal booked appointment and feedback is not stored).
alter table appointments add column if not exists community_followup boolean default false;
alter table appointments add column if not exists community_reminder_note text;
alter table appointments add column if not exists comcare_email_sent_date date;
alter table appointments add column if not exists comcare_feedback text;
alter table appointments add column if not exists comcare_feedback_date date;
