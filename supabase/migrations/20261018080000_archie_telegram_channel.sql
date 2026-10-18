-- =========================================================
-- ARCHIE TELEGRAM CHANNEL (engine 13, audit E-3)
-- Mirrors the WhatsApp channel schema exactly: settings
-- kill switch, owner-linked accounts, operational message
-- log, and webhook idempotency events. Fresh-database-safe
-- (IF NOT EXISTS). All tables RLS-enabled; the service role
-- (edge functions) is the only writer.
-- =========================================================

-- 1. Channel settings — Owner kill switch (outbound channels
--    keep an explicit gate by owner directive).
CREATE TABLE IF NOT EXISTS public.frelux_archie_telegram_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  retention_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.frelux_archie_telegram_settings
  ENABLE ROW LEVEL SECURITY;

INSERT INTO public.frelux_archie_telegram_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- 2. Owner-linked chats — mapping a Telegram chat to an ARCHIE
--    profile is done by the Owner in the Admin console;
--    messaging the bot alone NEVER grants access.
CREATE TABLE IF NOT EXISTS public.frelux_archie_telegram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL UNIQUE,
  display_name text,
  user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('owner', 'authorized', 'family', 'customer')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  memory_permission boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_telegram_accounts_chat
  ON public.frelux_archie_telegram_accounts (chat_id);
ALTER TABLE public.frelux_archie_telegram_accounts
  ENABLE ROW LEVEL SECURITY;

-- 3. Conversation log — operational, not persistent memory.
CREATE TABLE IF NOT EXISTS public.frelux_archie_telegram_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid
    REFERENCES public.frelux_archie_telegram_accounts (id)
    ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  update_id bigint,
  media_type text NOT NULL DEFAULT 'text'
    CHECK (
      media_type IN (
        'text', 'audio', 'voice', 'photo', 'video', 'document',
        'sticker', 'location', 'contact', 'unsupported'
      )
    ),
  body text,
  status text NOT NULL
    CHECK (
      status IN ('received', 'processed', 'failed', 'sent', 'failed_send')
    ),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_telegram_messages_account
  ON public.frelux_archie_telegram_messages (account_id, created_at DESC);
ALTER TABLE public.frelux_archie_telegram_messages
  ENABLE ROW LEVEL SECURITY;

-- 4. Webhook idempotency — Telegram redelivers failed
--    deliveries. One event row per update id (PRIMARY KEY).
CREATE TABLE IF NOT EXISTS public.frelux_archie_telegram_events (
  event_key text PRIMARY KEY,
  kind text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.frelux_archie_telegram_events
  ENABLE ROW LEVEL SECURITY;
