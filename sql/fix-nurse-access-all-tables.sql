-- =============================================================================
-- FIX — every signed-in nurse sees the clinic data (not only Jason)
-- =============================================================================
-- SYMPTOM
--   A nurse you gave a login to (e.g. Erika Psaila) signs in and every screen is
--   EMPTY — the roster shows no core staff, Appointments and Registry are blank —
--   while Jason sees everything. The app shell loads; only the data is missing.
--
-- CAUSE
--   The newer tables (clinical_records, encounters, …) were already opened to
--   every signed-in nurse by earlier migrations. The ORIGINAL tables (patients,
--   appointments, staff, roster, …) were created in the Supabase dashboard long
--   ago, and their row-level-security policies were tied to Jason's own account.
--   So another nurse authenticates correctly but the policies match no rows and
--   she gets nothing back — which looks exactly like "blank screens".
--
-- WHAT THIS DOES
--   For every clinic DATA table it: grants access to anon + authenticated,
--   enables row-level security, removes the old account-specific policies, and
--   adds the same single permissive policy the newer tables already use
--   (readable/writable by anon and authenticated). It does NOT touch audit_log —
--   the audit trail stays restricted to Jason (sql/restrict-audits-to-jason.sql).
--
--   No patient data is read, changed or deleted — only table permissions.
--
-- HOW TO RUN
--   On a COMPUTER (not the phone): Supabase Dashboard -> SQL Editor ->
--   New query (empty) -> paste ALL of this -> Run. Safe to re-run.
-- =============================================================================

do $$
declare
  t text;
  pol record;
  tables text[] := array[
    'appointments','assessment_options','bank_staff','bank_staff_assignments',
    'clinic_app_access','clinic_dated_reminders','clinic_pending_tasks',
    'clinical_records','complication_types','daily_attendance','encounters',
    'firms','handover_snapshots','leave_records','localities',
    'operations_no_stoma','patient_communications','patient_discharge_letters',
    'patients','public_holidays','roster','siting_images','siting_sessions',
    'staff','surgical_rotation_current'
    -- NOTE: audit_log is deliberately NOT here — it stays Jason-only.
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then
      raise notice 'skipping %, not in this database', t;
      continue;
    end if;
    execute format('grant all on public.%I to anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    -- Remove whatever account-specific policies were on the table so a new nurse
    -- is no longer filtered out; these clinic data tables are shared by all nurses.
    for pol in
      select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, t);
    end loop;
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t||'_all_access', t);
    raise notice 'opened % to all signed-in nurses', t;
  end loop;
end $$;

-- Verify: one permissive ALL policy per existing table, for {anon,authenticated}.
select tablename, policyname, roles, cmd, permissive
from pg_policies
where schemaname='public' and policyname like '%\_all\_access'
order by tablename;
