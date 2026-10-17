-- ============================================================
-- ARCHIE GOAL ENGINE (gap 18 / suggested engine 7)
-- Migration 20261018060000 — AUTHORED ONLY, NOT YET APPLIED:
-- ARCHIE is temporarily disconnected from its database; this
-- migration ships with the repo and applies on the new
-- database during re-wiring. Fresh-database safe.
--
-- Long-horizon owner-declared goals with steps, progress, and
-- a full audit event trail. Steps get deterministic positions
-- (trigger-assigned max+1); goal last_progress_at is
-- maintained by step completion. Service-role only (RLS, no
-- policies).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.archie_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_progress_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.archie_goal_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.archie_goals(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 200),
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (goal_id, position)
);

CREATE TABLE IF NOT EXISTS public.archie_goal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.archie_goals(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS archie_goal_steps_goal_idx
  ON public.archie_goal_steps (goal_id, position);
CREATE INDEX IF NOT EXISTS archie_goal_events_goal_idx
  ON public.archie_goal_events (goal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS archie_goals_status_idx
  ON public.archie_goals (status, created_at);

-- Deterministic step positions: max+1 per goal.
CREATE OR REPLACE FUNCTION public.archie_goal_step_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.position IS NULL OR NEW.position = 0 THEN
    SELECT COALESCE(MAX(position), 0) + 1 INTO v_next
      FROM public.archie_goal_steps WHERE goal_id = NEW.goal_id;
    NEW.position := v_next;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS archie_goal_step_position_trg
  ON public.archie_goal_steps;
CREATE TRIGGER archie_goal_step_position_trg
  BEFORE INSERT ON public.archie_goal_steps
  FOR EACH ROW EXECUTE FUNCTION public.archie_goal_step_position();

-- Goal progress timestamp follows step completion.
CREATE OR REPLACE FUNCTION public.archie_goal_progress_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.done AND (TG_OP = 'INSERT' OR OLD.done = false) THEN
    UPDATE public.archie_goals
      SET last_progress_at = COALESCE(NEW.completed_at, now())
      WHERE id = NEW.goal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS archie_goal_progress_trg
  ON public.archie_goal_steps;
CREATE TRIGGER archie_goal_progress_trg
  AFTER INSERT OR UPDATE ON public.archie_goal_steps
  FOR EACH ROW EXECUTE FUNCTION public.archie_goal_progress_stamp();

REVOKE ALL ON FUNCTION public.archie_goal_step_position() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.archie_goal_progress_stamp() FROM anon, authenticated;

ALTER TABLE public.archie_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_goal_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archie_goal_events ENABLE ROW LEVEL SECURITY;
