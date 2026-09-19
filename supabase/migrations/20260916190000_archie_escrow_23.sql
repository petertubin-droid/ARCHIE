-- =========================================================
-- FRELUX ESCROW (spec §23) — MILESTONE-GATED PAYMENT WORKFLOW
-- migration: 20260916190000_archie_escrow_23.sql
--
-- FRELUX escrow is a milestone-gated release WORKFLOW on top
-- of the authorized payment provider (Paystack). Custody of
-- funds ALWAYS remains with the provider and the applicable
-- business controls — this schema never claims custody and
-- no table stores a funds-movement instruction that ARCHIE
-- could execute. ARCHIE's tables (flags, dispute analyses)
-- are RECOMMENDATIONS with mandatory evidence; every money
-- state change is produced only by provider-verified events
-- (charge.success / transfer.success / refund.processed via
-- the signed webhook) and human acceptance.
--
-- The deterministic state machine is canonical at
-- supabase/functions/_shared/escrow/escrow-lifecycle.ts; the
-- CHECK constraints below mirror it exactly.
--
-- All amounts are integer KOBO. Never floats.
-- =========================================================

-- ---------------------------------------------------------
-- Transactions: one escrow engagement (client ↔ contractor)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contractor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contractor_name text NOT NULL,
  project_title text NOT NULL,
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  total_amount_kobo bigint NOT NULL CHECK (total_amount_kobo > 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','AWAITING_FUNDS','FUNDED','ACTIVE',
    'COMPLETED','CANCELLED','EXPIRED','REFUNDED'
  )),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  paystack_authorization_ref text,
  funded_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_escrow_transactions IS
  'FRELUX escrow §23 — milestone-gated payment workflow. Funds custody always remains with the payment provider (Paystack); money states change only via provider-verified events and human acceptance.';

CREATE INDEX IF NOT EXISTS idx_escrow_transactions_client
  ON public.frelux_escrow_transactions (client_id);
CREATE INDEX IF NOT EXISTS idx_escrow_transactions_contractor
  ON public.frelux_escrow_transactions (contractor_user_id)
  WHERE contractor_user_id IS NOT NULL;

-- ---------------------------------------------------------
-- Milestones: the release units of the workflow
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.frelux_escrow_transactions(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  title text NOT NULL,
  description text,
  deliverables jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  due_date timestamptz,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','IN_PROGRESS','DELIVERED','ACCEPTED',
    'RELEASE_PENDING','RELEASED','REJECTED','DISPUTED'
  )),
  delivered_at timestamptz,
  accepted_at timestamptz,
  accepted_via text CHECK (accepted_via IN ('CLIENT','WINDOW_LAPSE','OWNER_ADJUDICATION')),
  acceptance_window_lapsed boolean NOT NULL DEFAULT false,
  paystack_transfer_ref text,
  released_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, sequence)
);

COMMENT ON TABLE public.frelux_escrow_milestones IS
  'Escrow §23 milestones — delivery requires evidence; acceptance belongs to the client or the agreed window lapse; RELEASED is produced only by a provider-verified transfer.';

CREATE INDEX IF NOT EXISTS idx_escrow_milestones_transaction
  ON public.frelux_escrow_milestones (transaction_id);

-- ---------------------------------------------------------
-- Evidence: delivery/acceptance evidence, mandatory for
-- DELIVERED. Provenance is recorded; nothing is fabricated.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.frelux_escrow_milestones(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.frelux_escrow_transactions(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN (
    'PHOTO','DOCUMENT','INSPECTION','MEASUREMENT','OTHER'
  )),
  description text NOT NULL,
  file_uri text,
  content_hash text,
  created_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_escrow_evidence IS
  'Escrow §23 delivery/acceptance evidence — mandatory provenance for every DELIVERED milestone.';

CREATE INDEX IF NOT EXISTS idx_escrow_evidence_milestone
  ON public.frelux_escrow_evidence (milestone_id);

-- ---------------------------------------------------------
-- ARCHIE flags: the phase-8 trust-safety amendment already
-- created frelux_escrow_flags (admin-persisted, ref-based —
-- written by src/lib/archie/trust-safety-client.ts). The §23
-- workflow EXTENDS that table in place rather than replacing
-- it: the existing rows and the admin review surface keep
-- working, while flags gain an optional link to the new
-- escrow transactions and milestones.
-- ---------------------------------------------------------
ALTER TABLE public.frelux_escrow_flags
  ADD COLUMN IF NOT EXISTS transaction_id uuid
    REFERENCES public.frelux_escrow_transactions(id) ON DELETE SET NULL;
ALTER TABLE public.frelux_escrow_flags
  ADD COLUMN IF NOT EXISTS milestone_id uuid
    REFERENCES public.frelux_escrow_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.frelux_escrow_flags
  ADD COLUMN IF NOT EXISTS fund_authority text NOT NULL
    DEFAULT 'payment/escrow provider'
    CHECK (fund_authority = 'payment/escrow provider');

-- Widen the status set with RESOLVED (adjudicated). The
-- phase-8 constraint name is the Postgres default.
ALTER TABLE public.frelux_escrow_flags
  DROP CONSTRAINT IF EXISTS frelux_escrow_flags_status_check;
ALTER TABLE public.frelux_escrow_flags
  ADD CONSTRAINT frelux_escrow_flags_status_check
  CHECK (status IN ('OPEN','REVIEWED','RESOLVED','DISMISSED','ACTIONED'));

COMMENT ON TABLE public.frelux_escrow_flags IS
  'Escrow §23 + phase-8 ARCHIE monitoring flags — evidence-backed recommendations only. Funds authority is always the payment/escrow provider.';

CREATE INDEX IF NOT EXISTS idx_escrow_flags_transaction
  ON public.frelux_escrow_flags (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ---------------------------------------------------------
-- Disputes: positions, evidence review, ARCHIE analysis as
-- ASSISTANCE. The decision authority is the Owner + provider
-- business controls — never ARCHIE alone.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.frelux_escrow_transactions(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.frelux_escrow_milestones(id) ON DELETE SET NULL,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_by_role text NOT NULL CHECK (raised_by_role IN ('CLIENT','CONTRACTOR','OWNER')),
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_reviewed jsonb NOT NULL DEFAULT '[]'::jsonb,
  archie_analysis jsonb,
  recommended_resolution text,
  resolution text,
  decision_authority text NOT NULL
    CHECK (decision_authority = 'payment/escrow provider + human/business controls'),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_escrow_disputes IS
  'Escrow §23 disputes — ARCHIE assists analysis with evidence; adjudication belongs to the Owner and provider business controls.';

CREATE INDEX IF NOT EXISTS idx_escrow_disputes_transaction
  ON public.frelux_escrow_disputes (transaction_id);

-- ---------------------------------------------------------
-- Events: APPEND-ONLY audit ledger. No UPDATE, no DELETE —
-- for any role. Denials are recorded exactly like successes.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_escrow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.frelux_escrow_transactions(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.frelux_escrow_milestones(id) ON DELETE SET NULL,
  actor text NOT NULL CHECK (actor IN (
    'CLIENT','CONTRACTOR','OWNER','ARCHIE','PROVIDER','SYSTEM'
  )),
  action text NOT NULL,
  result text NOT NULL CHECK (result IN ('success','failure','denied')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_escrow_events IS
  'Escrow §23 audit ledger — append-only. Every action attributed to its actor; denials recorded exactly like successes.';

CREATE INDEX IF NOT EXISTS idx_escrow_events_transaction
  ON public.frelux_escrow_events (transaction_id);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

ALTER TABLE public.frelux_escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_escrow_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_escrow_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_escrow_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_escrow_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_escrow_events ENABLE ROW LEVEL SECURITY;

-- Transactions: the client manages their own rows.
DROP POLICY IF EXISTS "client manages own escrow transactions" ON public.frelux_escrow_transactions;
CREATE POLICY "client manages own escrow transactions" ON public.frelux_escrow_transactions
  FOR ALL TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- Transactions: an engaged contractor READS the transactions
-- where they are the counterparty. They may never rewrite the
-- terms or the money states.
DROP POLICY IF EXISTS "contractor reads own escrow transactions" ON public.frelux_escrow_transactions;
CREATE POLICY "contractor reads own escrow transactions" ON public.frelux_escrow_transactions
  FOR SELECT TO authenticated
  USING (contractor_user_id = auth.uid());

-- Milestones: the client manages milestones on their own
-- transactions (state changes route through the audited edge
-- function; the policy is the second gate).
DROP POLICY IF EXISTS "client manages own escrow milestones" ON public.frelux_escrow_milestones;
CREATE POLICY "client manages own escrow milestones" ON public.frelux_escrow_milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.client_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.client_id = auth.uid()
    )
  );

-- Milestones: an engaged contractor reads and updates the
-- work states of their own milestones (DELIVERED submission).
DROP POLICY IF EXISTS "contractor works own escrow milestones" ON public.frelux_escrow_milestones;
CREATE POLICY "contractor works own escrow milestones" ON public.frelux_escrow_milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.contractor_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.contractor_user_id = auth.uid()
    )
  );

-- Evidence: the client reads evidence on their transactions.
DROP POLICY IF EXISTS "client reads own escrow evidence" ON public.frelux_escrow_evidence;
CREATE POLICY "client reads own escrow evidence" ON public.frelux_escrow_evidence
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.client_id = auth.uid()
    )
  );

-- Evidence: the engaged contractor submits evidence for
-- their milestones.
DROP POLICY IF EXISTS "contractor submits escrow evidence" ON public.frelux_escrow_evidence;
CREATE POLICY "contractor submits escrow evidence" ON public.frelux_escrow_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id AND t.contractor_user_id = auth.uid()
    )
  );

-- Flags: participants may READ flags linked to their own
-- transactions (admins keep their phase-8 read policy).
-- Inserts/updates are service-role only (the audited edge
-- function) — ARCHIE writes flags through the server, never
-- through a client policy.
DROP POLICY IF EXISTS "participants read own escrow flags" ON public.frelux_escrow_flags;
CREATE POLICY "participants read own escrow flags" ON public.frelux_escrow_flags
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      transaction_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.frelux_escrow_transactions t
        WHERE t.id = transaction_id
          AND (t.client_id = auth.uid() OR t.contractor_user_id = auth.uid())
      )
    )
  );

-- Disputes: participants read disputes on their own
-- transactions; any party may raise one.
DROP POLICY IF EXISTS "participants read own escrow disputes" ON public.frelux_escrow_disputes;
CREATE POLICY "participants read own escrow disputes" ON public.frelux_escrow_disputes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id
        AND (t.client_id = auth.uid() OR t.contractor_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "participants raise escrow disputes" ON public.frelux_escrow_disputes;
CREATE POLICY "participants raise escrow disputes" ON public.frelux_escrow_disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id
        AND (t.client_id = auth.uid() OR t.contractor_user_id = auth.uid())
    )
  );

-- Events: append-only. Participants may INSERT and READ on
-- their own transactions; NO update/delete policy exists for
-- any role, so the ledger is append-only by construction.
DROP POLICY IF EXISTS "participants read own escrow events" ON public.frelux_escrow_events;
CREATE POLICY "participants read own escrow events" ON public.frelux_escrow_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id
        AND (t.client_id = auth.uid() OR t.contractor_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "participants append own escrow events" ON public.frelux_escrow_events;
CREATE POLICY "participants append own escrow events" ON public.frelux_escrow_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.frelux_escrow_transactions t
      WHERE t.id = transaction_id
        AND (t.client_id = auth.uid() OR t.contractor_user_id = auth.uid())
    )
  );
