-- Phase 27: Push notification subscriptions + Google OAuth / email OTP support
-- This migration creates the push_subscriptions table for storing web push subscriptions.
-- NOTE: uses public.set_updated_at() — the shared trigger function already defined
-- in phase5_contractor_experience.sql. (Do NOT reference update_updated_at_column —
-- that function does not exist in this project.)
-- NOTE: pro_conversations uses customer_id (NOT client_id) — see phase25_pro_connect.sql.

-- Push subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT,
  auth_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint on endpoint — one subscription per browser/device
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions(endpoint);

-- Index for looking up subscriptions by user
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id)
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscriptions
DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Updated_at trigger (idempotent — safe to re-run)
DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- NOTIFICATION HELPERS
-- =============================================

-- Function to get active push subscriptions for a user
-- (used by edge functions to send notifications)
CREATE OR REPLACE FUNCTION public.get_user_push_subscriptions(p_user_id UUID)
RETURNS TABLE (endpoint TEXT, p256dh_key TEXT, auth_key TEXT)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT endpoint, p256dh_key, auth_key
  FROM public.push_subscriptions
  WHERE user_id = p_user_id AND is_active = true;
$$;

-- =============================================
-- MESSAGE NOTIFICATION TRIGGER
-- =============================================
-- When a new message is inserted into pro_messages, we want to notify the
-- recipient that they have a new message. The actual push sending is
-- handled by an edge function, but we create a helper function that the
-- edge function can call to get the recipient's subscriptions.

CREATE OR REPLACE FUNCTION public.get_message_recipient_subscriptions(p_conversation_id UUID)
RETURNS TABLE (endpoint TEXT, p256dh_key TEXT, auth_key TEXT, recipient_id UUID)
LANGUAGE sql SECURITY DEFINER
AS $$
  WITH conv AS (
    SELECT customer_id, professional_id FROM public.pro_conversations WHERE id = p_conversation_id
  )
  SELECT
    ps.endpoint, ps.p256dh_key, ps.auth_key,
    COALESCE(
      CASE WHEN pp.user_id IS NOT NULL THEN pp.user_id END,
      c.customer_id
    ) AS recipient_id
  FROM conv c
  JOIN public.pro_profiles pp ON pp.id = c.professional_id
  JOIN public.push_subscriptions ps ON ps.user_id = pp.user_id AND ps.is_active = true
  WHERE pp.user_id IS NOT NULL

  UNION

  SELECT
    ps.endpoint, ps.p256dh_key, ps.auth_key,
    c.customer_id AS recipient_id
  FROM conv c
  JOIN public.push_subscriptions ps ON ps.user_id = c.customer_id AND ps.is_active = true;
$$;

-- =============================================
-- NOTIFICATION PREFERENCES (optional)
-- =============================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  new_message_notify BOOLEAN NOT NULL DEFAULT true,
  verification_update_notify BOOLEAN NOT NULL DEFAULT true,
  review_notify BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notification prefs" ON public.notification_preferences;
CREATE POLICY "Users can manage own notification prefs" ON public.notification_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
