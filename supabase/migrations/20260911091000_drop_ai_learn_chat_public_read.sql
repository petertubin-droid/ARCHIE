-- =========================================================
-- Drop legacy wide-open read policy on ai_learn_chat
-- (audit M1 fix, 2026-09-10)
--
-- The live database retained `public_read_ai_learn_chat`
-- (SELECT ... TO anon, authenticated USING (true)) even though
-- phase2b_rls_policy_hardening (20260817000000) drops it — the
-- table had drifted. Anyone could read all AI learn-chat
-- transcripts. The restricted session-scoped policy remains.
--
-- Re-declared here (idempotent) so every environment converges.
-- =========================================================

DROP POLICY IF EXISTS "public_read_ai_learn_chat" ON public.ai_learn_chat;
