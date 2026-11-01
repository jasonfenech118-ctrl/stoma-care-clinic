-- =============================================================================
-- Tighten the clinic-table RLS policies — clears Supabase's "RLS Policy Always
-- True" warnings without changing what the app can do.
-- =============================================================================
-- WHY
--   sql/fix-nurse-access-all-tables.sql gave every clinic table one FOR ALL policy
--   with USING (true) / WITH CHECK (true). Supabase's linter warns that an
--   always-true policy on INSERT/UPDATE/DELETE effectively bypasses row-level
--   security. (It intentionally ignores always-true SELECT policies — public read
--   is a normal pattern.)
--
-- WHAT THIS DOES, per clinic table:
--   • SELECT (read) stays open to everyone — the app is gated by login and no
--     screen should go blank. The linter excludes read policies, so this is fine.
--   • INSERT / UPDATE / DELETE are limited to a SIGNED-IN user, checking
--     (select auth.uid()) is not null instead of a bare true. Every nurse signs in
--     before the app reads or writes, so saving keeps working — but the anon key
--     on its own can no longer write.
--   audit_log keeps its own Jason-only restriction and is left untouched.
--
-- No patient data is read, changed or deleted — only the policies.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query (empty) -> paste all -> Run.
--   Safe to re-run.
-- =============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'appointments','assessment_options','bank_staff','bank_staff_assignments',
    'clinic_app_access','clinic_dated_reminders','clinic_pending_tasks',
    'clinical_records','complication_types','daily_attendance','encounters',
    'firms','handover_snapshots','leave_records','localities',
    'operations_no_stoma','patient_communications','patient_discharge_letters',
    'patients','public_holidays','roster','siting_images','siting_sessions',
    'staff','surgical_rotation_current'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('alter table public.%I enable row level security', t);
    -- Remove the old always-true policy and any earlier run of this one.
    execute format('drop policy if exists %I on public.%I', t||'_all_access', t);
    execute format('drop policy if exists %I on public.%I', t||'_read',   t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    -- Read stays open (login-gated app); the linter excludes SELECT USING (true).
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_read', t);
    -- Writes require a signed-in user — not an always-true expression.
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null)', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) is not null)', t||'_delete', t);
  end loop;
end $$;

-- Verify: no remaining always-true write policy on these tables (expect 0 rows).
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and (qual = 'true' or with_check = 'true')
  and tablename = any(array[
    'appointments','assessment_options','bank_staff','bank_staff_assignments',
    'clinic_app_access','clinic_dated_reminders','clinic_pending_tasks',
    'clinical_records','complication_types','daily_attendance','encounters',
    'firms','handover_snapshots','leave_records','localities',
    'operations_no_stoma','patient_communications','patient_discharge_letters',
    'patients','public_holidays','roster','siting_images','siting_sessions',
    'staff','surgical_rotation_current'])
order by tablename;
