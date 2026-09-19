-- =========================================================
-- FRELUX Premium Subscriptions Toggle
--
-- Adds premium_subscriptions_enabled to site_settings so the
-- admin can control whether the subscription paywall is live
-- or shows a "Coming Soon" message.
-- =========================================================

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS premium_subscriptions_enabled boolean DEFAULT false;
