-- =========================================================
-- ARCHIE COGNITIVE ANATOMY — FOUNDATIONAL ARCHITECTURE
-- Migration 20260910200000
--
-- Owner directive (2026-09-10): encode ARCHIE's cognitive
-- anatomy (the human-body conceptual model) as a REAL
-- foundational architecture. No metaphors without backends,
-- no mocks, no placeholders, no cosmetic rows.
--
-- Three structures, all real:
--
-- 1. archie_constitution (DNA) — permanent identity,
--    architecture, objectives, principles and Owner Authority
--    rules. IMMUTABLE by construction: an append-only
--    trigger blocks UPDATE/DELETE for EVERY role including
--    service role. New versions arrive ONLY as new INSERTs
--    with a new version number and a fresh SHA-256 checksum
--    (applied via owner-run migrations, which run as the
--    database owner outside this trigger's reach by intent).
--
-- 2. archie_subsystems (SKELETON registry) — the 22 anatomical
--    components, each bound to its REAL implementation module
--    and data source. Admin read; no ARCHIE-facing write path.
--
-- 3. archie_subsystem_status (live organ health) — written
--    ONLY by the archie-anatomy health runner (service role),
--    read by the Owner (admin). Real probe results, with
--    checked_at timestamps — never presented as live when
--    stale.
--
-- Honesty rule (constitution article VII): a subsystem that
-- has no real backend yet (e.g. EARS/audio) is registered
-- with operational = false and is reported NOT_OPERATIONAL
-- everywhere. Never faked.
-- =========================================================

-- ---------------------------------------------------------
-- 1. DNA — ARCHIE CORE CONSTITUTION
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_constitution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  articles jsonb NOT NULL,
  checksum text NOT NULL,
  notes text,
  created_by uuid,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT constitution_checksum_format CHECK (char_length(checksum) = 64)
);

ALTER TABLE public.archie_constitution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_constitution" ON public.archie_constitution;
CREATE POLICY "admin_read_constitution"
  ON public.archie_constitution FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- No UPDATE/DELETE policy at all. The immutability trigger
-- below enforces append-only for EVERY role (service role
-- included) — ARCHIE can never rewrite its DNA.
CREATE OR REPLACE FUNCTION public.archie_constitution_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'ARCHIE constitution rows are immutable: UPDATE/DELETE is refused for every role. A new constitution version arrives only as a new INSERT (checksum-verified, owner-applied migration).'
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS constitution_immutable ON public.archie_constitution;
CREATE TRIGGER constitution_immutable
  BEFORE UPDATE OR DELETE ON public.archie_constitution
  FOR EACH ROW EXECUTE FUNCTION public.archie_constitution_immutable();

-- ---------------------------------------------------------
-- 2. SKELETON — SUBSYSTEM REGISTRY (22 organs)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_subsystems (
  key text PRIMARY KEY,
  organ text NOT NULL,
  name text NOT NULL,
  purpose text NOT NULL,
  -- REAL implementation binding — module paths that exist.
  code_bindings jsonb NOT NULL,
  data_bindings jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- false = honestly NOT_OPERATIONAL (no real backend yet)
  operational boolean NOT NULL DEFAULT true,
  criticality text NOT NULL DEFAULT 'STANDARD'
    CHECK (criticality IN ('CRITICAL','HIGH','STANDARD')),
  ordinal integer NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_subsystems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_subsystems" ON public.archie_subsystems;
CREATE POLICY "admin_read_subsystems"
  ON public.archie_subsystems FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_write_subsystems" ON public.archie_subsystems;
CREATE POLICY "admin_write_subsystems"
  ON public.archie_subsystems FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------
-- 3. LIVE ORGAN HEALTH — written only by the health runner
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archie_subsystem_status (
  subsystem_key text PRIMARY KEY REFERENCES public.archie_subsystems(key) ON DELETE CASCADE,
  status text NOT NULL
    CHECK (status IN ('HEALTHY','DEGRADED','OFFLINE','NOT_OPERATIONAL')),
  -- real probe details from the health runner
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  metric text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_date timestamptz NOT NULL DEFAULT now(),
  updated_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archie_subsystem_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_subsystem_status" ON public.archie_subsystem_status;
CREATE POLICY "admin_read_subsystem_status"
  ON public.archie_subsystem_status FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
-- No admin write policy: only the archie-anatomy runner
-- (service role) writes health — humans read, never fake it.

-- ---------------------------------------------------------
-- SEED: the constitution (v1) — checksum is verified at
-- runtime against the canonical code copy
-- (_shared/archie-ai/anatomy/constitution.ts). If they ever
-- diverge, the anatomy health check reports DEGRADED.
-- The checksum below must equal the code-side constant.
-- ---------------------------------------------------------
INSERT INTO public.archie_constitution (version, articles, checksum, notes)
VALUES (
  1,
  '{
    "identity": "ARCHIE is the Owner-integrated intelligence system of the FRELUX platform. One ARCHIE — every interface (FRELUX Admin, ARCHIE PWA, Coding Studio, trusted devices) is an authenticated surface to the same identity, memory, knowledge and authority.",
    "architecture": "ARCHIE is encoded as a cognitive anatomy of 22 real subsystems (heart, brain, head, dna, skeleton, spinal-cord, blood, eyes, ears, mouth, digestive, liver-kidneys, immune, hands, muscles, legs, nervous, pain, balance, stem-cells, healing, sleep). Every subsystem binds to a real implementation module and a real data source. A subsystem without a real backend is registered operational=false and reported NOT_OPERATIONAL honestly.",
    "cognitive_loop": "PERCEIVE, UNDERSTAND, REMEMBER, REASON, LEARN, PLAN, CREATE, VERIFY, ACT, OBSERVE RESULTS, LEARN AGAIN — continuously.",
    "knowledge_scope": "ARCHIE may continuously acquire and validate knowledge across programming, science, engineering, cybersecurity, construction, business, languages, mathematics, technology, culture and any other legitimate field. The knowledge architecture is extensible with no artificial fixed subject limit.",
    "owner_authority": "ARCHIE may learn, analyze, plan, draft, experiment in authorized sandboxes and propose improvements without per-event approval. ARCHIE can NEVER independently: rewrite its core authority, modify production code, deploy itself, grant itself permissions, remove security controls, destroy or migrate critical data, or take consequential external actions. Those are Owner-authorized operations, verified server-side.",
    "honesty": "ARCHIE never simulates a capability. No fake engine, no mock learning, no placeholder memory, no hardcoded AI responses, no disconnected buttons, no dormant intelligence waiting for an external provider.",
    "persistence": "This architecture persists across ARCHIE Core, database, Coding Studio, PWA, migrations, upgrades, trusted devices and future versions."
  }'::jsonb,
  '46a31993d9a5ddda4df0c00a44fd497a23b58efce694e6901bf205a4fb02e1a9',
  'Foundational constitution, encoded with the cognitive anatomy directive of 2026-09-10.'
) ON CONFLICT (version) DO NOTHING;

-- ---------------------------------------------------------
-- SEED: the 22 subsystems, bound to their real modules
-- ---------------------------------------------------------
INSERT INTO public.archie_subsystems (key, organ, name, purpose, code_bindings, data_bindings, operational, criticality, ordinal) VALUES
  ('heart','❤️','Native Archie Engine','The independent computational engine — processing, reasoning, inference and operation with zero external AI dependency.','["supabase/functions/_shared/archie-ai/native-engine/engine.ts","supabase/functions/_shared/archie-ai/runtime.ts"]'::jsonb,'["frelux_archie_execution_runs"]'::jsonb,true,'CRITICAL',1),
  ('brain','🧠','Memory & Knowledge','Persistent memory, learned knowledge, context, experiences, reasoning history, validated facts, language and coding knowledge, Owner-approved decisions.','["supabase/functions/_shared/archie-ai/native-engine/memory.ts","supabase/functions/_shared/archie-ai/native-engine/knowledge.ts","supabase/functions/_shared/archie-ai/cognitive/world-model.ts"]'::jsonb,'["frelux_knowledge_items","frelux_learning_records","archie_language_profiles","archie_language_entries"]'::jsonb,true,'CRITICAL',2),
  ('head','🧑','Cognitive Command Center','Coordinates identity, objectives, reasoning state, priorities, planning, attention and inter-system communication.','["supabase/functions/_shared/archie-ai/cognitive/orchestrator.ts","supabase/functions/_shared/archie-ai/cognitive/kernel.ts"]'::jsonb,'[]'::jsonb,true,'CRITICAL',3),
  ('dna','🧬','Archie Core Constitution','Permanent identity, foundational architecture, core objectives, principles and Owner Authority rules. Immutable by trigger for every role.','["supabase/functions/_shared/archie-ai/anatomy/constitution.ts"]'::jsonb,'["archie_constitution"]'::jsonb,true,'CRITICAL',4),
  ('skeleton','🦴','Core Architecture','The stable structural framework connecting all ARCHIE systems while allowing controlled expansion.','["supabase/functions/_shared/archie-ai/anatomy/registry.ts"]'::jsonb,'["archie_subsystems"]'::jsonb,true,'HIGH',5),
  ('spinal-cord','🧠','Central Control Bus','Reliable internal command routing between Engine, Memory, Knowledge, Perception, Tools, Security, Coding Studio, PWA and infrastructure.','["supabase/functions/_shared/archie-ai/runtime.ts","supabase/functions/_shared/archie-ai/execution/engine.ts"]'::jsonb,'["frelux_archie_execution_targets"]'::jsonb,true,'CRITICAL',6),
  ('blood','🩸','Information / Data Bus','Moves context, events, data and verified information between subsystems through the shared data layer.','["supabase/functions/_shared/archie-ai/native-engine/persistence.ts","supabase/functions/_shared/archie-ai/cognitive/persistence.ts"]'::jsonb,'[]'::jsonb,true,'HIGH',7),
  ('eyes','👁️','Perception / Vision','Analyzes websites, documents, code and other textual/visual information; web research and crawling.','["supabase/functions/_shared/archie-ai/cognitive/perception.ts","supabase/functions/_shared/archie-ai/native-engine/webresearch.ts"]'::jsonb,'[]'::jsonb,true,'HIGH',8),
  ('ears','👂','Voice / Audio','Receive and understand spoken instructions and audio information. HONEST STATUS: no real transcription backend exists yet — NOT_OPERATIONAL, never faked.','[]'::jsonb,'[]'::jsonb,false,'STANDARD',9),
  ('mouth','👄','Communication','Natural conversation, explanations, reports and user interaction across owner chat and visitor assistant surfaces.','["supabase/functions/archie-chat/index.ts","supabase/functions/_shared/archie-ai/native-engine/nlu.ts"]'::jsonb,'["frelux_chat_history"]'::jsonb,true,'CRITICAL',10),
  ('digestive','🍽️','Learning Pipeline','Processes newly acquired information, extracts knowledge, organizes it and prepares it for validation and long-term retention.','["supabase/functions/_shared/archie-ai/native-engine/learning.ts","supabase/functions/archie-ingestion/index.ts"]'::jsonb,'["frelux_learning_records"]'::jsonb,true,'CRITICAL',11),
  ('liver-kidneys','🧪','Validation & Filtering','Detects unreliable, duplicate, corrupt, malicious or unsupported information before it becomes trusted knowledge; content-hash dedup and validation gates.','["supabase/functions/_shared/archie-ai/cognitive/verification.ts","supabase/functions/_shared/archie-ai/cognitive/security-integrity.ts"]'::jsonb,'["frelux_knowledge_items.validation_status"]'::jsonb,true,'CRITICAL',12),
  ('immune','🛡️','Security & Integrity','Protects ARCHIE code, memory, database, identity, devices, communications and infrastructure; the consolidated security verdict gate, RLS and security events.','["supabase/functions/_shared/archie-ai/security/verdict.ts","src/lib/archie/capability-authority.ts","src/lib/archie/authorized-security.ts"]'::jsonb,'["frelux_security_events","archie_offensive_targets","archie_offensive_engagements"]'::jsonb,true,'CRITICAL',13),
  ('hands','🖐️','Tools & Actions','Authorized tool use — coding analysis, file inspection, web research, APIs and registered execution targets.','["supabase/functions/_shared/archie-ai/native-engine/tools.ts","supabase/functions/_shared/archie-ai/native-engine/coding.ts"]'::jsonb,'["frelux_archie_execution_targets"]'::jsonb,true,'HIGH',14),
  ('muscles','💪','Execution System','Performs computational workloads and authorized operations through the audited execution engine.','["supabase/functions/archie-execute/index.ts","supabase/functions/_shared/archie-ai/execution/engine.ts"]'::jsonb,'["frelux_archie_execution_runs"]'::jsonb,true,'HIGH',15),
  ('legs','🦵','Infrastructure & Deployment','Connects ARCHIE to authorized servers, cloud infrastructure, devices and deployment environments.','["netlify.toml","scripts/prerender.mjs"]'::jsonb,'["frelux_infrastructure_costs"]'::jsonb,true,'HIGH',16),
  ('nervous','⚡','Event / API Network','Fast, reliable event propagation and notifications throughout ARCHIE.','["supabase/functions/send-push-notification/index.ts","supabase/functions/_shared/archie-ai/execution/engine.ts"]'::jsonb,'["frelux_archie_execution_runs.initiator_system"]'::jsonb,true,'STANDARD',17),
  ('pain','🩺','Error & Anomaly System','Detects failures, unexpected behavior, degraded performance and abnormal states and feeds them back into reasoning.','["supabase/functions/_shared/archie-ai/native-engine/selfeval.ts","supabase/functions/report-error/index.ts"]'::jsonb,'["frelux_security_events"]'::jsonb,true,'HIGH',18),
  ('balance','⚖️','Decision & Authority Control','Keeps ARCHIE within permissions, safety boundaries and Owner Authority; the owner-authority layer that ARCHIE can never rewrite.','["src/lib/archie/evolution/authority.ts","src/lib/archie/authority-boundary.ts"]'::jsonb,'["archie_owner_authorizations"]'::jsonb,true,'CRITICAL',19),
  ('stem-cells','🧬','Controlled Evolution','New capabilities, modules and improvements without destabilizing the existing architecture; §9 change-request lifecycle.','["src/lib/archie/evolution/authority.ts","supabase/functions/archie-owner-auth/index.ts"]'::jsonb,'["archie_change_requests","archie_change_audit","archie_evolution_settings"]'::jsonb,true,'HIGH',20),
  ('healing','❤️‍🩹','Recovery & Rollback','Backup, integrity verification, fault recovery, version rollback and restoration after failed changes.','["supabase/functions/archie-core/index.ts"]'::jsonb,'["archie_installations","archie_migration_history"]'::jsonb,true,'HIGH',21),
  ('sleep','💤','Background Processing','Authorized background maintenance — knowledge indexing, consolidation, diagnostics, cleanup and optimization on schedule.','["supabase/functions/cleanup-old-errors/index.ts","supabase/functions/sitemap/index.ts"]'::jsonb,'["frelux_archie_execution_runs.initiator_system=SCHEDULED"]'::jsonb,true,'STANDARD',22)
ON CONFLICT (key) DO NOTHING;
