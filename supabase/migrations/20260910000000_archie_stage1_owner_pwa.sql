-- =========================================================
-- FRELUX ARCHIE STAGE 1 — OWNER PWA, CONVERSATIONS,
-- DEVICES & AUDIT FOUNDATION
--
-- Owner-only data for the independent ARCHIE Personal
-- Intelligence PWA. All rows are OWNER-SCOPED (RLS:
-- auth.uid() = owner_id) — a subscriber can never read
-- another person's ARCHIE conversations, devices or audit
-- events, and ARCHIE knowledge never crosses scopes here.
--
-- Tables:
--  1. frelux_archie_conversations — Owner chat threads
--  2. frelux_archie_messages       — conversation turns
--     (role: owner | archie | tool | learning)
--  3. frelux_archie_devices        — trusted device registry
--     (PENDING → TRUSTED → REVOKED; app-generated identity
--      key, NEVER IMEI; server-side authorization)
--  4. frelux_archie_audit_events   — ARCHIE session/action
--     audit trail for the Owner Security Center
-- =========================================================

-- ---------------------------------------------------------
-- 1. Conversations
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New conversation',
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  message_count int NOT NULL DEFAULT 0,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_conversations_owner
  ON public.frelux_archie_conversations (owner_id, updated_date DESC);

ALTER TABLE public.frelux_archie_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access own conversations" ON public.frelux_archie_conversations;
CREATE POLICY "owner full access own conversations"
  ON public.frelux_archie_conversations FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.frelux_archie_conversations(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','archie','tool','learning')),
  content text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_messages_conversation
  ON public.frelux_archie_messages (conversation_id, created_date ASC);

ALTER TABLE public.frelux_archie_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner full access own messages" ON public.frelux_archie_messages;
CREATE POLICY "owner full access own messages"
  ON public.frelux_archie_messages FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- updated_date maintenance + message_count sync
CREATE OR REPLACE FUNCTION public.archie_touch_conversation()
RETURNS TRIGGER AS $$
BEGIN
  -- TG_OP is the reliable discriminator: on INSERT there is no OLD
  -- row, so a COALESCE comparison silently never bumps the count.
  IF TG_OP = 'INSERT' THEN
    UPDATE public.frelux_archie_conversations
      SET message_count = message_count + 1, updated_date = now()
      WHERE id = NEW.conversation_id;
  ELSE
    -- update: touch only
    UPDATE public.frelux_archie_conversations
      SET updated_date = now()
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_archie_touch_conversation ON public.frelux_archie_messages;
CREATE TRIGGER trg_archie_touch_conversation
  AFTER INSERT OR UPDATE ON public.frelux_archie_messages
  FOR EACH ROW EXECUTE FUNCTION public.archie_touch_conversation();

-- ---------------------------------------------------------
-- 3. Trusted devices (app identity key, NEVER IMEI)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_key text NOT NULL,
  label text NOT NULL DEFAULT 'Unnamed device',
  platform text,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','TRUSTED','REVOKED')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, device_key)
);

CREATE INDEX IF NOT EXISTS idx_archie_devices_owner
  ON public.frelux_archie_devices (owner_id, status);

ALTER TABLE public.frelux_archie_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manage own devices" ON public.frelux_archie_devices;
CREATE POLICY "owner manage own devices"
  ON public.frelux_archie_devices FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------
-- 4. ARCHIE audit events (Owner Security Center)
--    Written by the service role (archie-core edge function)
--    and by the owner's own session; never readable by
--    anyone but the owner.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO'
    CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_audit_owner
  ON public.frelux_archie_audit_events (owner_id, created_date DESC);

ALTER TABLE public.frelux_archie_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner read own audit events" ON public.frelux_archie_audit_events;
CREATE POLICY "owner read own audit events"
  ON public.frelux_archie_audit_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "owner insert own audit events" ON public.frelux_archie_audit_events;
CREATE POLICY "owner insert own audit events"
  ON public.frelux_archie_audit_events FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
