-- =========================================================
-- ARCHIE WHATSAPP PERSONAL ASSISTANT — COMMUNICATION LAYER
-- Migration: 20260914100000
--
-- Owner directive 2026-09-10: WhatsApp becomes an official
-- communication interface into the EXISTING ARCHIE
-- intelligence system. It is NOT a second brain, and these
-- tables hold NO intelligence — only the communication
-- layer's own state:
--
--   * settings            — integration enablement + owner
--                           learning mode + retention
--   * accounts            — Owner-managed identity mapping
--                           (WhatsApp number → ARCHIE user)
--   * messages            — conversation log for continuity,
--                           delivery status and audit
--   * events              — webhook idempotency (Meta retries
--                           must never double-process)
--   * reminders           — owner reminders/tasks created via
--                           WhatsApp, delivered honestly
--
-- PRIVACY: all tables are service-role ONLY (RLS enabled, no
-- anon/authenticated policies). WhatsApp conversation data is
-- ARCHIE-owned, Owner-governed. Nothing here is public.
--
-- MEMORY GOVERNANCE: nothing in this migration creates a new
-- memory system. Persistent knowledge continues to live in
-- frelux_archie_native_facts (the ONE ARCHIE memory), reached
-- only through the existing learning/validation governance.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Integration settings (singleton row, id pinned to 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_whatsapp_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  owner_learning_mode boolean NOT NULL DEFAULT true,
  retention_days integer NOT NULL DEFAULT 365
    CHECK (retention_days BETWEEN 1 AND 3650),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.frelux_archie_whatsapp_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.frelux_archie_whatsapp_settings
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 2. Identity mapping — a WhatsApp number authorizes NOTHING
--    by itself. Only the Owner creates/activates mappings via
--    the Admin console. 'pending' numbers are not linked.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id text NOT NULL UNIQUE,
  display_name text,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('owner', 'authorized', 'family', 'customer')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  learning_mode boolean NOT NULL DEFAULT false,
  memory_permission boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_whatsapp_accounts_wa
  ON public.frelux_archie_whatsapp_accounts (wa_id);

ALTER TABLE public.frelux_archie_whatsapp_accounts
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 3. Conversation log — continuity, delivery status, audit.
--    This is an operational log, NOT persistent memory: rows
--    expire per the retention setting (Owner-governed).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: unknown-sender security audit rows carry no
  -- account mapping (their content is never stored).
  account_id uuid
    REFERENCES public.frelux_archie_whatsapp_accounts (id)
    ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  wa_message_id text UNIQUE,
  media_type text NOT NULL DEFAULT 'text'
    CHECK (
      media_type IN (
        'text', 'audio', 'image', 'video', 'document', 'sticker',
        'location', 'contact', 'unsupported'
      )
    ),
  body text,
  media_wa_id text,
  status text NOT NULL
    CHECK (
      status IN (
        'received', 'processed', 'failed', 'sent',
        'delivered', 'read', 'failed_send'
      )
    ),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_whatsapp_messages_account
  ON public.frelux_archie_whatsapp_messages (account_id, created_at DESC);

ALTER TABLE public.frelux_archie_whatsapp_messages
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 4. Webhook idempotency — Meta retries failed webhook
--    deliveries. A processed event id is inserted exactly
--    once (PRIMARY KEY), so a retry can never double-process
--    or double-reply.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_whatsapp_events (
  event_key text PRIMARY KEY,
  kind text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_whatsapp_events
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 5. Reminders & tasks created via WhatsApp. Delivery is
--    honest: due reminders are sent on the next inbound
--    activity (there is no scheduler inside this layer) and
--    the Admin console shows pending ones.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_whatsapp_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL
    REFERENCES public.frelux_archie_whatsapp_accounts (id)
    ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reminder'
    CHECK (kind IN ('reminder', 'task')),
  note text NOT NULL,
  due_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_whatsapp_reminders_due
  ON public.frelux_archie_whatsapp_reminders (delivered_at, due_at);

ALTER TABLE public.frelux_archie_whatsapp_reminders
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- 6. SELF-VERIFY — loud failure if anything is missing.
-- ---------------------------------------------------------
DO $$
DECLARE
  missing text;
BEGIN
  FOR missing IN
    SELECT t FROM unnest(ARRAY[
      'frelux_archie_whatsapp_settings',
      'frelux_archie_whatsapp_accounts',
      'frelux_archie_whatsapp_messages',
      'frelux_archie_whatsapp_events',
      'frelux_archie_whatsapp_reminders'
    ]) AS t
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = missing
      ) THEN
        RAISE EXCEPTION
          'ARCHIE WhatsApp migration incomplete: table % is missing',
          missing;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = missing
          AND rowsecurity = true
      ) THEN
        RAISE EXCEPTION
          'ARCHIE WhatsApp security violation: RLS is not enabled on %',
          missing;
      END IF;
    END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.frelux_archie_whatsapp_settings WHERE id = 1
  ) THEN
    RAISE EXCEPTION
      'ARCHIE WhatsApp settings singleton row is missing';
  END IF;
END $$;
