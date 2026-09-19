-- =========================================================
-- FRELUX SECURITY FIX F1 (forensic audit 2026-09-13)
-- Enable Row Level Security on the 11 ARCHIE tables that were
-- created without it.
--
-- Before this migration these tables were world-readable AND
-- world-writable by anyone holding the PUBLIC anon key:
--   * frelux_archie_whatsapp_*  -> message-privacy breach
--   * frelux_archie_native_facts/outcomes, frelux_vocabulary
--     -> remote knowledge-poisoning of ARCHIE
--
-- RLS enabled with NO permissive policies = deny-all for the
-- anon and authenticated roles (Supabase default-deny). The
-- ARCHIE/frelux edge functions use the service role, which
-- bypasses RLS, so no functional change for the application.
-- Verified: no client (anon) code queries any of these tables.
-- =========================================================

ALTER TABLE public.frelux_archie_domain_constants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_engine_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_episodic_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_native_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_native_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_whatsapp_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_archie_whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frelux_vocabulary ENABLE ROW LEVEL SECURITY;

-- Explicit documentation-grade policies are intentionally NOT
-- added: with RLS on and no policies, anon/authenticated have
-- zero access. If a table ever needs user access, add a scoped
-- policy at that time (never blanket access).
