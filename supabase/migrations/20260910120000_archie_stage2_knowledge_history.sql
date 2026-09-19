-- =========================================================
-- FRELUX ARCHIE STAGE 2 — KNOWLEDGE VAULT VERSION HISTORY
--
-- Real versioning for the ARCHIE Knowledge Core: a trigger
-- snapshots every frelux_knowledge_items row into
-- frelux_archie_knowledge_history BEFORE it is modified, so
-- the Owner can inspect any item's full lineage and roll back
-- to any prior version (spec: inspect / edit / scope /
-- version, human-in-the-loop).
--
-- Writes happen only via the trigger (table owner), reads are
-- admin-gated — mirroring frelux_knowledge_items policy.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.frelux_archie_knowledge_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.frelux_knowledge_items(id) ON DELETE CASCADE,
  version integer NOT NULL,
  topic text NOT NULL,
  capability text NOT NULL,
  scope text NOT NULL,
  scope_key text,
  content jsonb NOT NULL,
  evidence_state text NOT NULL,
  confidence numeric,
  change_reason text,
  approved_by uuid,
  approved_date timestamptz,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_frelux_archie_knowledge_history_item
  ON public.frelux_archie_knowledge_history (item_id, version DESC);

ALTER TABLE public.frelux_archie_knowledge_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read knowledge history" ON public.frelux_archie_knowledge_history;
CREATE POLICY "admins read knowledge history" ON public.frelux_archie_knowledge_history
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Snapshot BEFORE every update: the OLD state is preserved.
CREATE OR REPLACE FUNCTION public.frelux_archie_snapshot_knowledge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.frelux_archie_knowledge_history (
    item_id, version, topic, capability, scope, scope_key,
    content, evidence_state, confidence, change_reason,
    approved_by, approved_date
  ) VALUES (
    OLD.id, OLD.version, OLD.topic, OLD.capability, OLD.scope, OLD.scope_key,
    OLD.content, OLD.evidence_state, OLD.confidence, OLD.change_reason,
    OLD.approved_by, OLD.approved_date
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_history_snapshot
  ON public.frelux_knowledge_items;
CREATE TRIGGER trg_knowledge_history_snapshot
  BEFORE UPDATE ON public.frelux_knowledge_items
  FOR EACH ROW EXECUTE FUNCTION public.frelux_archie_snapshot_knowledge();

REVOKE ALL ON FUNCTION public.frelux_archie_snapshot_knowledge() FROM PUBLIC;
GRANT SELECT ON public.frelux_archie_knowledge_history TO authenticated;
