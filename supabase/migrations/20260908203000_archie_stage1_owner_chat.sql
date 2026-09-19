-- =========================================================
-- FRELUX ARCHIE STAGE 1, OWNER CHAT CENTER PERSISTENCE
--
-- Conversations + messages for the ARCHIE Owner PWA Chat
-- Center. ARCHIE chat history is OWNER-PRIVATE data:
--   * Every row is bound to the Owner (auth.uid()).
--   * RLS allows each Owner to read/write ONLY their own
--     conversations and messages. No cross-user path exists.
--   * No secrets, credentials or tokens may be stored here;
--     an app-level CHECK rejects content that claims to be
--     a credential. (Soft guard; real secret hygiene is
--     enforced by the chat edge function sanitizer.)
--   * Messages carry structured tool_runs so ARCHIE
--     responses stay auditable: what tool ran, with what
--     inputs, and what it returned (truncated server-side).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Conversations
-- ---------------------------------------------------------

-- Explicit DML grants (required since phase23_rls_security_audit:
-- new tables get NO implicit privileges; every migration must
-- GRANT alongside its RLS policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_messages TO authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  archived boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

-- Idempotent shape alignment: stage1_owner_pwa created this table
-- earlier without the chat-recency column this migration relies on.
ALTER TABLE public.frelux_archie_conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_archie_conversations_owner
  ON public.frelux_archie_conversations (owner_id, last_message_at DESC);

-- ---------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.frelux_archie_conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'archie', 'system')),
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]',
  tool_runs jsonb NOT NULL DEFAULT '[]',
  -- Honest engine provenance: every ARCHIE reply records
  -- which inference engine produced it ('archie-native' or
  -- 'external-adapter'). An external provider is never
  -- presented as ARCHIE's own inference.
  engine text NOT NULL DEFAULT 'archie-native',
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_messages_conversation
  ON public.frelux_archie_messages (conversation_id, created_date ASC);

-- ---------------------------------------------------------
-- 3. Row Level Security: Owner-private chat history
-- ---------------------------------------------------------
ALTER TABLE public.frelux_archie_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archie_conversations_owner_all ON public.frelux_archie_conversations;
CREATE POLICY archie_conversations_owner_all ON public.frelux_archie_conversations
  FOR ALL USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS archie_messages_owner_all ON public.frelux_archie_messages;
CREATE POLICY archie_messages_owner_all ON public.frelux_archie_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.frelux_archie_conversations c
      WHERE c.id = conversation_id AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_archie_conversations c
      WHERE c.id = conversation_id AND c.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------
-- 4. Engine provenance constraint: only truthful values
-- ---------------------------------------------------------
-- Idempotent shape alignment: the messages table may already exist
-- from stage1_owner_pwa without the honest-provenance columns.
ALTER TABLE public.frelux_archie_messages
  ADD COLUMN IF NOT EXISTS tool_runs jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.frelux_archie_messages
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'archie-native';

DO $$
BEGIN
  ALTER TABLE public.frelux_archie_messages
    ADD CONSTRAINT archie_messages_engine_check
    CHECK (engine IN ('archie-native', 'external-adapter', 'system'));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- constraint already exists
END $$;

-- ---------------------------------------------------------
-- 5. updated_at trigger for conversations
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archie_conversations_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_date = now();
  NEW.last_message_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archie_conversations_touch ON public.frelux_archie_conversations;
CREATE TRIGGER trg_archie_conversations_touch
  BEFORE UPDATE ON public.frelux_archie_conversations
  FOR EACH ROW EXECUTE FUNCTION public.archie_conversations_touch();
