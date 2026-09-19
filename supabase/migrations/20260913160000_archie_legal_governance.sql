-- =========================================================
-- ARCHIE LEGAL, PRIVACY, IP & GOVERNANCE LAYER (2026-09-10)
--
-- © 2026 FRENZY. All rights reserved.
--
-- Real, versioned legal-document management with Owner
-- approval and audit trail; real privacy consent records;
-- real memory/data rights request tracking; seeded
-- governance rules encoding Owner Authority.
--
-- Document CONTENT lives in code (single source of truth):
-- supabase/functions/_shared/archie-ai/legal/documents.ts
-- and is seeded/managed by the archie-legal edge function.
-- Published legal documents are NEVER silently replaced:
-- every publication archives the previous version and every
-- lifecycle step writes an audit event.
--
-- Idempotent. RLS-guarded. Self-verifying.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Versioned legal documents
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  effective_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  published_by uuid,
  published_at timestamptz,
  archived_at timestamptz,
  UNIQUE (doc_key, version)
);

CREATE INDEX IF NOT EXISTS idx_archie_legal_documents_key
  ON public.archie_legal_documents (doc_key);

-- One published version per document key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_archie_legal_documents_published
  ON public.archie_legal_documents (doc_key)
  WHERE status = 'published';

ALTER TABLE public.archie_legal_documents ENABLE ROW LEVEL SECURITY;

-- Published + archived documents are readable by signed-in
-- users (the PWA surfaces them); drafts/approved remain
-- owner-visible only via the service-role function.
DROP POLICY IF EXISTS archie_legal_documents_read_published ON public.archie_legal_documents;
CREATE POLICY archie_legal_documents_read_published ON public.archie_legal_documents
  FOR SELECT TO authenticated
  USING (status IN ('published', 'archived'));

-- ---------------------------------------------------------
-- 2. Legal lifecycle audit trail
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_legal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key text NOT NULL,
  version integer NOT NULL,
  event text NOT NULL
    CHECK (event IN ('seeded', 'draft_created', 'edited', 'approved', 'published', 'archived', 'deletion_requested', 'deletion_executed', 'deletion_rejected')),
  actor uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archie_legal_events_doc
  ON public.archie_legal_events (doc_key, version);

ALTER TABLE public.archie_legal_events ENABLE ROW LEVEL SECURITY;
-- Owner-only reads via service role; no client policies.

-- ---------------------------------------------------------
-- 3. Real privacy consent records (per user)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_privacy_consents (
  user_id uuid NOT NULL,
  consent_key text NOT NULL
    CHECK (consent_key IN (
      'personalization_memory',   -- memory-based personalization
      'voice_audio',              -- voice feature processing
      'web_research',             -- owner-authorized web research
      'memory_retention',         -- retention window (days) in value
      'legal_docs_ack'            -- acknowledgement of legal docs
    )),
  granted boolean,
  value jsonb,
  doc_version integer,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  source text,
  PRIMARY KEY (user_id, consent_key)
);

ALTER TABLE public.archie_privacy_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archie_privacy_consents_self_read ON public.archie_privacy_consents;
CREATE POLICY archie_privacy_consents_self_read ON public.archie_privacy_consents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS archie_privacy_consents_self_write ON public.archie_privacy_consents;
CREATE POLICY archie_privacy_consents_self_write ON public.archie_privacy_consents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 4. Memory / data rights requests (export, deletion…)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_memory_rights_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL
    CHECK (kind IN ('export', 'delete_account', 'delete_memory_category', 'clear_conversations')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'rejected')),
  result_note text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  handled_by uuid
);

CREATE INDEX IF NOT EXISTS idx_archie_memory_rights_user
  ON public.archie_memory_rights_requests (user_id, status);

ALTER TABLE public.archie_memory_rights_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archie_memory_rights_requests_self_read ON public.archie_memory_rights_requests;
CREATE POLICY archie_memory_rights_requests_self_read ON public.archie_memory_rights_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS archie_memory_rights_requests_self_create ON public.archie_memory_rights_requests;
CREATE POLICY archie_memory_rights_requests_self_create ON public.archie_memory_rights_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------
-- 5. Governance rules (Owner Authority model)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_governance_rules (
  rule_key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('permitted', 'prohibited', 'authority')),
  statement text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'owner directive 2026-09-10',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_governance_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archie_governance_rules_read ON public.archie_governance_rules;
CREATE POLICY archie_governance_rules_read ON public.archie_governance_rules
  FOR SELECT TO authenticated
  USING (active);

-- ---------------------------------------------------------
-- 6. SELF-VERIFY — loud failure if anything is missing.
-- ---------------------------------------------------------
DO $$
DECLARE
  missing text;
  doc_table text;
BEGIN
  FOR doc_table IN
    SELECT t FROM unnest(ARRAY[
      'archie_legal_documents',
      'archie_legal_events',
      'archie_privacy_consents',
      'archie_memory_rights_requests',
      'archie_governance_rules'
    ]) AS t
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = doc_table
    ) THEN
      RAISE EXCEPTION 'ARCHIE legal migration FAILED: table % missing', doc_table;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = doc_table AND rowsecurity
    ) THEN
      RAISE EXCEPTION 'ARCHIE legal migration FAILED: RLS not enabled on %', doc_table;
    END IF;
  END LOOP;
END $$;
