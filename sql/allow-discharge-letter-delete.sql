-- Allow signed-in clinic nurses to edit and delete saved discharge letters
-- (the Edit / Delete buttons on a patient's Discharge letters page).
-- Only needed if Delete says "the database did not allow the delete".
-- Safe to re-run. No patient data is read or changed, only permissions.
grant select, insert, update, delete on public.patient_discharge_letters to authenticated;
drop policy if exists clinic_edit_discharge_letters on public.patient_discharge_letters;
create policy clinic_edit_discharge_letters on public.patient_discharge_letters
  for update to authenticated using (true) with check (true);
drop policy if exists clinic_delete_discharge_letters on public.patient_discharge_letters;
create policy clinic_delete_discharge_letters on public.patient_discharge_letters
  for delete to authenticated using (true);
