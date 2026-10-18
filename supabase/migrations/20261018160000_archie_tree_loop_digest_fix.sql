-- =========================================================
-- TREE LOOP FIX (2026-10-18): Supabase installs pgcrypto in
-- the `extensions` schema, so the gap RPC's digest() call
-- failed at runtime (search_path is public,pg_temp). Use the
-- schema-qualified extensions.digest explicitly.
-- =========================================================

CREATE OR REPLACE FUNCTION public.archie_log_knowledge_gap(
  p_question text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_normalized text;
  v_id text;
BEGIN
  IF p_question IS NULL THEN RETURN; END IF;
  v_normalized := left(btrim(regexp_replace(p_question, '\s+', ' ', 'g')), 300);
  IF v_normalized = '' THEN RETURN; END IF;
  v_id := encode(extensions.digest(lower(v_normalized), 'sha256'), 'hex');
  INSERT INTO public.frelux_archie_knowledge_gaps (id, question, source)
  VALUES (v_id, v_normalized, 'copilot')
  ON CONFLICT (id) DO UPDATE
    SET times_seen = public.frelux_archie_knowledge_gaps.times_seen + 1,
        last_seen = now(),
        resolved = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archie_log_knowledge_gap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archie_log_knowledge_gap(text) TO service_role;
