-- =========================================================
-- Phase 38A: Marketplace — Listings, Bids, Orders, Milestones
-- =========================================================
-- Closes the loop: client runs calculator → posts job →
-- verified pros bid → client accepts → order tracked to completion.
--
-- Reuses: pro_profiles (identity), pro_categories (categories),
-- pro_locations (geo), pro_conversations (messaging),
-- estimation_estimates / contractor_projects (source data).
-- =========================================================

-- =========================================================
-- 1. MARKETPLACE_LISTINGS — job posts by clients
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  title text NOT NULL,
  description text,

  -- Classification
  project_type text NOT NULL DEFAULT 'painting'
    CHECK (project_type IN ('painting','screeding','pop_ceiling','tiling','multi_trade')),
  category_id uuid REFERENCES pro_categories(id) ON DELETE SET NULL,

  -- Scope (auto-filled from estimate when available)
  scope_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimate_ref text,                  -- human ref into estimation_estimates
  project_ref uuid,                   -- FK to contractor_projects (added below)
  budget_min numeric,
  budget_max numeric,
  currency text NOT NULL DEFAULT 'NGN',

  -- Location
  location_state text,
  location_city text,
  location_area text,

  -- Lifecycle
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','open','awarded','in_progress','completed','cancelled','expired')),
  urgency text NOT NULL DEFAULT 'standard'
    CHECK (urgency IN ('standard','urgent','flexible')),

  -- Moderation / visibility
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  admin_removed boolean NOT NULL DEFAULT false,
  admin_notes text,

  -- Denormalized counters
  view_count int NOT NULL DEFAULT 0,
  bid_count int NOT NULL DEFAULT 0,

  -- Timing
  expires_at timestamptz,              -- auto-expire open listings after N days
  awarded_to uuid,                      -- pro_profile_id when a bid is accepted
  awarded_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_user ON marketplace_listings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_status ON marketplace_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_type ON marketplace_listings(project_type, status);
CREATE INDEX IF NOT EXISTS idx_ml_location ON marketplace_listings(location_state, location_city);
CREATE INDEX IF NOT EXISTS idx_ml_featured ON marketplace_listings(is_featured, status) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_ml_category ON marketplace_listings(category_id, status);

-- Add FK to contractor_projects (deferred because table may not exist yet in fresh installs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contractor_projects') THEN
    ALTER TABLE marketplace_listings
      ADD CONSTRAINT fk_ml_project_ref
      FOREIGN KEY (project_ref) REFERENCES contractor_projects(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Public can read active, non-removed, non-draft listings
DROP POLICY IF EXISTS "ml_public_read" ON marketplace_listings;
CREATE POLICY "ml_public_read"
  ON marketplace_listings FOR SELECT
  TO anon, authenticated
  USING (is_active AND NOT admin_removed AND status != 'draft');

-- Owner can read their own listings (including drafts)
DROP POLICY IF EXISTS "ml_owner_read" ON marketplace_listings;
CREATE POLICY "ml_owner_read"
  ON marketplace_listings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Owner can insert
DROP POLICY IF EXISTS "ml_owner_insert" ON marketplace_listings;
CREATE POLICY "ml_owner_insert"
  ON marketplace_listings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Owner can update their own listings
DROP POLICY IF EXISTS "ml_owner_update" ON marketplace_listings;
CREATE POLICY "ml_owner_update"
  ON marketplace_listings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Owner can delete their own listings
DROP POLICY IF EXISTS "ml_owner_delete" ON marketplace_listings;
CREATE POLICY "ml_owner_delete"
  ON marketplace_listings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Admin can manage all
DROP POLICY IF EXISTS "ml_admin_all" ON marketplace_listings;
CREATE POLICY "ml_admin_all"
  ON marketplace_listings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 2. MARKETPLACE_BIDS — pro workers bid on listings
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  pro_profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,

  -- Bid details
  proposed_price numeric NOT NULL,
  proposed_timeline_days int,
  cover_message text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{url, name, type}]

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','withdrawn')),

  -- Response
  rejected_at timestamptz,
  rejected_reason text,
  accepted_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mb_listing_pro_unique
  ON marketplace_bids(listing_id, pro_profile_id);

CREATE INDEX IF NOT EXISTS idx_mb_listing ON marketplace_bids(listing_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mb_pro ON marketplace_bids(pro_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_mb_status ON marketplace_bids(status);

ALTER TABLE marketplace_bids ENABLE ROW LEVEL SECURITY;

-- Public can read bids on open/awarded listings (so people see competition)
DROP POLICY IF EXISTS "mb_public_read" ON marketplace_bids;
CREATE POLICY "mb_public_read"
  ON marketplace_bids FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE id = marketplace_bids.listing_id
      AND status IN ('open','awarded','in_progress','completed')
    )
  );

-- Pro worker can insert their own bid (must be verified + listed)
DROP POLICY IF EXISTS "mb_pro_insert" ON marketplace_bids;
CREATE POLICY "mb_pro_insert"
  ON marketplace_bids FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_bids.pro_profile_id
      AND user_id = auth.uid()
      AND is_listed = true
      AND verification_status IN ('verified','pending')
    )
    AND NOT EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE id = marketplace_bids.listing_id
      AND user_id = auth.uid()  -- can't bid on own listing
    )
  );

-- Pro worker can update/withdraw their own bid
DROP POLICY IF EXISTS "mb_pro_update" ON marketplace_bids;
CREATE POLICY "mb_pro_update"
  ON marketplace_bids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_bids.pro_profile_id
      AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_bids.pro_profile_id
      AND user_id = auth.uid()
    )
  );

-- Listing owner can update bid status (accept/reject)
DROP POLICY IF EXISTS "mb_owner_update" ON marketplace_bids;
CREATE POLICY "mb_owner_update"
  ON marketplace_bids FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE id = marketplace_bids.listing_id
      AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE id = marketplace_bids.listing_id
      AND user_id = auth.uid()
    )
  );

-- Pro worker can delete their own bid
DROP POLICY IF EXISTS "mb_pro_delete" ON marketplace_bids;
CREATE POLICY "mb_pro_delete"
  ON marketplace_bids FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_bids.pro_profile_id
      AND user_id = auth.uid()
    )
  );

-- Admin can manage all bids
DROP POLICY IF EXISTS "mb_admin_all" ON marketplace_bids;
CREATE POLICY "mb_admin_all"
  ON marketplace_bids FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 3. MARKETPLACE_ORDERS — the transaction record
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  bid_id uuid NOT NULL REFERENCES marketplace_bids(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pro_profile_id uuid NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,

  -- Agreement
  agreed_price numeric NOT NULL,
  agreed_timeline_days int,
  agreement_terms text,
  currency text NOT NULL DEFAULT 'NGN',

  -- Payment tracking (future-ready)
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','deposit_paid','partially_paid','fully_paid','refunded')),

  -- Lifecycle
  status text NOT NULL DEFAULT 'pending_start'
    CHECK (status IN ('pending_start','in_progress','client_review','completed','disputed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  cancel_initiated_by text,

  -- Reviews
  client_rating int CHECK (client_rating IS NULL OR (client_rating >= 1 AND client_rating <= 5)),
  client_review text,
  client_reviewed_at timestamptz,
  pro_rating int CHECK (pro_rating IS NULL OR (pro_rating >= 1 AND pro_rating <= 5)),
  pro_review text,
  pro_reviewed_at timestamptz,

  -- Metadata
  order_number text NOT NULL UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mo_client ON marketplace_orders(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mo_pro ON marketplace_orders(pro_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mo_listing ON marketplace_orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_mo_status ON marketplace_orders(status);

ALTER TABLE marketplace_orders ENABLE ROW LEVEL SECURITY;

-- Client and pro can read their own orders
DROP POLICY IF EXISTS "mo_participant_read" ON marketplace_orders;
CREATE POLICY "mo_participant_read"
  ON marketplace_orders FOR SELECT
  TO authenticated
  USING (
    client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_orders.pro_profile_id
      AND user_id = auth.uid()
    )
  );

-- Client can insert order (when accepting a bid)
DROP POLICY IF EXISTS "mo_client_insert" ON marketplace_orders;
CREATE POLICY "mo_client_insert"
  ON marketplace_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM marketplace_listings
      WHERE id = marketplace_orders.listing_id
      AND user_id = auth.uid()
    )
  );

-- Both participants can update
DROP POLICY IF EXISTS "mo_participant_update" ON marketplace_orders;
CREATE POLICY "mo_participant_update"
  ON marketplace_orders FOR UPDATE
  TO authenticated
  USING (
    client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_orders.pro_profile_id
      AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pro_profiles
      WHERE id = marketplace_orders.pro_profile_id
      AND user_id = auth.uid()
    )
  );

-- Admin can manage all orders
DROP POLICY IF EXISTS "mo_admin_all" ON marketplace_orders;
CREATE POLICY "mo_admin_all"
  ON marketplace_orders FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 4. MARKETPLACE_MILESTONES — project tracking
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','approved','rejected')),
  expected_date date,
  completed_date date,
  client_approved boolean NOT NULL DEFAULT false,
  client_approved_at timestamptz,
  pro_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mm_order ON marketplace_milestones(order_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mm_status ON marketplace_milestones(status);

ALTER TABLE marketplace_milestones ENABLE ROW LEVEL SECURITY;

-- Participants can read milestones
DROP POLICY IF EXISTS "mm_participant_read" ON marketplace_milestones;
CREATE POLICY "mm_participant_read"
  ON marketplace_milestones FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_orders
      WHERE id = marketplace_milestones.order_id
      AND (
        client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM pro_profiles
          WHERE id = marketplace_orders.pro_profile_id
          AND user_id = auth.uid()
        )
      )
    )
  );

-- Pro can create/update milestones (they drive the work)
DROP POLICY IF EXISTS "mm_pro_insert" ON marketplace_milestones;
CREATE POLICY "mm_pro_insert"
  ON marketplace_milestones FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_orders o
      JOIN pro_profiles p ON p.id = o.pro_profile_id
      WHERE o.id = marketplace_milestones.order_id
      AND p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mm_pro_update" ON marketplace_milestones;
CREATE POLICY "mm_pro_update"
  ON marketplace_milestones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_orders o
      JOIN pro_profiles p ON p.id = o.pro_profile_id
      WHERE o.id = marketplace_milestones.order_id
      AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_orders o
      JOIN pro_profiles p ON p.id = o.pro_profile_id
      WHERE o.id = marketplace_milestones.order_id
      AND p.user_id = auth.uid()
    )
  );

-- Client can update (approve milestones)
DROP POLICY IF EXISTS "mm_client_update" ON marketplace_milestones;
CREATE POLICY "mm_client_update"
  ON marketplace_milestones FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_orders
      WHERE id = marketplace_milestones.order_id
      AND client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM marketplace_orders
      WHERE id = marketplace_milestones.order_id
      AND client_id = auth.uid()
    )
  );

-- Admin can manage
DROP POLICY IF EXISTS "mm_admin_all" ON marketplace_milestones;
CREATE POLICY "mm_admin_all"
  ON marketplace_milestones FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 5. MARKETPLACE_PAYMENTS — payment ledger (future-ready)
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'NGN',
  payment_type text NOT NULL
    CHECK (payment_type IN ('deposit','milestone','final','refund','commission')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed','refunded')),

  provider text,             -- 'paystack', 'flutterwave', 'bank_transfer'
  provider_ref text,         -- transaction reference from provider
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mp_order ON marketplace_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_mp_payer ON marketplace_payments(payer_id);
CREATE INDEX IF NOT EXISTS idx_mp_status ON marketplace_payments(status);

ALTER TABLE marketplace_payments ENABLE ROW LEVEL SECURITY;

-- Participants can read their payments
DROP POLICY IF EXISTS "mp_participant_read" ON marketplace_payments;
CREATE POLICY "mp_participant_read"
  ON marketplace_payments FOR SELECT
  TO authenticated
  USING (
    payer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM marketplace_orders o
      WHERE o.id = marketplace_payments.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM pro_profiles p
          WHERE p.id = o.pro_profile_id
          AND p.user_id = auth.uid()
        )
      )
    )
  );

-- Client can insert payment records
DROP POLICY IF EXISTS "mp_client_insert" ON marketplace_payments;
CREATE POLICY "mp_client_insert"
  ON marketplace_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM marketplace_orders
      WHERE id = marketplace_payments.order_id
      AND client_id = auth.uid()
    )
  );

-- Admin can manage all payments
DROP POLICY IF EXISTS "mp_admin_all" ON marketplace_payments;
CREATE POLICY "mp_admin_all"
  ON marketplace_payments FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 6. MARKETPLACE_DISPUTES — conflict resolution
-- =========================================================
CREATE TABLE IF NOT EXISTS marketplace_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raised_by_role text NOT NULL CHECK (raised_by_role IN ('client','pro')),

  reason text NOT NULL,
  description text,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','reviewing','resolved','dismissed')),

  admin_resolution text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_order ON marketplace_disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_md_status ON marketplace_disputes(status);
CREATE INDEX IF NOT EXISTS idx_md_raised_by ON marketplace_disputes(raised_by);

ALTER TABLE marketplace_disputes ENABLE ROW LEVEL SECURITY;

-- Participants can read disputes on their orders
DROP POLICY IF EXISTS "md_participant_read" ON marketplace_disputes;
CREATE POLICY "md_participant_read"
  ON marketplace_disputes FOR SELECT
  TO authenticated
  USING (
    raised_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM marketplace_orders o
      WHERE o.id = marketplace_disputes.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM pro_profiles p
          WHERE p.id = o.pro_profile_id
          AND p.user_id = auth.uid()
        )
      )
    )
  );

-- Participants can create disputes
DROP POLICY IF EXISTS "md_participant_insert" ON marketplace_disputes;
CREATE POLICY "md_participant_insert"
  ON marketplace_disputes FOR INSERT
  TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM marketplace_orders o
      WHERE o.id = marketplace_disputes.order_id
      AND (
        o.client_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM pro_profiles p
          WHERE p.id = o.pro_profile_id
          AND p.user_id = auth.uid()
        )
      )
    )
  );

-- Participants can update their own disputes (add evidence before resolution)
DROP POLICY IF EXISTS "md_raiser_update" ON marketplace_disputes;
CREATE POLICY "md_raiser_update"
  ON marketplace_disputes FOR UPDATE
  TO authenticated
  USING (raised_by = auth.uid())
  WITH CHECK (raised_by = auth.uid());

-- Admin can manage all disputes
DROP POLICY IF EXISTS "md_admin_all" ON marketplace_disputes;
CREATE POLICY "md_admin_all"
  ON marketplace_disputes FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =========================================================
-- 7. ORDER NUMBER SEQUENCE + TRIGGER
-- =========================================================
-- Auto-generate human-readable order numbers: FRLX-ORD-XXXXXX
CREATE OR REPLACE FUNCTION generate_marketplace_order_number()
RETURNS text AS $$
DECLARE
  seq_val bigint;
  order_num text;
BEGIN
  seq_val := nextval(pg_get_serial_sequence('marketplace_orders','id'));
  order_num := 'FRLX-ORD-' || lpad(seq_val::text, 6, '0');
  RETURN order_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================
-- 8. TRIGGERS — updated_at + bid counter + order creation
-- =========================================================
CREATE OR REPLACE FUNCTION update_marketplace_table_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ml_updated ON marketplace_listings;
CREATE TRIGGER trg_ml_updated BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();
DROP TRIGGER IF EXISTS trg_mb_updated ON marketplace_bids;
CREATE TRIGGER trg_mb_updated BEFORE UPDATE ON marketplace_bids
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();
DROP TRIGGER IF EXISTS trg_mo_updated ON marketplace_orders;
CREATE TRIGGER trg_mo_updated BEFORE UPDATE ON marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();
DROP TRIGGER IF EXISTS trg_mm_updated ON marketplace_milestones;
CREATE TRIGGER trg_mm_updated BEFORE UPDATE ON marketplace_milestones
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();
DROP TRIGGER IF EXISTS trg_mp_updated ON marketplace_payments;
CREATE TRIGGER trg_mp_updated BEFORE UPDATE ON marketplace_payments
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();
DROP TRIGGER IF EXISTS trg_md_updated ON marketplace_disputes;
CREATE TRIGGER trg_md_updated BEFORE UPDATE ON marketplace_disputes
  FOR EACH ROW EXECUTE FUNCTION update_marketplace_table_updated_at();

-- Increment listing bid_count when a bid is inserted
CREATE OR REPLACE FUNCTION increment_listing_bid_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_listings
  SET bid_count = bid_count + 1
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mb_increment_bid ON marketplace_bids;
CREATE TRIGGER trg_mb_increment_bid AFTER INSERT ON marketplace_bids
  FOR EACH ROW EXECUTE FUNCTION increment_listing_bid_count();

-- Decrement listing bid_count when a bid is withdrawn/deleted
CREATE OR REPLACE FUNCTION decrement_listing_bid_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE marketplace_listings
  SET bid_count = GREATEST(bid_count - 1, 0)
  WHERE id = OLD.listing_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mb_decrement_bid ON marketplace_bids;
CREATE TRIGGER trg_mb_decrement_bid AFTER DELETE ON marketplace_bids
  FOR EACH ROW EXECUTE FUNCTION decrement_listing_bid_count();

-- When a bid is accepted: update listing status + create order
CREATE OR REPLACE FUNCTION on_bid_accepted_create_order()
RETURNS TRIGGER AS $$
DECLARE
  v_listing marketplace_listings%ROWTYPE;
  v_order_num text;
  v_order_id uuid;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    SELECT * INTO v_listing FROM marketplace_listings WHERE id = NEW.listing_id;

    -- Generate order number
    v_order_num := generate_marketplace_order_number();

    -- Create the order
    INSERT INTO marketplace_orders (
      listing_id, bid_id, client_id, pro_profile_id,
      agreed_price, agreed_timeline_days, currency,
      status, order_number
    ) VALUES (
      v_listing.id, NEW.id, v_listing.user_id, NEW.pro_profile_id,
      NEW.proposed_price, NEW.proposed_timeline_days, v_listing.currency,
      'pending_start', v_order_num
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_order_id;

    -- Reject all other pending bids on this listing
    UPDATE marketplace_bids
    SET status = 'rejected', rejected_at = now(), rejected_reason = 'Another bid was accepted'
    WHERE listing_id = NEW.listing_id
    AND id != NEW.id
    AND status = 'pending';

    -- Update listing status
    UPDATE marketplace_listings
    SET status = 'awarded',
        awarded_to = NEW.pro_profile_id,
        awarded_at = now()
    WHERE id = NEW.listing_id;

    -- Create default milestones
    IF v_order_id IS NOT NULL THEN
      INSERT INTO marketplace_milestones (order_id, title, sort_order, expected_date) VALUES
        (v_order_id, 'Site Visit & Assessment', 1, CURRENT_DATE + 2),
        (v_order_id, 'Material Procurement', 2, CURRENT_DATE + 5),
        (v_order_id, 'Work Execution', 3, CURRENT_DATE + 10),
        (v_order_id, 'Final Inspection & Handover', 4, CURRENT_DATE + 14);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_mb_accept_create_order ON marketplace_bids;
CREATE TRIGGER trg_mb_accept_create_order AFTER UPDATE ON marketplace_bids
  FOR EACH ROW EXECUTE FUNCTION on_bid_accepted_create_order();

-- Increment listing view_count (called from app via RPC, not trigger)
-- App increments by updating the row directly.

-- =========================================================
-- 9. STORAGE BUCKET for marketplace bid attachments
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketplace', 'marketplace', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "marketplace_public_read" ON storage.objects;
CREATE POLICY "marketplace_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "marketplace_auth_insert" ON storage.objects;
CREATE POLICY "marketplace_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "marketplace_owner_update" ON storage.objects;
CREATE POLICY "marketplace_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "marketplace_owner_delete" ON storage.objects;
CREATE POLICY "marketplace_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketplace' AND (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- 10. SEED DEFAULT MILESTONE TEMPLATES
-- =========================================================
-- No seed data needed — milestones are auto-created by trigger.
-- Admin can customize milestone templates in future phase.
