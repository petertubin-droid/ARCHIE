-- =========================================================
-- ARCHIE STAGE 1 — Message starring (owner directive
-- 2026-09-14: WhatsApp-style message actions — mark/star)
-- =========================================================

ALTER TABLE public.frelux_archie_messages
  ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;
