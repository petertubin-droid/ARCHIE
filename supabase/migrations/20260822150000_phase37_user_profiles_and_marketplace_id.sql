-- =========================================================
-- Phase 37: User profile fields + avatar storage + marketplace ID
-- =========================================================
-- Adds full_name, phone, avatar_url, and a human-readable
-- marketplace_id (FRLX-XXXX-XXXX) to the profiles table so users
-- can edit their profile, upload a profile picture, and be
-- uniquely identified for the upcoming marketplace feature.

-- 1. Add profile columns
alter table public.profiles
  add column if not exists full_name text default '',
  add column if not exists phone text default '',
  add column if not exists avatar_url text default '',
  add column if not exists marketplace_id text;

-- 2. Backfill marketplace_id for existing users
-- Format: FRLX-XXXX-XXXX (alphanumeric, uppercase)
do $$
declare
  r record;
  new_id text;
begin
  for r in select id from public.profiles where marketplace_id is null loop
    new_id := 'FRLX-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);
    -- Ensure uniqueness
    while exists (select 1 from public.profiles where marketplace_id = new_id) loop
      new_id := 'FRLX-' ||
        substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
        substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);
    end loop;
    update public.profiles set marketplace_id = new_id where id = r.id;
  end loop;
end $$;

-- 3. Add unique index on marketplace_id
create unique index if not exists profiles_marketplace_id_unique
  on public.profiles (marketplace_id);

-- 4. Make marketplace_id NOT NULL (after backfill)
alter table public.profiles
  alter column marketplace_id set not null;

-- 5. Update handle_new_user trigger to generate marketplace_id
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_marketplace_id text;
begin
  -- Generate unique marketplace ID
  new_marketplace_id := 'FRLX-' ||
    substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
    substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);

  while exists (select 1 from public.profiles where marketplace_id = new_marketplace_id) loop
    new_marketplace_id := 'FRLX-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4) || '-' ||
      substr(replace(encode(gen_random_bytes(4), 'hex'), '-', ''), 1, 4);
  end loop;

  insert into public.profiles (id, email, role, account_type, marketplace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_metadata ->> 'role', 'user'),
    coalesce(new.raw_user_metadata ->> 'account_type', 'client'),
    new_marketplace_id
  );
  return new;
end $$;

-- Re-attach trigger (drop + recreate to pick up the new function)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Create avatars storage bucket (public read, auth users write own)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies for avatars bucket
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- 7. Add index for marketplace lookups
create index if not exists profiles_marketplace_id_idx
  on public.profiles (marketplace_id);
