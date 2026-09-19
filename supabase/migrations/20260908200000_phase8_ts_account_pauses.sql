-- =========================================================
-- FRELUX ARCHIE AMENDMENT — TRUST & SAFETY / ACCOUNT PAUSES /
-- ESCROW FLAG TABLES
--
-- Governance: writes are admin/service-role only (RLS);
-- users can READ their own trust-safety events and pauses for
-- transparency and appeal. ARCHIE's pause authority is
-- bounded in the DATABASE: an ARCHIE-opened pause can never
-- exceed 72 hours, and permanent termination is ONLY an
-- owner decision (final_owner_decision), never a pause.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Trust & safety detection events (auditable records)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_trust_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  signals text[] NOT NULL DEFAULT '{}',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  review_status text NOT NULL DEFAULT 'PENDING_OWNER_REVIEW'
    CHECK (review_status IN ('PENDING_OWNER_REVIEW','REVIEWED')),
  owner_decision text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ts_events_account
  ON public.frelux_trust_safety_events (account_id, created_date DESC);

ALTER TABLE public.frelux_trust_safety_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own trust safety events" ON public.frelux_trust_safety_events;
CREATE POLICY "users read own trust safety events"
  ON public.frelux_trust_safety_events FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "admins record trust safety events" ON public.frelux_trust_safety_events;
CREATE POLICY "admins record trust safety events"
  ON public.frelux_trust_safety_events FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins review trust safety events" ON public.frelux_trust_safety_events;
CREATE POLICY "admins review trust safety events"
  ON public.frelux_trust_safety_events FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 2. Account pauses — ARCHIE's bounded temporary authority
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_account_pauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  detected_behaviors text[] NOT NULL DEFAULT '{}',
  risk_level text NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  paused_at timestamptz NOT NULL DEFAULT now(),
  -- ARCHIE-opened pauses are hard-bounded to 72 hours.
  expires_at timestamptz NOT NULL,
  archie_decision text NOT NULL
    DEFAULT 'TEMPORARY PAUSE (authorized, pending Owner review)',
  review_status text NOT NULL DEFAULT 'PENDING_OWNER_REVIEW'
    CHECK (review_status IN ('PENDING_OWNER_REVIEW','REVIEWED')),
  final_owner_decision text NOT NULL DEFAULT 'PENDING'
    CHECK (final_owner_decision IN ('PENDING','REINSTATE','RESTRICT','TERMINATE')),
  owner_reviewed_at timestamptz,
  appeal_text text,
  created_date timestamptz NOT NULL DEFAULT now(),
  -- The 72-hour bound is enforced by the database itself.
  CONSTRAINT pause_max_72_hours
    CHECK (expires_at <= paused_at + interval '72 hours'),
  -- A pause record without evidence is not valid.
  CONSTRAINT pause_requires_evidence
    CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) > 0)
);

CREATE INDEX IF NOT EXISTS idx_account_pauses_account
  ON public.frelux_account_pauses (account_id, paused_at DESC);

ALTER TABLE public.frelux_account_pauses ENABLE ROW LEVEL SECURITY;

-- Transparency: the account can see its own pause (and appeal).
DROP POLICY IF EXISTS "users read own pauses" ON public.frelux_account_pauses;
CREATE POLICY "users read own pauses"
  ON public.frelux_account_pauses FOR SELECT TO authenticated
  USING (account_id = auth.uid() OR public.is_admin());

-- Only admins (ARCHIE acting under explicit owner authorization,
-- via the owner/admin session) may open a pause.
DROP POLICY IF EXISTS "admins open temporary pauses" ON public.frelux_account_pauses;
CREATE POLICY "admins open temporary pauses"
  ON public.frelux_account_pauses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- Owner review / appeal handling: admin-only.
DROP POLICY IF EXISTS "admins review pauses" ON public.frelux_account_pauses;
CREATE POLICY "admins review pauses"
  ON public.frelux_account_pauses FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------
-- 3. Escrow transaction flags — recommendations only
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref text NOT NULL,
  topic text NOT NULL CHECK (topic IN (
    'transaction_status','project_milestones','agreed_deliverables',
    'payment_conditions','delivery_acceptance_evidence','disputes',
    'suspicious_transaction_patterns','fraud_indicators')),
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_action text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_escrow_flags_ref
  ON public.frelux_escrow_flags (transaction_ref, created_date DESC);

ALTER TABLE public.frelux_escrow_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read escrow flags" ON public.frelux_escrow_flags;
CREATE POLICY "admins read escrow flags"
  ON public.frelux_escrow_flags FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "admins record escrow flags" ON public.frelux_escrow_flags;
CREATE POLICY "admins record escrow flags"
  ON public.frelux_escrow_flags FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admins review escrow flags" ON public.frelux_escrow_flags;
CREATE POLICY "admins review escrow flags"
  ON public.frelux_escrow_flags FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
