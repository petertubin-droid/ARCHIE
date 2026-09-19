-- =========================================================
-- Phase 30: Worker Channels — Nationwide Price Updates & Chat
-- Worker-only group channels for sharing market prices and discussion
-- AI-powered moderation bot for content filtering
-- =========================================================

-- Worker channel categories (seeded, admin-configurable)
CREATE TABLE IF NOT EXISTS worker_channel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Worker channels (the actual group/channel rooms)
CREATE TABLE IF NOT EXISTS worker_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES worker_channel_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  region TEXT, -- e.g. 'Lagos', 'National', 'Abuja'
  icon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_official BOOLEAN NOT NULL DEFAULT false, -- official FRELUX channels
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channel members (who has joined which channel)
CREATE TABLE IF NOT EXISTS worker_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES worker_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', -- 'member', 'moderator', 'admin'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  muted_until TIMESTAMPTZ, -- moderation: mute a user
  UNIQUE(channel_id, user_id)
);

-- Channel messages (chat messages)
CREATE TABLE IF NOT EXISTS worker_channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES worker_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat', -- 'chat', 'price_update', 'system', 'moderation'
  -- Price update fields (nullable, only for message_type = 'price_update')
  price_item TEXT, -- e.g. '20L Premium Paint'
  price_amount NUMERIC(12, 2),
  price_currency TEXT DEFAULT 'NGN',
  price_location TEXT, -- e.g. 'Lagos Mainland'
  price_store TEXT, -- optional: store/market name
  -- Moderation
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT, -- e.g. 'spam', 'offensive', 'misinformation'
  flagged_by TEXT, -- 'ai_bot' or user UUID
  is_removed BOOLEAN NOT NULL DEFAULT false,
  removed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  -- Metadata
  reply_to UUID REFERENCES worker_channel_messages(id) ON DELETE SET NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message reactions (emoji reactions to messages)
CREATE TABLE IF NOT EXISTS worker_channel_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES worker_channel_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Moderation log (audit trail of all moderation actions)
CREATE TABLE IF NOT EXISTS worker_moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES worker_channel_messages(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES worker_channels(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'flag', 'remove', 'mute_user', 'unmute', 'restore'
  reason TEXT,
  performed_by TEXT NOT NULL, -- 'ai_bot' or user UUID
  ai_score NUMERIC(3, 2), -- AI confidence score 0.00-1.00
  ai_categories TEXT[], -- e.g. ['spam', 'offensive']
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI moderation settings (admin-configurable)
CREATE TABLE IF NOT EXISTS worker_moderation_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  auto_remove_threshold NUMERIC(3, 2) NOT NULL DEFAULT 0.85, -- auto-remove if AI score >= this
  auto_flag_threshold NUMERIC(3, 2) NOT NULL DEFAULT 0.60, -- auto-flag if AI score >= this
  banned_words TEXT[] NOT NULL DEFAULT '{}',
  banned_patterns TEXT[] NOT NULL DEFAULT '{}',
  warning_message TEXT NOT NULL DEFAULT 'Your message was flagged by the AI moderation system and is under review.',
  ai_provider TEXT NOT NULL DEFAULT 'openai', -- 'openai', 'anthropic', 'local'
  ai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- Indexes
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_worker_channels_category ON worker_channels(category_id);
CREATE INDEX IF NOT EXISTS idx_worker_channels_slug ON worker_channels(slug);
CREATE INDEX IF NOT EXISTS idx_worker_channels_active ON worker_channels(is_active);
CREATE INDEX IF NOT EXISTS idx_worker_channel_members_channel ON worker_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_worker_channel_members_user ON worker_channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_channel_messages_channel ON worker_channel_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_worker_channel_messages_user ON worker_channel_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_channel_messages_created ON worker_channel_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worker_channel_messages_flagged ON worker_channel_messages(is_flagged) WHERE is_flagged = true;
CREATE INDEX IF NOT EXISTS idx_worker_channel_messages_type ON worker_channel_messages(channel_id, message_type);
CREATE INDEX IF NOT EXISTS idx_worker_channel_reactions_message ON worker_channel_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_worker_moderation_log_channel ON worker_moderation_log(channel_id);
CREATE INDEX IF NOT EXISTS idx_worker_moderation_log_message ON worker_moderation_log(message_id);

-- =========================================================
-- Row Level Security
-- =========================================================

-- Profiles table has account_type: 'client' | 'pro_worker'
-- Only pro_worker accounts can access worker channels

ALTER TABLE worker_channel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_channel_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_channel_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_moderation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_moderation_config ENABLE ROW LEVEL SECURITY;

-- Categories: everyone can read (to show available channels)
DROP POLICY IF EXISTS "worker_categories_read_all" ON worker_channel_categories;
CREATE POLICY "worker_categories_read_all" ON worker_channel_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "worker_categories_admin_write" ON worker_channel_categories;
CREATE POLICY "worker_categories_admin_write" ON worker_channel_categories FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Channels: pro_workers can read active channels; admins can do everything
DROP POLICY IF EXISTS "worker_channels_read_pro" ON worker_channels;
CREATE POLICY "worker_channels_read_pro" ON worker_channels FOR SELECT USING (
  (is_active = true AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.account_type = 'pro_worker'
  )) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "worker_channels_admin_write" ON worker_channels;
CREATE POLICY "worker_channels_admin_write" ON worker_channels FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Members: pro_workers can join channels and read their memberships; admins can read all
DROP POLICY IF EXISTS "worker_members_read_self" ON worker_channel_members;
CREATE POLICY "worker_members_read_self" ON worker_channel_members FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "worker_members_insert_self" ON worker_channel_members;
CREATE POLICY "worker_members_insert_self" ON worker_channel_members FOR INSERT WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.account_type = 'pro_worker'
  )
);

DROP POLICY IF EXISTS "worker_members_delete_self" ON worker_channel_members;
CREATE POLICY "worker_members_delete_self" ON worker_channel_members FOR DELETE USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Messages: pro_workers can read non-removed messages in channels they've joined;
-- they can insert their own messages; they can update their own messages
DROP POLICY IF EXISTS "worker_messages_read" ON worker_channel_messages;
CREATE POLICY "worker_messages_read" ON worker_channel_messages FOR SELECT USING (
  is_removed = false AND EXISTS (
    SELECT 1 FROM worker_channel_members m WHERE m.channel_id = worker_channel_messages.channel_id AND m.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Admins can see removed messages too (for moderation review)
DROP POLICY IF EXISTS "worker_messages_read_admin" ON worker_channel_messages;
CREATE POLICY "worker_messages_read_admin" ON worker_channel_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "worker_messages_insert" ON worker_channel_messages;
CREATE POLICY "worker_messages_insert" ON worker_channel_messages FOR INSERT WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM worker_channel_members m WHERE m.channel_id = worker_channel_messages.channel_id AND m.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM worker_channel_members m WHERE m.channel_id = worker_channel_messages.channel_id AND m.user_id = auth.uid()
    AND m.muted_until IS NOT NULL AND m.muted_until > now()
  )
);

DROP POLICY IF EXISTS "worker_messages_update_own" ON worker_channel_messages;
CREATE POLICY "worker_messages_update_own" ON worker_channel_messages FOR UPDATE USING (
  user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Reactions: members can react, admins can see all
DROP POLICY IF EXISTS "worker_reactions_read" ON worker_channel_reactions;
CREATE POLICY "worker_reactions_read" ON worker_channel_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM worker_channel_members m
    JOIN worker_channel_messages msg ON msg.id = worker_channel_reactions.message_id
    WHERE m.channel_id = msg.channel_id AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "worker_reactions_insert" ON worker_channel_reactions;
CREATE POLICY "worker_reactions_insert" ON worker_channel_reactions FOR INSERT WITH CHECK (
  user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM worker_channel_members m
    JOIN worker_channel_messages msg ON msg.id = worker_channel_reactions.message_id
    WHERE m.channel_id = msg.channel_id AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "worker_reactions_delete_own" ON worker_channel_reactions;
CREATE POLICY "worker_reactions_delete_own" ON worker_channel_reactions FOR DELETE USING (
  user_id = auth.uid()
);

-- Moderation log: admins can read all, service role can insert
DROP POLICY IF EXISTS "worker_mod_log_read_admin" ON worker_moderation_log;
CREATE POLICY "worker_mod_log_read_admin" ON worker_moderation_log FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- Moderation config: admins can read/write, workers can read (for display)
DROP POLICY IF EXISTS "worker_mod_config_read" ON worker_moderation_config;
CREATE POLICY "worker_mod_config_read" ON worker_moderation_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "worker_mod_config_write" ON worker_moderation_config;
CREATE POLICY "worker_mod_config_write" ON worker_moderation_config FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- =========================================================
-- Realtime
-- =========================================================
ALTER TABLE worker_channel_messages REPLICA IDENTITY FULL;
ALTER TABLE worker_channel_reactions REPLICA IDENTITY FULL;
ALTER TABLE worker_channel_members REPLICA IDENTITY FULL;

-- =========================================================
-- Trigger: updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION update_worker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_worker_channels_updated ON worker_channels;
CREATE TRIGGER trg_worker_channels_updated BEFORE UPDATE ON worker_channels
  FOR EACH ROW EXECUTE FUNCTION update_worker_timestamp();

DROP TRIGGER IF EXISTS trg_worker_channel_messages_updated ON worker_channel_messages;
CREATE TRIGGER trg_worker_channel_messages_updated BEFORE UPDATE ON worker_channel_messages
  FOR EACH ROW EXECUTE FUNCTION update_worker_timestamp();

DROP TRIGGER IF EXISTS trg_worker_moderation_config_updated ON worker_moderation_config;
CREATE TRIGGER trg_worker_moderation_config_updated BEFORE UPDATE ON worker_moderation_config
  FOR EACH ROW EXECUTE FUNCTION update_worker_timestamp();

DROP TRIGGER IF EXISTS trg_worker_channel_categories_updated ON worker_channel_categories;
CREATE TRIGGER trg_worker_channel_categories_updated BEFORE UPDATE ON worker_channel_categories
  FOR EACH ROW EXECUTE FUNCTION update_worker_timestamp();

-- =========================================================
-- Seed: Default categories
-- =========================================================
INSERT INTO worker_channel_categories (name, slug, description, icon, sort_order) VALUES
  ('General Discussion', 'general', 'General discussion for all workers', 'MessagesSquare', 0),
  ('Price Updates', 'price-updates', 'Share and track paint/material prices across markets', 'TrendingUp', 1),
  ('Market Intelligence', 'market-intel', 'Market trends, supplier news, and shortage alerts', 'Newspaper', 2),
  ('Regional Networks', 'regional', 'Connect with workers in your region', 'MapPin', 3)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Seed: Default channels
-- =========================================================
INSERT INTO worker_channels (name, slug, description, region, icon, is_official, sort_order, category_id) VALUES
  (
    ' Nationwide Price Watch',
    'nationwide-price-watch',
    'Track paint and material prices across Nigeria. Share what you are paying in your market.',
    'National',
    'TrendingUp',
    true,
    0,
    (SELECT id FROM worker_channel_categories WHERE slug = 'price-updates')
  ),
  (
    'General Workers Hub',
    'general-workers-hub',
    'Open discussion for all FRELUX workers. Share tips, ask questions, connect.',
    'National',
    'MessagesSquare',
    true,
    0,
    (SELECT id FROM worker_channel_categories WHERE slug = 'general')
  ),
  (
    'Market Intelligence',
    'market-intelligence',
    'Supplier updates, shortage alerts, and market trends.',
    'National',
    'Newspaper',
    true,
    0,
    (SELECT id FROM worker_channel_categories WHERE slug = 'market-intel')
  )
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- Seed: Default moderation config
-- =========================================================
INSERT INTO worker_moderation_config (is_enabled, auto_remove_threshold, auto_flag_threshold, banned_words, warning_message) VALUES
  (
    true,
    0.85,
    0.60,
    '{}',
    'Your message was flagged by the AI moderation system and is under review. Please keep discussions professional and respectful.'
  )
ON CONFLICT DO NOTHING;

-- =========================================================
-- Grant permissions
-- =========================================================
GRANT SELECT ON worker_channel_categories TO anon, authenticated;
GRANT SELECT ON worker_channels TO authenticated;
GRANT SELECT, INSERT, DELETE ON worker_channel_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON worker_channel_messages TO authenticated;
GRANT SELECT, INSERT, DELETE ON worker_channel_reactions TO authenticated;
GRANT SELECT ON worker_moderation_config TO anon, authenticated;
GRANT SELECT ON worker_moderation_log TO authenticated;
-- =========================================================
-- RPC: Price Update Summaries (aggregated price data)
-- =========================================================
CREATE OR REPLACE FUNCTION get_price_update_summaries(
  p_channel_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  price_item TEXT,
  avg_price NUMERIC(12, 2),
  min_price NUMERIC(12, 2),
  max_price NUMERIC(12, 2),
  price_count BIGINT,
  latest_location TEXT,
  latest_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.price_item,
    AVG(m.price_amount)::NUMERIC(12, 2) AS avg_price,
    MIN(m.price_amount)::NUMERIC(12, 2) AS min_price,
    MAX(m.price_amount)::NUMERIC(12, 2) AS max_price,
    COUNT(*) AS price_count,
    (ARRAY_AGG(m.price_location ORDER BY m.created_at DESC))[1] AS latest_location,
    MAX(m.created_at) AS latest_date
  FROM worker_channel_messages m
  WHERE m.message_type = 'price_update'
    AND m.is_removed = false
    AND m.price_item IS NOT NULL
    AND (p_channel_id IS NULL OR m.channel_id = p_channel_id)
  GROUP BY m.price_item
  ORDER BY latest_date DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_price_update_summaries TO authenticated;
