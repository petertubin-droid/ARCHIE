-- =========================================================
-- ARCHIE EMAIL CHANNEL (engine 13, audit E-3, tranche 2)
-- Same channel schema shape as WhatsApp/Telegram. Fresh-
-- database-safe (IF NOT EXISTS); RLS on all tables; the
-- channel is DISABLED until the Owner enables it and wires
-- a provider.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_email_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  retention_days integer NOT NULL DEFAULT 90,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.frelux_archie_email_settings
  ENABLE ROW LEVEL SECURITY;

INSERT INTO public.frelux_archie_email_settings (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Owner-linked addresses — mapping is done by the Owner;
-- emailing ARCHIE alone NEVER grants access.
CREATE TABLE IF NOT EXISTS public.frelux_archie_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
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
CREATE INDEX IF NOT EXISTS idx_archie_email_accounts_email
  ON public.frelux_archie_email_accounts (email);
ALTER TABLE public.frelux_archie_email_accounts
  ENABLE ROW LEVEL SECURITY;

-- Operational log — NOT persistent memory.
CREATE TABLE IF NOT EXISTS public.frelux_archie_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid
    REFERENCES public.frelux_archie_email_accounts (id)
    ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  smtp_message_id text,
  subject text,
  media_type text NOT NULL DEFAULT 'text'
    CHECK (media_type IN ('text', 'html-only', 'unsupported')),
  body text,
  status text NOT NULL
    CHECK (
      status IN ('received', 'processed', 'failed', 'sent', 'failed_send')
    ),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archie_email_messages_account
  ON public.frelux_archie_email_messages (account_id, created_at DESC);
ALTER TABLE public.frelux_archie_email_messages
  ENABLE ROW LEVEL SECURITY;

-- Idempotency — providers retry webhook deliveries.
CREATE TABLE IF NOT EXISTS public.frelux_archie_email_events (
  event_key text PRIMARY KEY,
  kind text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.frelux_archie_email_events
  ENABLE ROW LEVEL SECURITY;
