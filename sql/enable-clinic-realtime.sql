-- Run in Supabase SQL Editor after the existing clinic table migrations.
-- Sends a private, table-name-only notification when shared data changes.
-- No patient or appointment values are included in the broadcast.

DROP POLICY IF EXISTS clinic_realtime_receive ON realtime.messages;
CREATE POLICY clinic_realtime_receive ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() = 'clinic:changes' AND extension = 'broadcast');

-- Keep privileged trigger code outside the exposed API schema.
CREATE SCHEMA IF NOT EXISTS clinic_private;
REVOKE ALL ON SCHEMA clinic_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION clinic_private.notify_realtime()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Only signed-in clinic writes notify clients; dashboard/service changes are
  -- picked up by the handover's periodic read without opening a broadcast API.
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  PERFORM realtime.send(
    pg_catalog.jsonb_build_object('table', TG_TABLE_NAME),
    'changed', 'clinic:changes', true
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION clinic_private.notify_realtime() FROM PUBLIC, anon, authenticated;

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
        || 'FOR EACH STATEMENT EXECUTE FUNCTION clinic_private.notify_realtime()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;
