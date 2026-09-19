-- =========================================================
-- ARCHIE ENGINE STATES (owner directive 2026-09-14)
--
-- The Engines panel: every engine capability in ARCHIE's
-- honest manifest gets an owner-controlled activation state.
-- The state is REAL — the native engine consults it at its
-- capability dispatch points and refuses honestly when a
-- capability is switched off. No theater: an engine that
-- cannot be gated is marked protected in code and never
-- gets a toggle.
--
-- Security:
--   * Owner (admin) reads; only the service role writes
--     (through the owner-gated archie-engines edge function,
--     which verifies the caller's admin profile).
--   * Every toggle is audited to frelux_security_events.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.archie_engine_states (
  capability_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

ALTER TABLE public.archie_engine_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_engine_states" ON public.archie_engine_states;
CREATE POLICY "admin_read_engine_states"
  ON public.archie_engine_states FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- No INSERT/UPDATE/DELETE policies: only the service role
-- (owner-gated archie-engines function) may change states.

COMMENT ON TABLE public.archie_engine_states IS
  'Owner-controlled activation state for ARCHIE engine capabilities; consulted live by the native engine, toggled only through the owner-gated archie-engines function.';
