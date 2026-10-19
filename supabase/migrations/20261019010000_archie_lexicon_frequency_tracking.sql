-- =========================================================
-- LEXICON FREQUENCY TRACKING (2026-10-19)
--
-- Found while closing the prune gap: prune_lexicon_long_tail
-- is correct but inert — ALL 87,716 lexicon_words have
-- frequency NULL because nothing ever writes it. Usage-based
-- pruning can never act without usage evidence. This RPC is
-- the write path: lexicon retrieval bumps every successfully
-- matched word on each lookup (fire-and-forget).
--
-- SECURITY DEFINER + service_role only: anon/authenticated
-- cannot manipulate pruning evidence.
-- =========================================================

CREATE OR REPLACE FUNCTION public.archie_bump_lexicon_frequency(
  p_word_ids uuid[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_word_ids IS NULL OR array_length(p_word_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.lexicon_words
  SET frequency = COALESCE(frequency, 0) + 1
  WHERE id = ANY (p_word_ids);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archie_bump_lexicon_frequency(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archie_bump_lexicon_frequency(uuid[]) TO service_role;
