-- =========================================================
-- FRELUX PHASE 6.5 ALPHA — EXTERNAL WEB INTELLIGENCE
--
-- Controlled crawling & knowledge acquisition on top of the
-- EXISTING Phase 6.5 learning engine (extended, never
-- replaced):
--   * frelux_intelligence_sources — Admin registry of approved
--     external sources (price/product/knowledge/standard/...).
--   * frelux_crawl_runs           — full crawl history/audit.
--   * freflux_crawled_pages       — page store with content
--     hashes for dedup + change detection.
--   * frelux_extracted_products   — structured product data
--     extracted from approved pages (honest: unavailable
--     fields stay NULL/uncertain).
--   * frelux_price_observations   — APPEND-ONLY price history.
--     Observations are never overwritten; changes become new
--     rows. Observed market price ≠ FRELUX configured price.
--   * frelux_search_providers     — provider-abstracted search
--     registry (API keys stay server-side only).
--
-- The learning_records lifecycle CHECK is EXTENDED (additive)
-- with CRAWLED and EXTRACTED so external intelligence flows
-- into the SAME pipeline: CRAWLED → EXTRACTED → CANDIDATE →
-- VERIFYING → EVALUATING → READY_FOR_REVIEW → APPROVED /
-- REJECTED / DEFERRED. Existing rows/values are untouched.
--
-- Deterministic engines remain protected: crawled content can
-- never alter calculation rules; it may only create records
-- and improvement proposals under existing governance.
-- =========================================================

-- 1. Extend the learning lifecycle (additive CHECK swap)
ALTER TABLE public.frelux_learning_records DROP CONSTRAINT IF EXISTS
  frelux_learning_records_lifecycle_status_check;
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frelux_learning_records_lifecycle_status_check'
                 AND conrelid = 'public.frelux_learning_records'::regclass) THEN
ALTER TABLE public.frelux_learning_records ADD CONSTRAINT
  frelux_learning_records_lifecycle_status_check CHECK (
    lifecycle_status IN (
      'CRAWLED', 'EXTRACTED', 'ARCHIE_RECEIVED', 'CANDIDATE',
      'VERIFYING', 'EVALUATING', 'READY_FOR_REVIEW',
      'APPROVED', 'REJECTED', 'DEFERRED'
    )
  );
  END IF;
END
$mig$;

ALTER TABLE public.frelux_learning_records DROP CONSTRAINT IF EXISTS
  frelux_learning_records_source_check;
DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'frelux_learning_records_source_check'
                 AND conrelid = 'public.frelux_learning_records'::regclass) THEN
ALTER TABLE public.frelux_learning_records ADD CONSTRAINT
  frelux_learning_records_source_check CHECK (
    source IN ('ARCHIE','GEMINI','OPENAI','USER','OUTCOME','SYSTEM','WEB')
  );
  END IF;
END
$mig$;


-- 2. Intelligence source registry (Admin-only)
CREATE TABLE IF NOT EXISTS public.frelux_intelligence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_url text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'PRICE','PRODUCT','MANUFACTURER','SUPPLIER','CONSTRUCTION_KNOWLEDGE',
    'STANDARD_CODE','MARKET','COMPETITOR','GENERAL_REFERENCE'
  )),
  country text NOT NULL DEFAULT 'NG',
  region text,
  language text NOT NULL DEFAULT 'en',
  purpose text,
  allowed_paths jsonb NOT NULL DEFAULT '["/"]'::jsonb,
  crawl_frequency text NOT NULL DEFAULT 'MANUAL'
    CHECK (crawl_frequency IN ('MANUAL','HOURLY','DAILY','WEEKLY','MONTHLY')),
  max_pages integer NOT NULL DEFAULT 10 CHECK (max_pages BETWEEN 1 AND 50),
  enabled boolean NOT NULL DEFAULT false,
  is_price_source boolean NOT NULL DEFAULT false,
  is_product_source boolean NOT NULL DEFAULT false,
  is_knowledge_source boolean NOT NULL DEFAULT false,
  learning_eligible boolean NOT NULL DEFAULT true,
  reliability text NOT NULL DEFAULT 'UNVERIFIED' CHECK (reliability IN (
    'AUTHORITATIVE','HIGH','MEDIUM','LOW','UNVERIFIED'
  )),
  notes text,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  last_crawl timestamptz,
  next_crawl timestamptz,
  UNIQUE (base_url, source_type)
);

CREATE INDEX IF NOT EXISTS idx_intel_sources_enabled
  ON public.frelux_intelligence_sources (enabled, next_crawl);

ALTER TABLE public.frelux_intelligence_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage intelligence sources" ON public.frelux_intelligence_sources;
CREATE POLICY "admins manage intelligence sources" ON public.frelux_intelligence_sources
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Crawl runs (history/audit)
CREATE TABLE IF NOT EXISTS public.frelux_crawl_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.frelux_intelligence_sources (id) ON DELETE CASCADE,
  trigger_kind text NOT NULL DEFAULT 'MANUAL' CHECK (trigger_kind IN ('MANUAL','SCHEDULED')),
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN (
    'RUNNING','SUCCESS','PARTIAL','FAILED','BLOCKED'
  )),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_attempted integer NOT NULL DEFAULT 0,
  pages_processed integer NOT NULL DEFAULT 0,
  pages_rejected integer NOT NULL DEFAULT 0,
  pages_unchanged integer NOT NULL DEFAULT 0,
  new_facts integer NOT NULL DEFAULT 0,
  changed_facts integer NOT NULL DEFAULT 0,
  candidates_generated integer NOT NULL DEFAULT 0,
  knowledge_promoted integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_reason text,
  triggered_by uuid
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_source
  ON public.frelux_crawl_runs (source_id, started_at DESC);

ALTER TABLE public.frelux_crawl_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crawl runs" ON public.frelux_crawl_runs;
CREATE POLICY "admins manage crawl runs" ON public.frelux_crawl_runs
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 4. Crawled pages (dedup + change detection)
CREATE TABLE IF NOT EXISTS public.frelux_crawled_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.frelux_intelligence_sources (id) ON DELETE CASCADE,
  url text NOT NULL,
  content_hash text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  status_code integer,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  changed boolean NOT NULL DEFAULT true,
  UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_crawled_pages_source
  ON public.frelux_crawled_pages (source_id, retrieved_at DESC);

ALTER TABLE public.frelux_crawled_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage crawled pages" ON public.frelux_crawled_pages;
CREATE POLICY "admins manage crawled pages" ON public.frelux_crawled_pages
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Extracted products (structured, honest about gaps)
CREATE TABLE IF NOT EXISTS public.frelux_extracted_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.frelux_intelligence_sources (id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.frelux_learning_records (id),
  url text NOT NULL,
  product_name text,
  manufacturer text,
  product_category text,
  package_size text,
  unit text,
  specification text,
  coverage text,
  application_info text,
  material_info text,
  price numeric,
  currency text,
  availability text,
  location text,
  supplier text,
  terminology jsonb NOT NULL DEFAULT '[]'::jsonb,
  methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  standards_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  uncertain_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
  UNIQUE (url, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_extracted_products_source
  ON public.frelux_extracted_products (source_id, retrieved_at DESC);

ALTER TABLE public.frelux_extracted_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage extracted products" ON public.frelux_extracted_products;
CREATE POLICY "admins manage extracted products" ON public.frelux_extracted_products
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 6. Price observations (APPEND-ONLY history; never overwrite)
CREATE TABLE IF NOT EXISTS public.frelux_price_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.frelux_intelligence_sources (id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.frelux_learning_records (id),
  product_name text NOT NULL,
  price numeric NOT NULL,
  currency text NOT NULL,
  unit_package text,
  region text,
  country text NOT NULL DEFAULT 'NG',
  supplier text,
  url text NOT NULL,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  source_reliability text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  verification_status text NOT NULL DEFAULT 'PENDING'
    CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
  content_hash text
);

CREATE INDEX IF NOT EXISTS idx_price_obs_lookup
  ON public.frelux_price_observations (product_name, country, currency, retrieved_at DESC);

ALTER TABLE public.frelux_price_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read price observations" ON public.frelux_price_observations;
CREATE POLICY "admins read price observations" ON public.frelux_price_observations
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admins insert price observations" ON public.frelux_price_observations;
CREATE POLICY "admins insert price observations" ON public.frelux_price_observations
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- 7. Search provider registry (keys stay server-side)
CREATE TABLE IF NOT EXISTS public.frelux_search_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  adapter text NOT NULL CHECK (adapter IN ('TAVILY','SERPER','BRAVE','CUSTOM')),
  enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_search_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage search providers" ON public.frelux_search_providers;
CREATE POLICY "admins manage search providers" ON public.frelux_search_providers
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
