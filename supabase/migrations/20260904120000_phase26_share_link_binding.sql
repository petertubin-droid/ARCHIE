-- =========================================================
-- Phase 26: Share-Link & Client-Binding RLS Hardening
-- 2026-09-04
--
-- Follow-up audit to Phase 23. Three gaps the Phase 23 audit
-- did not cover:
--
-- 1. HIGH — client_estimates public policies did not bind to
--    the share token. The SELECT policy
--    "client_estimates_public_view" only checked that the ROW
--    had a share_token (IS NOT NULL) — any anonymous visitor
--    could list EVERY shared estimate in the system via
--    GET /rest/v1/client_estimates, exposing client names,
--    emails, phone numbers and full pricing. The UPDATE policy
--    "client_estimates_public_update" had the same flaw: anyone
--    could tamper with any shared estimate (status, prices,
--    client_email, terms...) without knowing its token.
--
--    Fix: replace both policies with two SECURITY DEFINER RPC
--    functions that take the token as an argument and validate
--    it server-side (the standard Supabase share-link pattern —
--    supabase-js cannot send per-request headers, so RLS alone
--    cannot bind the requester to the token).
--      - fetch_shared_estimate(p_token)  → view + auto-mark viewed
--      - respond_to_client_estimate(p_token, p_action, p_feedback)
--                                      → approve / request_changes
--
-- 2. MEDIUM — estimation_estimates / estimation_estimate_items
--    SELECT & UPDATE policies used "(client_hash IS NOT NULL)"
--    without comparing it to the requester — any visitor could
--    read and modify every anonymous estimate that had a
--    client_hash. Fix: bind to the x-client-hash request header
--    (same pattern already used by advanced_estimates and
--    rewarded_unlock_log). UI-created estimates have
--    client_hash = NULL, so no client flow changes are needed.
--
-- 3. MEDIUM — advanced_estimates INSERT with_check allowed rows
--    with user_id NULL and arbitrary client_hash (spam rows).
--    Tighten to require client_hash to match the request's
--    x-client-hash header. The client now sends that header via
--    a derived Supabase client (src/lib/supabase.ts).
--
-- NOTE: client_estimates deliberately does NOT get FORCE ROW
-- LEVEL SECURITY — the SECURITY DEFINER functions above are
-- owned by postgres and must bypass RLS to serve share links.
-- =========================================================

-- =========================================================
-- 1a. client_estimates — SECURITY DEFINER share-link RPCs
-- =========================================================

-- Returns jsonb (not the composite type) so that a missing/invalid
-- token serializes as JSON null — PostgREST serializes a NULL
-- composite return value as an object of null fields, which would
-- break the client's not-found handling.
CREATE OR REPLACE FUNCTION public.fetch_shared_estimate(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate public.client_estimates;
BEGIN
  -- Basic token sanity check (share tokens are UUIDs, not SQL)
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_estimate
  FROM public.client_estimates
  WHERE share_token = p_token
    AND status IN ('sent', 'viewed', 'approved', 'changes_requested')
  LIMIT 1;

  IF v_estimate.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Auto-mark as viewed (mirrors previous client-side behaviour)
  IF v_estimate.status = 'sent' THEN
    UPDATE public.client_estimates
    SET status = 'viewed',
        viewed_at = now(),
        updated_at = now()
    WHERE id = v_estimate.id
      AND status = 'sent';
    v_estimate.status := 'viewed';
    v_estimate.viewed_at := now();
  END IF;

  RETURN to_jsonb(v_estimate);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_client_estimate(
  p_token text,
  p_action text,
  p_feedback text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT id, status INTO v_id, v_status
  FROM public.client_estimates
  WHERE share_token = p_token
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_action = 'approve' THEN
    IF v_status NOT IN ('sent', 'viewed', 'changes_requested') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
    END IF;
    UPDATE public.client_estimates
    SET status = 'approved',
        approved_at = now(),
        updated_at = now()
    WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'status', 'approved');

  ELSIF p_action = 'request_changes' THEN
    IF v_status NOT IN ('sent', 'viewed') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
    END IF;
    IF p_feedback IS NULL OR btrim(p_feedback) = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'feedback_required');
    END IF;
    UPDATE public.client_estimates
    SET status = 'changes_requested',
        changes_requested_at = now(),
        client_feedback = p_feedback,
        updated_at = now()
    WHERE id = v_id;
    RETURN jsonb_build_object('ok', true, 'status', 'changes_requested');

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;
END;
$$;

-- Grant and lock down
GRANT EXECUTE ON FUNCTION public.fetch_shared_estimate(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_client_estimate(text, text, text) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fetch_shared_estimate(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_client_estimate(text, text, text) FROM PUBLIC;

-- =========================================================
-- 1b. client_estimates — drop the unbound public policies
-- =========================================================
DROP POLICY IF EXISTS "client_estimates_public_view" ON public.client_estimates;
DROP POLICY IF EXISTS "client_estimates_public_update" ON public.client_estimates;

-- =========================================================
-- 2. estimation_estimates — bind client_hash to the request
-- =========================================================
DROP POLICY IF EXISTS "est_estimates_select_own" ON public.estimation_estimates;
CREATE POLICY "est_estimates_select_own"
  ON public.estimation_estimates FOR SELECT
  TO anon, authenticated
  USING (
    (user_id = auth.uid())
    OR (client_hash = (current_setting('request.headers', true))::json ->> 'x-client-hash')
    OR is_admin()
  );

DROP POLICY IF EXISTS "est_estimates_update_own" ON public.estimation_estimates;
CREATE POLICY "est_estimates_update_own"
  ON public.estimation_estimates FOR UPDATE
  TO anon, authenticated
  USING (
    (user_id = auth.uid())
    OR (client_hash = (current_setting('request.headers', true))::json ->> 'x-client-hash')
    OR is_admin()
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR (user_id IS NULL)
    OR is_admin()
  );

-- =========================================================
-- 2b. estimation_estimate_items — same binding
-- =========================================================
DROP POLICY IF EXISTS "est_items_select_own" ON public.estimation_estimate_items;
CREATE POLICY "est_items_select_own"
  ON public.estimation_estimate_items FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimation_estimates e
      WHERE e.id = estimation_estimate_items.estimate_id
        AND (
          (e.user_id = auth.uid())
          OR (e.client_hash = (current_setting('request.headers', true))::json ->> 'x-client-hash')
          OR is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "est_items_update_own" ON public.estimation_estimate_items;
CREATE POLICY "est_items_update_own"
  ON public.estimation_estimate_items FOR UPDATE
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.estimation_estimates e
      WHERE e.id = estimation_estimate_items.estimate_id
        AND (
          (e.user_id = auth.uid())
          OR (e.client_hash = (current_setting('request.headers', true))::json ->> 'x-client-hash')
          OR is_admin()
        )
    )
  );

-- =========================================================
-- 3. advanced_estimates — require client_hash to match the
--    request on INSERT (blocks spam rows with arbitrary hashes)
-- =========================================================
DROP POLICY IF EXISTS "insert_own_estimates" ON public.advanced_estimates;
CREATE POLICY "insert_own_estimates"
  ON public.advanced_estimates FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (user_id = auth.uid())
    OR (
      user_id IS NULL
      AND client_hash IS NOT NULL
      AND client_hash = (current_setting('request.headers', true))::json ->> 'x-client-hash'
    )
  );
