-- Audit Trail retention: permanently delete audit entries older than 90 days.
-- Patient records, encounters, report versions and photographs are not touched.
-- Runs in the database every day at 02:15 UTC, even when the app is closed.
-- Safe to re-run: the named cron job is updated, not duplicated.
-- Requires sql/add-audit-log.sql first. Installed on the live database by Codex.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.prune_audit_log_90_days()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM public.audit_log
   WHERE at < CURRENT_TIMESTAMP - INTERVAL '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Keep this job's operational history small too; never clear other jobs.
  DELETE FROM cron.job_run_details
   WHERE jobid IN (
     SELECT jobid FROM cron.job WHERE jobname = 'stoma-audit-retention-90-days'
   )
     AND end_time < CURRENT_TIMESTAMP - INTERVAL '7 days';

  RETURN deleted_count;
END;
$function$;

-- Only the database owner/scheduler can run this maintenance function.
REVOKE ALL ON FUNCTION public.prune_audit_log_90_days() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_audit_log_90_days() FROM anon, authenticated, service_role;

SELECT cron.schedule(
  'stoma-audit-retention-90-days',
  '15 2 * * *',
  $$SELECT public.prune_audit_log_90_days();$$
);

-- Apply the same policy immediately to any existing expired entries.
SELECT public.prune_audit_log_90_days() AS expired_entries_deleted;
