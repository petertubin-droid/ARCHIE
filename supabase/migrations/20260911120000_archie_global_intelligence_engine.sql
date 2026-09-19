-- =========================================================
-- ARCHIE GLOBAL INTELLIGENCE & EVOLUTION ENGINE
--
-- Upgrades ARCHIE from a FRELUX-specific intelligence layer
-- into a general-purpose, continuously learning intelligence
-- and engineering platform that POWERS Frelux (§12).
--
-- Adds:
--  1. Global expansion domains (engineering, computing,
--     security, markets, product, mathematics).
--  2. archie_global_authorizations — the OWNER-granted
--     authorization records (§9). Owner-only writes via RLS;
--     ARCHIE can never grant, modify or revoke authority.
--  3. archie_global_market_observations — global market
--     research with provenance (§5).
--  4. archie_inspection_reports — website/code inspection
--     reports with the anti-fabrication observability
--     contract (§2).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Global expansion domains (none core, same governance)
-- ---------------------------------------------------------
INSERT INTO public.frelux_archie_domains
  (key, label, is_core, risk_class, description)
VALUES
  ('programming_languages', 'Programming Languages', false, 'STANDARD',
   'Language design, semantics, idioms and cross-language engineering reasoning.'),
  ('web_development', 'Web Development', false, 'STANDARD',
   'Frontend/backend web engineering: HTML, CSS, JavaScript, TypeScript, frameworks and web platform standards.'),
  ('databases', 'Databases & Data Engineering', false, 'STANDARD',
   'Relational and non-relational databases, schema design, query optimization, migrations and data modeling.'),
  ('api_design', 'APIs & Integration', false, 'STANDARD',
   'API architecture, REST/GraphQL/gRPC design, contracts, versioning and integration patterns.'),
  ('cloud_infrastructure', 'Cloud Infrastructure & DevOps', false, 'ENGINEERING_REVIEW',
   'Cloud platforms, deployment, containers, CI/CD, observability and infrastructure-as-code.'),
  ('operating_systems', 'Operating Systems', false, 'STANDARD',
   'OS concepts, processes, memory, filesystems, shells and cross-platform engineering.'),
  ('networking', 'Networking & Distributed Systems', false, 'STANDARD',
   'Network protocols, topologies, distributed-systems patterns and internet infrastructure.'),
  ('ai_ml', 'AI & Machine Learning', false, 'STANDARD',
   'Machine learning concepts, model design, evaluation, and responsible AI engineering.'),
  ('automation', 'Automation & Scripting', false, 'STANDARD',
   'Workflow automation, scripting, scheduled systems and integration tooling.'),
  ('emerging_technologies', 'Emerging Technologies', false, 'STANDARD',
   'New and evolving technology landscapes — always labeled with date and maturity.'),
  ('cybersecurity', 'Cybersecurity', false, 'ENGINEERING_REVIEW',
   'Security engineering: secure architecture, cryptography, application security, hardening, monitoring and incident response. Operational testing is authorization-gated.'),
  ('defensive_security', 'Defensive Security Research', false, 'ENGINEERING_REVIEW',
   'Blue-team knowledge: detection, mitigation, hardening guidance, vulnerability remediation and defense-in-depth.'),
  ('penetration_testing', 'Authorized Penetration Testing Methodology', false, 'ENGINEERING_REVIEW',
   'AUTHORIZED-ONLY methodology: recon, enumeration, exploitation and reporting for targets covered by a recorded Owner authorization. Studied for defense; executed only within scope.'),
  ('vulnerability_research', 'Vulnerability Research', false, 'ENGINEERING_REVIEW',
   'Vulnerability classes, root-cause analysis, exploit mechanics (studied for defense), CVE analysis and remediation — controlled environments only for any reproduction.'),
  ('secure_architecture', 'Secure Architecture & Threat Modeling', false, 'ENGINEERING_REVIEW',
   'Threat modeling, attack-surface analysis, trust boundaries, secure design review and zero-trust patterns.'),
  ('mathematics', 'Mathematics', false, 'DETERMINISTIC',
   'Pure and applied mathematics, statistics and numerical methods. Highest verification bar; deterministic results are computed, never recalled from memory.'),
  ('global_markets', 'Global Markets & Economics', false, 'STANDARD',
   'Global market research: construction/technology/property markets, supply chains, economic conditions. Every observation carries source, date and confidence; never silently converted to fact.'),
  ('economics', 'Economics', false, 'STANDARD',
   'Economic reasoning: micro/macro concepts, regional differences and market dynamics.'),
  ('product_development', 'Product Development', false, 'STANDARD',
   'Product discovery, strategy, roadmaps and validation methods.'),
  ('ux_ui', 'UX / UI Design', false, 'STANDARD',
   'User experience and interface design: usability, interaction design, accessibility and design systems.'),
  ('seo', 'SEO & Web Visibility', false, 'STANDARD',
   'Search engine optimization, structured data, technical SEO and content discoverability.'),
  ('engineering', 'General Engineering', false, 'ENGINEERING_REVIEW',
   'Cross-discipline engineering fundamentals spanning mechanical, civil, systems and applied engineering.')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------
-- 2. Owner authorization records (§9) — the authority layer
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_global_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authority text NOT NULL
    CHECK (authority IN (
      'deploy_code', 'apply_patch', 'modify_production', 'modify_own_code',
      'run_authorized_security_test', 'access_authorized_target',
      'publish_content', 'send_external_message', 'spend_money',
      'change_configuration', 'grant_api_access'
    )),
  scope text NOT NULL,
  granted_by text NOT NULL DEFAULT 'OWNER' CHECK (granted_by = 'OWNER'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  evidence text NOT NULL,
  revoked_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorization_expiry_after_grant CHECK (expires_at > granted_at)
);

CREATE INDEX IF NOT EXISTS idx_archie_authorizations_lookup
  ON public.archie_global_authorizations (authority, scope)
  WHERE revoked_at IS NULL;

-- Append-only authority audit: no authorization may be
-- silently rewritten. Updates may only revoke.
CREATE OR REPLACE FUNCTION public.archie_authorizations_append_only()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.granted_at <> OLD.granted_at
       OR NEW.granted_by <> OLD.granted_by
       OR NEW.scope <> OLD.scope
       OR NEW.authority <> OLD.authority
       OR NEW.evidence <> OLD.evidence THEN
      RAISE EXCEPTION 'Authorization records are append-only: only revocation may change them.';
    END IF;
    IF OLD.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'A revoked authorization can never be re-activated.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_archie_authorizations_append_only ON public.archie_global_authorizations;
CREATE TRIGGER trg_archie_authorizations_append_only
  BEFORE UPDATE ON public.archie_global_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.archie_authorizations_append_only();

-- Owner-only writes. is_current_user_admin() is the existing
-- admin gate from the Phase 8 migrations.
ALTER TABLE public.archie_global_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_authorizations" ON public.archie_global_authorizations;
CREATE POLICY "owner_read_authorizations" ON public.archie_global_authorizations
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "owner_write_authorizations" ON public.archie_global_authorizations;
CREATE POLICY "owner_write_authorizations" ON public.archie_global_authorizations
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "owner_revoke_authorizations" ON public.archie_global_authorizations;
CREATE POLICY "owner_revoke_authorizations" ON public.archie_global_authorizations
  FOR UPDATE TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 3. Global market observations (§5) — provenance enforced
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_global_market_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector text NOT NULL,
  kind text NOT NULL
    CHECK (kind IN (
      'PRICE_OBSERVATION', 'AVAILABILITY_OBSERVATION', 'TREND_OBSERVATION',
      'COMPETITOR_SIGNAL', 'SUPPLY_CHAIN_SIGNAL', 'ECONOMIC_INDICATOR',
      'BUSINESS_MODEL_NOTE', 'REGIONAL_DIFFERENCE'
    )),
  region text NOT NULL,
  observed_at timestamptz NOT NULL,
  source text NOT NULL,
  statement text NOT NULL,
  currency text,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  validation_state text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (validation_state IN ('VERIFIED','OWNER_PROVIDED','CONFIGURED','INFERRED','UNVERIFIED')),
  -- Raw observations can never be born verified or configured.
  CONSTRAINT observation_born_unverified
    CHECK (validation_state IN ('UNVERIFIED','INFERRED','OWNER_PROVIDED')),
  informs_domain text,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_obs_sector_region
  ON public.archie_global_market_observations (sector, region, observed_at DESC);

ALTER TABLE public.archie_global_market_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_market_observations" ON public.archie_global_market_observations;
CREATE POLICY "read_market_observations" ON public.archie_global_market_observations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin_write_market_observations" ON public.archie_global_market_observations;
CREATE POLICY "admin_write_market_observations" ON public.archie_global_market_observations
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

-- ---------------------------------------------------------
-- 4. Inspection reports (§2) — anti-fabrication contract
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_inspection_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  stage text NOT NULL DEFAULT 'AUTHORIZED'
    CHECK (stage IN ('AUTHORIZED','CRAWLED','EXTRACTED','INSPECTED','ANALYZED','REPORTED','RECOMMENDED')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_layers jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_url
  ON public.archie_inspection_reports (url, inspected_at DESC);

ALTER TABLE public.archie_inspection_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_inspection_reports" ON public.archie_inspection_reports;
CREATE POLICY "read_inspection_reports" ON public.archie_inspection_reports
  FOR SELECT TO authenticated
  USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_inspection_reports" ON public.archie_inspection_reports;
CREATE POLICY "admin_write_inspection_reports" ON public.archie_inspection_reports
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());
