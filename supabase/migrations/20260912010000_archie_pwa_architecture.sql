-- =========================================================
-- ARCHIE PWA ARCHITECTURE — PERMANENT CAPABILITY EXPOSURE
-- RULE (OWNER DIRECTIVE)
--
-- Seeds the Owner's standing rule into ARCHIE's core
-- principles (same idempotent pattern as the engineering
-- objective): the standalone ARCHIE PWA is the Owner's
-- COMPLETE command center. Every new core capability is
-- integrated into the PWA in the SAME feature implementation.
--
-- ON CONFLICT DO NOTHING: upgrades, migrations and re-deploys
-- can never overwrite or erase this principle.
-- =========================================================

INSERT INTO public.frelux_archie_core_principles (
  principle_id, title, content, origin, status
) VALUES (
  'pwa_complete_capability_exposure',
  'ARCHIE PWA Complete Capability Exposure (Permanent Rule)',
  jsonb_build_object('rule', $rule$Whenever a new capability is added to ARCHIE's core system, it must be automatically designed and integrated into the standalone ARCHIE PWA as part of the same feature implementation. The PWA and desktop/admin interfaces use the same ARCHIE identity, backend, memory, knowledge, projects, coding workspace, evolution state and permissions. No ARCHIE capability may exist in the core system that is intentionally inaccessible from the Owner's PWA, unless the Owner Authority Layer explicitly requires restricted access. No PWA-only versions, duplicate ARCHIE databases, duplicate intelligence, or separate feature implementations. The PWA is the Owner's complete mobile command center for ARCHIE.$rule$::text),
  'OWNER_DIRECTIVE',
  'ACTIVE'
) ON CONFLICT (principle_id) DO NOTHING;
