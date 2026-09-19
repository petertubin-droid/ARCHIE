/*
# Contact Messages

1. New Table: contact_messages
   Stores submissions from the public contact form.
   - id (uuid, primary key)
   - name (text, not null) — submitter's name
   - email (text, not null) — submitter's email
   - subject (text, not null) — message subject
   - message (text, not null) — message body
   - status (text, default 'new') — tracking status: new, read, replied, archived
   - created_at (timestamptz, default now())

2. Security
   - RLS enabled.
   - INSERT: anon + authenticated (public form, no sign-in required).
   - SELECT/UPDATE/DELETE: admin only (via is_admin()).
*/

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_messages_public_insert" ON public.contact_messages;
CREATE POLICY "contact_messages_public_insert"
ON public.contact_messages FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "contact_messages_admin_select" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_select"
ON public.contact_messages FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "contact_messages_admin_update" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_update"
ON public.contact_messages FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contact_messages_admin_delete" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_delete"
ON public.contact_messages FOR DELETE
TO authenticated
USING (public.is_admin());
