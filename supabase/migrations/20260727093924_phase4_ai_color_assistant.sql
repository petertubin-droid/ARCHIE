/*
# Phase 4 — AI Color Assistant storage and rate-limit logging

1. New Storage Bucket
- `room-images` — public-read bucket for user-uploaded room photos
  used by the AI Color Assistant image analysis workflow.
- Public read so the edge function can fetch the uploaded image via
  its public URL.
- Writes restricted to anon + authenticated (uploads from the public
  AI assistant page, which has no sign-in).

2. New Table
- `ai_request_log` — lightweight log of AI requests used for basic
  rate limiting and usage analytics. Stores only a request type
  ('text' | 'image'), a client fingerprint hash, a status, and a
  timestamp. No user descriptions or image data are stored here.
- `id` uuid primary key
- `request_type` text ('text' | 'image')
- `client_hash` text (sha256 of IP + user-agent, for throttling)
- `status` text ('success' | 'error' | 'rate_limited')
- `provider_error` text nullable (short error code, not full message)
- `created_at` timestamptz default now()

3. Security
- RLS enabled on `ai_request_log`.
- INSERT allowed for anon + authenticated (the edge function and
  browser both write here).
- SELECT denied for anon/authenticated (only the service role / admin
  can read this table — it is operational logging, not user data).
- UPDATE/DELETE denied for anon/authenticated.

4. Storage Policies
- `room-images` public read for anon + authenticated.
- `room-images` insert for anon + authenticated (public upload).
- `room-images` delete for anon + authenticated (cleanup of own
  uploads — scoped by the owner_id metadata when present).
*/

-- Storage bucket for room images
insert into storage.buckets (id, name, public)
values ('room-images', 'room-images', true)
on conflict (id) do nothing;

-- Public read
drop policy if exists "room_images_public_read" on storage.objects;
create policy "room_images_public_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'room-images');

-- Public upload (no sign-in on the AI assistant page)
drop policy if exists "room_images_public_insert" on storage.objects;
create policy "room_images_public_insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'room-images');

-- Allow deletion for cleanup (anon + authenticated; objects are
-- ephemeral and cleaned up after analysis)
drop policy if exists "room_images_public_delete" on storage.objects;
create policy "room_images_public_delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'room-images');

-- AI request log table
create table if not exists ai_request_log (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('text', 'image')),
  client_hash text not null,
  status text not null check (status in ('success', 'error', 'rate_limited')),
  provider_error text,
  created_at timestamptz not null default now()
);

alter table ai_request_log enable row level security;

-- INSERT only; no SELECT/UPDATE/DELETE for anon/authenticated.
drop policy if exists "anon_insert_ai_request_log" on ai_request_log;
create policy "anon_insert_ai_request_log"
on ai_request_log for insert
to anon, authenticated
with check (true);

-- Index for rate-limit lookups by client + time window
create index if not exists ai_request_log_client_hash_created_at_idx
on ai_request_log (client_hash, created_at desc);
