-- Patient outcome and future appointment cancellations commit together.
-- No backfill: existing patient statuses and historical visits are untouched.
-- Extend the existing cancellation-history validator; retain its audit rules.
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
        (NEW.cancellation_source='clinic' AND NEW.cancellation_reason IN ('availability','staff_unavailable','clinic_closed','schedule_change','other','deceased','reversed','discharged_gozo','relocated_overseas'))
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

-- These cancellations neither add a DNTU nor reset the existing DNTU flag.
CREATE OR REPLACE FUNCTION public.mdh_appointment_dntu_pause_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mdh_refresh_patient_dntu_pause(OLD.patient_id);
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'booked' AND NEW.status = 'cancelled'
     AND NEW.patient_id IS NOT DISTINCT FROM OLD.patient_id
     AND NEW.cancellation_source = 'clinic'
     AND NEW.cancellation_reason IN ('deceased','reversed','discharged_gozo','relocated_overseas') THEN
    RETURN NEW;
  END IF;
  PERFORM public.mdh_refresh_patient_dntu_pause(NEW.patient_id);
  IF TG_OP = 'UPDATE' AND OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
    PERFORM public.mdh_refresh_patient_dntu_pause(OLD.patient_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION clinic_private.cancel_appointments_for_patient_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  local_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Malta')::date;
  outcome_label text;
BEGIN
  IF NEW.followup_status IS NOT DISTINCT FROM OLD.followup_status
     OR NEW.followup_status IS NULL
     OR NEW.followup_status NOT IN ('deceased','reversed','discharged_gozo','relocated_overseas') THEN
    RETURN NEW;
  END IF;
  outcome_label := CASE NEW.followup_status
    WHEN 'deceased' THEN 'Deceased'
    WHEN 'reversed' THEN 'Reversed'
    WHEN 'discharged_gozo' THEN 'Discharged to Gozo'
    WHEN 'relocated_overseas' THEN 'Relocated Overseas'
  END;
  UPDATE public.appointments
     SET status = 'cancelled',
         cancellation_source = 'clinic',
         cancellation_reason = NEW.followup_status,
         cancellation_note = 'Automatically cancelled because the patient status changed to ' || outcome_label || '.',
         cancellation_date = local_today
   WHERE patient_id = NEW.id
     AND status = 'booked'
     AND appt_date >= local_today;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION clinic_private.cancel_appointments_for_patient_status() FROM PUBLIC;
DROP TRIGGER IF EXISTS cancel_appointments_for_patient_status ON public.patients;
CREATE TRIGGER cancel_appointments_for_patient_status
  AFTER UPDATE OF followup_status ON public.patients
  FOR EACH ROW
  WHEN (OLD.followup_status IS DISTINCT FROM NEW.followup_status)
  EXECUTE FUNCTION clinic_private.cancel_appointments_for_patient_status();
COMMENT ON FUNCTION clinic_private.cancel_appointments_for_patient_status() IS
  'Cancel only today/future booked appointments when an existing patient changes to a closed or transferred outcome, using caller permissions and the existing cancellation audit.';
