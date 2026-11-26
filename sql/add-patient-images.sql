-- =============================================================================
-- Patient images: pictures saved to a patient and linked to an inpatient
-- episode or encounter, a follow-up visit, a correspondence record or a stoma.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> New query -> paste ALL of
-- this -> Run. Safe to re-run. No existing patient data is read or changed.
-- Each command is on ONE line on purpose, so it can be pasted safely on a phone.
--
-- The pictures themselves go in a PRIVATE storage bucket, patient-images. Only
-- signed-in staff, not anonymous sessions, can see, add or delete them, through
-- links that expire. Pictures are shrunk by the app to a JPEG of about 100 to
-- 400 KB. Documents attached to an email, such as PDF, Word, Excel or text, are
-- kept as they are, up to 10 MB each.
-- =============================================================================

create table if not exists public.patient_images (id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade, link_kind text not null default '' check (link_kind in ('','episode','encounter','appointment','correspondence','stoma','email')), link_id text not null default '', link_label text not null default '', taken_on date, caption text not null default '', storage_path text not null unique, file_name text not null default '', mime text not null default 'image/jpeg', size_bytes integer not null default 0, width integer, height integer, created_by uuid default auth.uid(), created_by_name text not null default '', created_at timestamptz not null default now(), check (length(caption) <= 1000));
create index if not exists patient_images_patient on public.patient_images (patient_id, link_kind, link_id);

-- Signed-in clinic staff only, not anonymous sessions.
alter table public.patient_images enable row level security;
revoke all on public.patient_images from public, anon, authenticated;
grant select, insert, update, delete on public.patient_images to authenticated;
drop policy if exists patient_images_rw on public.patient_images;
create policy patient_images_rw on public.patient_images for all to authenticated using ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)) with check ((select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false) and exists (select 1 from public.patients p where p.id = patient_id));

-- The private picture store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('patient-images', 'patient-images', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']) on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'];
drop policy if exists patient_images_read on storage.objects;
create policy patient_images_read on storage.objects for select to authenticated using (bucket_id = 'patient-images' and (select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
drop policy if exists patient_images_add on storage.objects;
create policy patient_images_add on storage.objects for insert to authenticated with check (bucket_id = 'patient-images' and (select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
drop policy if exists patient_images_remove on storage.objects;
create policy patient_images_remove on storage.objects for delete to authenticated using (bucket_id = 'patient-images' and (select auth.uid()) is not null and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));

notify pgrst, 'reload schema';

-- Check: should list the new table and the private bucket.
select 'patient_images' as name, count(*) as items from public.patient_images union all select 'bucket ' || id, case when public then 1 else 0 end from storage.buckets where id = 'patient-images';
