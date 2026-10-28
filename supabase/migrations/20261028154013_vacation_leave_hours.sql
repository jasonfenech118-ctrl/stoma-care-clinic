-- Hours remain hours; existing full-day leave and manual records are retained.
ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS leave_hours numeric;
ALTER TABLE public.roster ADD COLUMN IF NOT EXISTS leave_start_time time;
ALTER TABLE public.leave_records ADD COLUMN IF NOT EXISTS leave_hours numeric;
ALTER TABLE public.leave_records ADD COLUMN IF NOT EXISTS leave_start_time time;

ALTER TABLE public.roster DROP CONSTRAINT IF EXISTS roster_vacation_hours_check;
ALTER TABLE public.roster ADD CONSTRAINT roster_vacation_hours_check CHECK (
  (leave_hours IS NULL AND leave_start_time IS NULL) OR
  (leave_hours IS NOT NULL AND leave_start_time IS NOT NULL AND status='working'
   AND leave_hours>0 AND leave_hours<=24 AND leave_hours*4=trunc(leave_hours*4)
   AND extract(second FROM leave_start_time)=0
   AND extract(epoch FROM leave_start_time)/60+leave_hours*60<=1440)
);
ALTER TABLE public.leave_records DROP CONSTRAINT IF EXISTS leave_records_vacation_hours_check;
ALTER TABLE public.leave_records ADD CONSTRAINT leave_records_vacation_hours_check CHECK (
  (leave_hours IS NULL AND leave_start_time IS NULL) OR
  (leave_hours IS NOT NULL AND leave_start_time IS NOT NULL AND leave_type='annual_leave'
   AND start_date=end_date AND total_days=0 AND leave_hours>0 AND leave_hours<=24
   AND leave_hours*4=trunc(leave_hours*4)
   AND extract(second FROM leave_start_time)=0
   AND extract(epoch FROM leave_start_time)/60+leave_hours*60<=1440)
);

CREATE OR REPLACE FUNCTION clinic_private.prepare_roster_vacation_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.staff_id::text||':'||NEW.roster_date::text,0));
  -- Sick, rest, full-day leave and other duty changes also clear an earlier hours booking.
  IF NEW.status IS DISTINCT FROM 'working' THEN
    NEW.leave_hours:=NULL; NEW.leave_start_time:=NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION clinic_private.prepare_roster_vacation_hours() FROM PUBLIC;
DROP TRIGGER IF EXISTS roster_vacation_prepare ON public.roster;
CREATE TRIGGER roster_vacation_prepare BEFORE INSERT OR UPDATE ON public.roster
  FOR EACH ROW EXECUTE FUNCTION clinic_private.prepare_roster_vacation_hours();

CREATE OR REPLACE FUNCTION clinic_private.sync_roster_leave_record()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE kind text; wording text;
BEGIN
  IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND
      (OLD.staff_id IS DISTINCT FROM NEW.staff_id OR OLD.roster_date IS DISTINCT FROM NEW.roster_date)) THEN
    DELETE FROM public.leave_records WHERE staff_id=OLD.staff_id
      AND start_date=OLD.roster_date AND end_date=OLD.roster_date AND notes LIKE 'Auto roster:%';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  DELETE FROM public.leave_records WHERE staff_id=NEW.staff_id
    AND start_date=NEW.roster_date AND end_date=NEW.roster_date AND notes LIKE 'Auto roster:%';
  kind:=CASE WHEN NEW.leave_hours IS NOT NULL THEN 'annual_leave' ELSE NEW.status END;
  IF kind IN ('sick_leave','maternity_leave','study_leave','annual_leave') THEN
    wording:=CASE kind WHEN 'annual_leave' THEN 'Annual Leave' WHEN 'sick_leave' THEN 'Sick Leave'
      WHEN 'maternity_leave' THEN 'Maternity Leave' ELSE 'Study Leave' END;
    INSERT INTO public.leave_records(staff_id,leave_type,start_date,end_date,total_days,notes,leave_hours,leave_start_time)
      VALUES(NEW.staff_id,kind,NEW.roster_date,NEW.roster_date,
        CASE WHEN NEW.leave_hours IS NULL THEN 1 ELSE 0 END,
        'Auto roster: '||wording||CASE WHEN nullif(btrim(NEW.notes),'') IS NULL THEN '' ELSE ' — '||NEW.notes END,
        NEW.leave_hours,NEW.leave_start_time);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION clinic_private.sync_roster_leave_record() FROM PUBLIC;
DROP TRIGGER IF EXISTS roster_leave_sync ON public.roster;
CREATE TRIGGER roster_leave_sync AFTER INSERT OR UPDATE OR DELETE ON public.roster
  FOR EACH ROW EXECUTE FUNCTION clinic_private.sync_roster_leave_record();

-- Existing bookings are retained for review. A new/moved booking cannot use the leave window.
CREATE OR REPLACE FUNCTION clinic_private.check_appointment_vacation_hours()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE nurse uuid; matching_staff uuid[]; leave_row public.roster%ROWTYPE; slot_min numeric; leave_min numeric;
BEGIN
  IF NEW.status IS DISTINCT FROM 'booked' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.status='booked' AND
    ROW(OLD.patient_id,OLD.assigned_to,OLD.bank_staff_id,OLD.appt_date,OLD.appt_slot)
      IS NOT DISTINCT FROM ROW(NEW.patient_id,NEW.assigned_to,NEW.bank_staff_id,NEW.appt_date,NEW.appt_slot) THEN
    RETURN NEW;
  END IF;
  nurse:=NEW.assigned_to;
  IF nurse IS NULL AND NEW.bank_staff_id IS NOT NULL THEN
    SELECT array_agg(s.id) INTO matching_staff FROM public.staff s JOIN public.bank_staff b
      ON lower(btrim(s.full_name))=lower(btrim(b.full_name)) WHERE b.id=NEW.bank_staff_id;
    IF cardinality(matching_staff)=1 THEN nurse:=matching_staff[1]; END IF;
  END IF;
  IF nurse IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(nurse::text||':'||NEW.appt_date::text,0));
  SELECT * INTO leave_row FROM public.roster WHERE staff_id=nurse AND roster_date=NEW.appt_date;
  IF NOT FOUND OR leave_row.leave_hours IS NULL THEN RETURN NEW; END IF;
  slot_min:=extract(epoch FROM NEW.appt_slot)/60;
  leave_min:=extract(epoch FROM leave_row.leave_start_time)/60;
  IF slot_min<leave_min+leave_row.leave_hours*60 AND slot_min+30>leave_min THEN
    RAISE EXCEPTION 'This nurse has vacation leave during that appointment time. Choose a time outside the leave period or another nurse.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION clinic_private.check_appointment_vacation_hours() FROM PUBLIC;
DROP TRIGGER IF EXISTS appointments_vacation_hours ON public.appointments;
CREATE TRIGGER appointments_vacation_hours BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION clinic_private.check_appointment_vacation_hours();

COMMENT ON COLUMN public.roster.leave_hours IS 'Partial-day vacation leave duration in hours; status stays working outside that interval.';
COMMENT ON COLUMN public.leave_records.leave_hours IS 'Vacation leave hours, recorded separately from total_days (zero for an hours booking).';
