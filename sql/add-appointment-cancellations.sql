-- Run once in Supabase SQL Editor before deploying the cancellation form.
-- Safe to re-run. Existing cancellations stay unclassified; no dates, reasons
-- or staff identities are inferred. Existing appointment grants/RLS remain.
BEGIN;
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_source text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_note text,
  ADD COLUMN IF NOT EXISTS cancellation_date date,
  ADD COLUMN IF NOT EXISTS cancellation_recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_recorded_by text,
  ADD COLUMN IF NOT EXISTS cancellation_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cancellation_revision integer NOT NULL DEFAULT 0;

-- Match the existing appointment primary-key type, including older installs.
DO $$
DECLARE id_type text;
BEGIN
  SELECT format_type(atttypid,atttypmod) INTO id_type FROM pg_attribute
    WHERE attrelid='public.appointments'::regclass AND attname='id' AND NOT attisdropped;
  EXECUTE format('ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS rebooked_from_appointment_id %s REFERENCES public.appointments(id)',id_type);
END $$;
CREATE INDEX IF NOT EXISTS appointments_cancellation_report_idx
  ON public.appointments(appt_date,cancellation_source) WHERE status='cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_active_replacement_idx
  ON public.appointments(rebooked_from_appointment_id)
  WHERE rebooked_from_appointment_id IS NOT NULL AND status IS DISTINCT FROM 'cancelled';

-- A BEFORE trigger keeps the status, classification and audit in the same
-- row/transaction, using the caller's existing appointment permissions.
-- No security-definer function or new access policy is introduced.
CREATE OR REPLACE FUNCTION public.keep_appointment_cancellation_history()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
  old_cancelled boolean := false;
  changed boolean;
  action_name text;
  actor text := nullif(auth.jwt()->>'email','');
  stamp timestamptz := clock_timestamp();
  local_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Malta')::date;
  source_appt public.appointments%ROWTYPE;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.status='cancelled' OR jsonb_array_length(OLD.cancellation_history)>0 THEN
      RAISE EXCEPTION 'Cancellation history is retained. Use Undo cancellation to correct an error.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP='UPDATE' THEN
    old_cancelled := OLD.status='cancelled';
    NEW.cancellation_history := OLD.cancellation_history;
    NEW.cancellation_revision := OLD.cancellation_revision;
    NEW.cancellation_recorded_at := OLD.cancellation_recorded_at;
    NEW.cancellation_recorded_by := OLD.cancellation_recorded_by;
    IF jsonb_array_length(OLD.cancellation_history)>0 AND NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
      RAISE EXCEPTION 'An appointment with cancellation history cannot be transferred to another patient.';
    END IF;
    IF old_cancelled AND (NEW.appt_date IS DISTINCT FROM OLD.appt_date
        OR NEW.appt_slot IS DISTINCT FROM OLD.appt_slot OR NEW.patient_id IS DISTINCT FROM OLD.patient_id) THEN
      RAISE EXCEPTION 'Keep the original cancelled appointment. Use Rebook patient for a different appointment.';
    END IF;
    IF NEW.rebooked_from_appointment_id IS DISTINCT FROM OLD.rebooked_from_appointment_id THEN
      RAISE EXCEPTION 'The link to the original cancelled appointment cannot be changed.';
    END IF;
  ELSE
    NEW.cancellation_history := '[]'::jsonb;
    NEW.cancellation_revision := 0;
    NEW.cancellation_recorded_at := NULL;
    NEW.cancellation_recorded_by := NULL;
  END IF;

  IF NEW.rebooked_from_appointment_id IS NOT NULL AND TG_OP='INSERT' THEN
    SELECT * INTO source_appt FROM public.appointments WHERE id=NEW.rebooked_from_appointment_id FOR UPDATE;
    IF NOT FOUND OR source_appt.status IS DISTINCT FROM 'cancelled' OR source_appt.patient_id IS NULL
       OR source_appt.patient_id IS DISTINCT FROM NEW.patient_id THEN
      RAISE EXCEPTION 'The replacement must belong to the same patient and a cancelled appointment.';
    END IF;
  END IF;

  IF NEW.status='cancelled' THEN
    IF TG_OP='UPDATE' AND OLD.status NOT IN ('booked','cancelled') THEN
      RAISE EXCEPTION 'Only a booked appointment can be cancelled. Review the recorded outcome first.';
    END IF;
    NEW.cancellation_note := nullif(btrim(NEW.cancellation_note),'');
    changed := NOT old_cancelled;
    IF old_cancelled THEN
      changed := ROW(NEW.cancellation_source,NEW.cancellation_reason,NEW.cancellation_note,NEW.cancellation_date)
        IS DISTINCT FROM ROW(OLD.cancellation_source,OLD.cancellation_reason,OLD.cancellation_note,OLD.cancellation_date);
    END IF;
    IF changed THEN
      IF NEW.cancellation_source IS NULL OR NEW.cancellation_source NOT IN ('patient','clinic') THEN
        RAISE EXCEPTION 'Choose whether the patient or clinic requested the cancellation.';
      END IF;
      IF NEW.cancellation_reason IS NULL OR NOT (
        (NEW.cancellation_source='patient' AND NEW.cancellation_reason IN ('unavailable','unwell','transport','personal','not_given','other')) OR
        (NEW.cancellation_source='clinic' AND NEW.cancellation_reason IN ('availability','staff_unavailable','clinic_closed','schedule_change','other'))
      ) THEN RAISE EXCEPTION 'Choose a valid cancellation reason for this source.'; END IF;
      IF NEW.cancellation_reason='other' AND NEW.cancellation_note IS NULL THEN
        RAISE EXCEPTION 'Explain the cancellation reason in the note.';
      END IF;
      IF length(NEW.cancellation_note)>1000 THEN RAISE EXCEPTION 'Keep the cancellation note to 1000 characters or fewer.'; END IF;
      IF NEW.cancellation_date>local_today OR (NOT old_cancelled AND NEW.cancellation_date IS NULL) THEN
        RAISE EXCEPTION 'Enter a cancellation date, today or earlier.';
      END IF;
      action_name := CASE WHEN NOT old_cancelled THEN 'cancelled'
        WHEN OLD.cancellation_source IS NULL THEN 'classified' ELSE 'corrected' END;
    END IF;
  ELSE
    IF old_cancelled THEN
      IF NEW.status IS DISTINCT FROM 'booked' THEN
        RAISE EXCEPTION 'Undo the cancellation before recording a different appointment outcome.';
      END IF;
      IF EXISTS(SELECT 1 FROM public.appointments WHERE rebooked_from_appointment_id=OLD.id AND status IS DISTINCT FROM 'cancelled') THEN
        RAISE EXCEPTION 'This cancellation already has a replacement appointment. Review that booking first.';
      END IF;
      action_name := 'restored';
    END IF;
    -- Ordinary appointment edits cannot erase or rewrite cancellation details.
    IF TG_OP='UPDATE' THEN
      NEW.cancellation_source := OLD.cancellation_source;
      NEW.cancellation_reason := OLD.cancellation_reason;
      NEW.cancellation_note := OLD.cancellation_note;
      NEW.cancellation_date := OLD.cancellation_date;
    ELSE
      NEW.cancellation_source := NULL;NEW.cancellation_reason := NULL;
      NEW.cancellation_note := NULL;NEW.cancellation_date := NULL;
    END IF;
  END IF;

  IF action_name IS NOT NULL THEN
    NEW.cancellation_revision := NEW.cancellation_revision+1;
    NEW.cancellation_history := NEW.cancellation_history || jsonb_build_array(jsonb_build_object(
      'action',action_name,'recorded_at',stamp,'recorded_by',actor,'recorded_by_id',auth.uid(),
      'appt_date',NEW.appt_date,'appt_slot',NEW.appt_slot,'status',NEW.status,
      'cancellation_source',NEW.cancellation_source,'cancellation_reason',NEW.cancellation_reason,
      'cancellation_note',NEW.cancellation_note,'cancellation_date',NEW.cancellation_date));
    IF action_name<>'restored' THEN
      NEW.cancellation_recorded_at := stamp;NEW.cancellation_recorded_by := actor;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS appointments_cancellation_history ON public.appointments;
CREATE TRIGGER appointments_cancellation_history BEFORE INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.keep_appointment_cancellation_history();
COMMENT ON COLUMN public.appointments.cancellation_source IS 'Who requested the cancellation: patient or clinic; NULL means not recorded. Separate from staff recording it.';
COMMENT ON COLUMN public.appointments.cancellation_history IS 'Database-maintained cancellation audit trail; survives corrections, restoration and linked rebooking.';
COMMIT;
NOTIFY pgrst, 'reload schema';
