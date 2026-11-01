-- =============================================================================
-- Tighten the clinic-table RLS policies — clears Supabase's "RLS Policy Always
-- True" warnings, and keeps every nurse's access working.
-- =============================================================================
-- This is self-contained: it grants access AND sets the policies, so you can run
-- just this one (you do not have to run fix-nurse-access-all-tables.sql first).
--
-- Per clinic table:
--   • SELECT (read) stays open to everyone — the app is gated by login and no
--     screen goes blank. The linter ignores always-true read policies.
--   • INSERT / UPDATE / DELETE are limited to a SIGNED-IN user, checking
--     (select auth.uid()) is not null instead of a bare true — which is what
--     clears the warnings. Every nurse signs in before saving, so saving works.
--   audit_log keeps its own Jason-only restriction and is NOT touched here.
--
-- No patient data is read, changed or deleted — only grants and policies.
--
-- HOW TO RUN (important): open a NEW query, CLEAR the editor completely
--   (Ctrl/Cmd+A then Delete), paste ALL of this, then Run. Safe to re-run.
-- =============================================================================

do $do$
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
    -- Table-level grants (RLS still decides the rows): read for all, write for signed-in.
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    -- Replace the old always-true policy and any earlier run of this one.
    execute format('drop policy if exists %I on public.%I', t||'_all_access', t);
    execute format('drop policy if exists %I on public.%I', t||'_read',   t);
    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t||'_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) is not null)', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null)', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) is not null)', t||'_delete', t);
  end loop;
end
$do$;
