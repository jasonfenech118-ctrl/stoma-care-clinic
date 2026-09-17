-- =============================================================================
-- Daily Attendance — auto-saved staff attendance sheets
-- =============================================================================
-- Run this ONCE in Supabase SQL Editor (New query -> paste -> Run).
-- Safe to re-run. It creates the attendance archive used by:
--   Clinic Calendar -> Daily Attendance
--   Clinic Calendar -> Attendance Records
--
-- The roster remains the planned duty. This table records the daily sheet as it
-- appeared, together with the nurse's actual attendance, time in/out and remarks.
-- One row is kept per person per date.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.daily_attendance (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_date     date NOT NULL,
  person_key          text NOT NULL,
  staff_id            text,
  bank_staff_id       text,
  staff_name          text NOT NULL,
  staff_role          text,
  planned_code        text,
  planned_duty        text,
  planned_source      text,
  planned_hours       text,
  roster_notes        text,
  attendance_status   text NOT NULL DEFAULT 'not_recorded',
  time_in             time,
  time_out            time,
  remarks             text,
  updated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- These guards also bring an early copy of the table up to date if the script
-- is run again after the feature has been expanded.
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS staff_id          text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS bank_staff_id     text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS staff_role        text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS planned_code      text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS planned_duty      text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS planned_source    text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS planned_hours     text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS roster_notes      text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'not_recorded';
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS time_in            time;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS time_out           time;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS remarks            text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS updated_by         text;
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS created_at         timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.daily_attendance ADD COLUMN IF NOT EXISTS updated_at         timestamptz NOT NULL DEFAULT now();

-- The app upserts against this key, so refreshing a day updates its sheet and
-- never creates a duplicate row for the same member of staff.
CREATE UNIQUE INDEX IF NOT EXISTS daily_attendance_day_person_uidx
  ON public.daily_attendance (attendance_date, person_key);

CREATE INDEX IF NOT EXISTS daily_attendance_date_idx
  ON public.daily_attendance (attendance_date DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_attendance'::regclass
      AND conname = 'daily_attendance_status_check'
  ) THEN
    ALTER TABLE public.daily_attendance
      ADD CONSTRAINT daily_attendance_status_check
      CHECK (attendance_status IN (
        'not_recorded','present','late','left_early','absent','off_leave'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_attendance'::regclass
      AND conname = 'daily_attendance_remarks_length_check'
  ) THEN
    ALTER TABLE public.daily_attendance
      ADD CONSTRAINT daily_attendance_remarks_length_check
      CHECK (remarks IS NULL OR length(remarks) <= 500);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_daily_attendance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_attendance_touch_updated_at
  ON public.daily_attendance;
CREATE TRIGGER daily_attendance_touch_updated_at
  BEFORE UPDATE ON public.daily_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_daily_attendance_updated_at();

-- Staff attendance is available only after a clinic user has signed in.
REVOKE ALL ON public.daily_attendance FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_attendance TO authenticated;
ALTER TABLE public.daily_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_attendance_all ON public.daily_attendance;
CREATE POLICY daily_attendance_all
  ON public.daily_attendance
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.daily_attendance IS
  'Auto-saved daily staff attendance sheets; planned duty is kept separately from actual attendance.';
COMMENT ON COLUMN public.daily_attendance.person_key IS
  'Stable app key such as staff:<id> or bank:<id>, unique within an attendance date.';
COMMENT ON COLUMN public.daily_attendance.attendance_status IS
  'Actual attendance: not_recorded, present, late, left_early, absent or off_leave.';

NOTIFY pgrst, 'reload schema';

-- Confirmation: this should return daily_attendance and zero rows on first run.
SELECT 'daily_attendance' AS table_name, count(*) AS saved_staff_rows
FROM public.daily_attendance;
