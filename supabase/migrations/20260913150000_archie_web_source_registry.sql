-- =========================================================
-- ARCHIE PRIORITY WEB KNOWLEDGE SOURCE REGISTRY (2026-09-10)
-- Anatomy binding update: the eyes (Perception / Vision)
-- subsystem now includes the real web-source registry —
-- intelligent source selection for web intelligence.
--
-- The registry itself is a live code module
-- (native-engine/web-sources.ts); this migration records the
-- binding in the anatomical skeleton so the registry is part
-- of the architecture, not a loose file. Idempotent.
-- =========================================================

-- 1. Eyes (perception / web research) code bindings now
--    include the priority source registry.
UPDATE public.archie_subsystems
SET code_bindings = code_bindings || '["supabase/functions/_shared/archie-ai/native-engine/web-sources.ts"]'::jsonb
WHERE key = 'eyes'
  AND NOT (
    code_bindings ? 'supabase/functions/_shared/archie-ai/native-engine/web-sources.ts'
  );

-- 2. Mouth (communication) mentions the registry in its
--    purpose so the anatomy reflects source-aware research
--    reporting. (Kept minimal: no functional change.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.archie_subsystems WHERE key = 'eyes'
  ) THEN
    UPDATE public.archie_subsystems
    SET purpose = purpose ||
      ' Includes the PRIORITY WEB KNOWLEDGE SOURCE REGISTRY: research queries are classified by knowledge domain and the most appropriate trusted sources (wikipedia/britannica, MDN/github/stackoverflow/python/node docs, scholar/arxiv/pubmed, NIST/MITRE ATT&CK/OWASP/CVE) are searched first; newly discovered sources are classified and held as evaluating until evaluated — never auto-trusted. Owner directive 2026-09-10.'
    WHERE key = 'eyes'
      AND purpose NOT LIKE '%PRIORITY WEB KNOWLEDGE SOURCE REGISTRY%';
  ELSE
    RAISE EXCEPTION 'archie_subsystems seed missing eyes — anatomy migration 20260910200000 did not run';
  END IF;
END $$;

-- 3. SELF-VERIFY: the binding must be present afterwards.
DO $$
DECLARE
  bound boolean;
BEGIN
  SELECT code_bindings ? 'supabase/functions/_shared/archie-ai/native-engine/web-sources.ts'
  INTO bound
  FROM public.archie_subsystems
  WHERE key = 'eyes';
  IF bound IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'web-sources.ts not bound to eyes subsystem — registry anatomy binding FAILED';
  END IF;
END $$;
