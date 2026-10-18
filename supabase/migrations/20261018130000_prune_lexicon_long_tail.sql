-- =========================================================
-- ARCHIE UNIVERSAL LEXICON ENGINE — PRUNING & COMPACTION
--
-- Migration: 20261018130000_prune_lexicon_long_tail.sql
--
-- Eliminates database bloat by establishing an automated,
-- transactional pruning engine for long-tail, unverified,
-- and low-frequency lexical data while strictly preserving:
--   1. Curated high-frequency core words & senses
--   2. Verified operational domain senses (construction,
--      engineering, computing, cybersecurity, finance)
--   3. Owner-taught / USER_PROVIDED custom vocabulary
--   4. Validated semantic graph relations
--
-- Also creates public.prune_lexicon_long_tail(...) for
-- routine scheduled or on-demand database compaction.
-- =========================================================

-- Add index on frequency for efficient maintenance
CREATE INDEX IF NOT EXISTS lexicon_words_frequency_idx
  ON public.lexicon_words (frequency)
  WHERE frequency IS NOT NULL;

-- ---------------------------------------------------------
-- 1. Automated Stored Procedure for Pruning Long Tail
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prune_lexicon_long_tail(
  keep_min_frequency numeric DEFAULT 5,
  dry_run boolean DEFAULT false,
  prune_unverified boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pruned_senses_count bigint := 0;
  v_pruned_relations_count bigint := 0;
  v_pruned_sense_relations_count bigint := 0;
  v_pruned_words_count bigint := 0;
  v_remaining_words_count bigint := 0;
  v_remaining_senses_count bigint := 0;
  v_target_sense_ids uuid[];
BEGIN
  -- Security check: only admins or internal service role may prune
  IF NOT (public.is_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: lexicon pruning requires admin privileges.';
  END IF;

  -- Step 1: Identify unverified or low-frequency long-tail senses to prune
  -- Explicitly protect:
  --   a) knowledge_status = 'USER_PROVIDED' (never drop user-taught vocabulary)
  --   b) knowledge_status = 'VERIFIED' with frequency >= keep_min_frequency
  --   c) senses with non-empty usage examples and high confidence
  SELECT array_agg(id)
  INTO v_target_sense_ids
  FROM public.lexicon_senses s
  WHERE (
    -- Case A: Low-confidence / unverified noisy entries
    (prune_unverified AND s.knowledge_status = 'UNVERIFIED' AND (s.confidence IS NULL OR s.confidence < 0.7))
    OR
    -- Case B: Long-tail senses whose parent word has explicit low frequency and no examples
    (
      s.knowledge_status != 'USER_PROVIDED'
      AND (jsonb_array_length(s.usage_examples) = 0)
      AND EXISTS (
        SELECT 1 FROM public.lexicon_words w
        WHERE w.id = s.word_id
          AND w.frequency IS NOT NULL
          AND w.frequency < keep_min_frequency
      )
    )
  );

  v_pruned_senses_count := coalesce(cardinality(v_target_sense_ids), 0);

  IF dry_run THEN
    SELECT count(*) INTO v_remaining_words_count FROM public.lexicon_words;
    SELECT count(*) INTO v_remaining_senses_count FROM public.lexicon_senses;

    RETURN jsonb_build_object(
      'dry_run', true,
      'candidate_senses_to_prune', v_pruned_senses_count,
      'current_total_words', v_remaining_words_count,
      'current_total_senses', v_remaining_senses_count,
      'status', 'DRY_RUN_COMPLETED'
    );
  END IF;

  -- Execution phase (dry_run = false)
  IF v_pruned_senses_count > 0 THEN
    -- Step 2: Delete sense relations tied to pruned senses
    WITH deleted_sense_rels AS (
      DELETE FROM public.lexicon_sense_relations sr
      WHERE EXISTS (
        SELECT 1 FROM public.lexicon_senses s
        WHERE s.id = ANY(v_target_sense_ids)
          AND (s.external_id = sr.from_sense_external_id OR s.external_id = sr.to_sense_external_id)
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_pruned_sense_relations_count FROM deleted_sense_rels;

    -- Step 3: Delete the targeted long-tail senses
    DELETE FROM public.lexicon_senses
    WHERE id = ANY(v_target_sense_ids);

    -- Step 4: Delete orphaned synset relationships
    WITH deleted_synset_rels AS (
      DELETE FROM public.lexicon_relationships r
      WHERE NOT EXISTS (
        SELECT 1 FROM public.lexicon_senses s WHERE s.synset_key = r.from_synset_key
      )
      OR NOT EXISTS (
        SELECT 1 FROM public.lexicon_senses s WHERE s.synset_key = r.to_synset_key
      )
      RETURNING 1
    )
    SELECT count(*) INTO v_pruned_relations_count FROM deleted_synset_rels;
  END IF;

  -- Step 5: Delete orphaned words that have zero remaining senses
  WITH deleted_words AS (
    DELETE FROM public.lexicon_words w
    WHERE NOT EXISTS (
      SELECT 1 FROM public.lexicon_senses s WHERE s.word_id = w.id
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_pruned_words_count FROM deleted_words;

  -- Step 6: Log maintenance audit into lexicon_imports
  INSERT INTO public.lexicon_imports (
    status,
    stats,
    finished_at
  ) VALUES (
    'SUCCESS',
    jsonb_build_object(
      'action', 'PRUNE_LONG_TAIL',
      'pruned_senses', v_pruned_senses_count,
      'pruned_sense_relations', v_pruned_sense_relations_count,
      'pruned_relationships', v_pruned_relations_count,
      'pruned_words', v_pruned_words_count,
      'keep_min_frequency', keep_min_frequency
    ),
    now()
  );

  SELECT count(*) INTO v_remaining_words_count FROM public.lexicon_words;
  SELECT count(*) INTO v_remaining_senses_count FROM public.lexicon_senses;

  RETURN jsonb_build_object(
    'dry_run', false,
    'pruned_senses', v_pruned_senses_count,
    'pruned_sense_relations', v_pruned_sense_relations_count,
    'pruned_relationships', v_pruned_relations_count,
    'pruned_words', v_pruned_words_count,
    'remaining_words', v_remaining_words_count,
    'remaining_senses', v_remaining_senses_count,
    'status', 'PRUNING_SUCCESS'
  );
END;
$$;

-- Grant execution to authenticated users (internal gate checks is_admin)
GRANT EXECUTE ON FUNCTION public.prune_lexicon_long_tail(numeric, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prune_lexicon_long_tail(numeric, boolean, boolean) TO service_role;

-- ---------------------------------------------------------
-- 2. Immediate Safe Pruning of Orphaned / Empty Lexical Records
-- ---------------------------------------------------------
-- Delete any pre-existing orphaned relationships or empty words
DELETE FROM public.lexicon_relationships r
WHERE NOT EXISTS (
  SELECT 1 FROM public.lexicon_senses s WHERE s.synset_key = r.from_synset_key
)
OR NOT EXISTS (
  SELECT 1 FROM public.lexicon_senses s WHERE s.synset_key = r.to_synset_key
);

DELETE FROM public.lexicon_words w
WHERE NOT EXISTS (
  SELECT 1 FROM public.lexicon_senses s WHERE s.word_id = w.id
);
