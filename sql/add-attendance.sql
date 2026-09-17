-- =============================================================================
-- Daily staff attendance + archived attendance sheets
-- =============================================================================
-- Run this ONCE in the Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run: it only creates what is not already there, and re-applies the
-- grants/policies (which is why it must run in full even if the tables exist).
--
-- WHAT IT IS
--   Two tables behind the "Daily Attendance" and "Attendance Records" tabs
--   (under Clinic Calendar):
--
--     1. staff_attendance   — the live marks. One row per staff member per day:
--        who was Present / Absent / on leave / off, against what the roster
--        expected. Editing a day updates these rows (upsert on date + staff).
--
--     2. attendance_records — the archive. Each time a nurse presses
--        "Download daily attendance", the whole day's sheet is kept here as one
--        dated row (a JSON snapshot), so the exact sheet can be re-opened and
--        re-printed later. One row per day, replaced if the day is downloaded
--        again.
-- =============================================================================

-- 1. The live per-staff-per-day attendance marks.
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_date  date NOT NULL,
  staff_id         uuid,                       -- references staff.id (kept loose)
  staff_name       text NOT NULL,
  role             text,
  status           text NOT NULL DEFAULT 'present',  -- present/absent/annual_leave/sick_leave/study_leave/maternity_leave/off/overtime
  expected         text,                        -- the rostered code that day, for reference
  notes            text,
  recorded_by      text,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- One row per staff member per day; the app upserts on this pair.
  UNIQUE (attendance_date, staff_id)
);
CREATE INDEX IF NOT EXISTS staff_attendance_date_idx
  ON public.staff_attendance (attendance_date DESC);

-- 2. The archived daily sheets — one dated snapshot per day.
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date   date NOT NULL UNIQUE,          -- one archived copy per day
  snapshot      jsonb NOT NULL,                -- the day's rows + totals at download time
  present_count int,
  total_count   int,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attendance_records_date_idx
  ON public.attendance_records (record_date DESC);

-- Let the app read and manage both the same way the rest of the registry is
-- reached (anon key + a signed-in session). WITHOUT this block every write comes
-- back 403 and the app wrongly reports the table as missing, so it must run even
-- when the tables already exist — all of it is safe to re-run.
GRANT ALL ON public.staff_attendance   TO anon, authenticated;
GRANT ALL ON public.attendance_records TO anon, authenticated;

ALTER TABLE public.staff_attendance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_attendance_all ON public.staff_attendance;
CREATE POLICY staff_attendance_all ON public.staff_attendance
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS attendance_records_all ON public.attendance_records;
CREATE POLICY attendance_records_all ON public.attendance_records
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Confirm.
SELECT 'staff_attendance'   AS table, count(*) AS rows FROM public.staff_attendance
UNION ALL
SELECT 'attendance_records' AS table, count(*) AS rows FROM public.attendance_records;
