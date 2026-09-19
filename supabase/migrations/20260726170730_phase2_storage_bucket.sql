/*
# Image storage bucket for color combinations

Creates a public storage bucket `color-images` for future image uploads
from the admin panel. In Phase 2 images are referenced by URL; this bucket
is prepared so the upload feature can be added later without reconfiguring
storage.

## Security
- Bucket is public (read access without auth) so published color images
  display on the public site.
- Writes are restricted to authenticated admins via a storage policy.
*/

insert into storage.buckets (id, name, public)
values ('color-images', 'color-images', true)
on conflict (id) do nothing;

-- Allow public read of color images
drop policy if exists "color_images_public_read" on storage.objects;
create policy "color_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'color-images');

-- Allow admins to upload/update/delete
drop policy if exists "color_images_admin_insert" on storage.objects;
create policy "color_images_admin_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'color-images' and public.is_admin());

drop policy if exists "color_images_admin_update" on storage.objects;
create policy "color_images_admin_update"
on storage.objects for update
to authenticated
using (bucket_id = 'color-images' and public.is_admin())
with check (bucket_id = 'color-images' and public.is_admin());

drop policy if exists "color_images_admin_delete" on storage.objects;
create policy "color_images_admin_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'color-images' and public.is_admin());
