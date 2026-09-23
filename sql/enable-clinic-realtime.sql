-- Run in Supabase SQL Editor after the existing clinic table migrations.
-- Sends a private, table-name-only notification when shared data changes.
-- No patient or appointment values are included in the broadcast.

DROP POLICY IF EXISTS clinic_realtime_receive ON realtime.messages;
CREATE POLICY clinic_realtime_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() = 'clinic:changes' AND extension = 'broadcast');

CREATE OR REPLACE FUNCTION public.clinic_notify_realtime()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM realtime.send(
    pg_catalog.jsonb_build_object('table', TG_TABLE_NAME),
    'changed', 'clinic:changes', true
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_notify_realtime() FROM PUBLIC;

-- Statement-level triggers send one message for each save, including bulk edits.
-- Skip optional tables that have not been installed in this clinic database.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'roster','staff','bank_staff','bank_staff_assignments','leave_records',
    'daily_attendance','appointments','patients','siting_sessions','siting_images',
    'operations_no_stoma','clinical_records','handover_snapshots',
    'public_holidays','localities','firms','complication_types',
    'clinic_pending_tasks','clinic_dated_reminders'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS clinic_realtime_changed ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER clinic_realtime_changed AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        || 'FOR EACH STATEMENT EXECUTE FUNCTION public.clinic_notify_realtime()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
