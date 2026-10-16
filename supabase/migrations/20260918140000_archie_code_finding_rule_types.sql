-- =========================================================
-- ARCHIE CODE INTELLIGENCE — DETERMINISTIC SCAN FINDING TYPES
-- (owner directive 2026-09-16: activate the Code Intelligence
-- panel — the chat tool files REAL deterministic scan
-- findings into archie_code_findings.)
--
-- The chat code_intelligence tool runs a deterministic scanner
-- (hardcoded secrets, credential assignments, eval usage, raw
-- HTML injection, console.log, TODO markers). Its rule names
-- are added as first-class finding types so the scan files
-- HONEST rows instead of squeezing every rule into the wrong
-- existing category. Additive + idempotent: the same pattern
-- as 20260915220000_archie_derived_status.sql.
-- =========================================================

ALTER TABLE public.archie_code_findings
  DROP CONSTRAINT IF EXISTS archie_code_findings_type_check;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'archie_code_findings_type_check'
                 AND conrelid = 'public.archie_code_findings'::regclass) THEN
ALTER TABLE public.archie_code_findings
  ADD CONSTRAINT archie_code_findings_type_check
  CHECK (type IN ('PLACEHOLDER','HARDCODED_VALUE','MOCK_RESULT','FAKE_CALCULATION',
                  'DISCONNECTED_FUNCTION','INCORRECT_FORMULA','DUPLICATED_RULE',
                  'UNCONFIGURED_RULE','BROKEN_EDGE_FUNCTION','UNVERIFIED_PROVENANCE',
                  'HARDCODED_SECRET','CREDENTIAL_ASSIGNMENT','EVAL_USAGE',
                  'RAW_HTML_INJECTION','CONSOLE_LOG','TODO_MARKER'));
  END IF;
END
$mig$;
