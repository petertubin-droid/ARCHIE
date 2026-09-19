-- =========================================================
-- ARCHIE SUPER MODEL LAYER — TASK COMPLETION ANATOMY BINDING
-- (owner directive 2026-09-16)
--
-- The hands (Action / Task Execution) subsystem now includes
-- the supervised task completion engine — decomposition,
-- per-step verified execution, bounded retry, and a
-- deterministic completion verdict over recorded evidence.
-- Idempotent: safe to re-apply.
-- =========================================================

-- 1. Hands code bindings now include the task completion engine.
UPDATE public.archie_subsystems
SET code_bindings = code_bindings || '["supabase/functions/_shared/archie-ai/cognitive/task-completion.ts"]'::jsonb
WHERE key = 'hands'
  AND NOT (
    code_bindings ? 'supabase/functions/_shared/archie-ai/cognitive/task-completion.ts'
  );

-- 2. The purpose records the supervised completion contract.
UPDATE public.archie_subsystems
SET purpose = 'Supervised task execution: compound tasks decompose into clauses and run one full gated cognitive cycle per step, each verified with a bounded retry, ending in a deterministic ACHIEVED/PARTIAL/NOT_ACHIEVED verdict over recorded evidence — never fabricated progress'
WHERE key = 'hands'
  AND purpose NOT LIKE '%deterministic ACHIEVED/PARTIAL/NOT_ACHIEVED verdict%';
