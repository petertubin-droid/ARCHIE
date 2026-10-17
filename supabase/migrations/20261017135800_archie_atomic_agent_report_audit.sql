-- Keep each internal agent work product and its terminal lifecycle event
-- in one database transaction. The immutable execution run UUID is the
-- idempotency key used to reconcile a lost worker response.

CREATE OR REPLACE FUNCTION public.archie_persist_agent_report_with_event(
  p_run_id uuid,
  p_agent_id uuid,
  p_actor_id uuid,
  p_summary text,
  p_detail jsonb,
  p_gates jsonb,
  p_engine text,
  p_event text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_report_id uuid;
  v_existing_agent_id uuid;
  v_existing_detail jsonb;
  v_actor_id uuid;
  v_existing_event_type text;
  v_existing_report_count integer;
  v_existing_event_count integer;
  v_reported_success boolean;
BEGIN
  IF p_run_id IS NULL OR p_agent_id IS NULL OR p_actor_id IS NULL THEN
    RAISE EXCEPTION 'run, agent, and actor IDs are required';
  END IF;
  IF p_event IS NULL OR p_event NOT IN ('REPORT', 'FAIL') THEN
    RAISE EXCEPTION 'terminal agent event must be REPORT or FAIL';
  END IF;
  IF p_detail IS NULL OR jsonb_typeof(p_detail) <> 'object'
     OR p_gates IS NULL OR jsonb_typeof(p_gates) <> 'object' THEN
    RAISE EXCEPTION 'agent report detail and gates must be JSON objects';
  END IF;
  IF p_summary IS NULL OR p_engine IS NULL OR btrim(p_engine) = '' THEN
    RAISE EXCEPTION 'agent report summary and engine are required';
  END IF;
  IF jsonb_typeof(p_detail -> 'executed') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'agent report detail requires a boolean executed value';
  END IF;
  IF (p_event = 'REPORT') IS DISTINCT FROM ((p_detail ->> 'executed')::boolean) THEN
    RAISE EXCEPTION 'terminal event conflicts with report execution outcome';
  END IF;

  SELECT created_by INTO v_actor_id
    FROM public.frelux_archie_internal_agents
    WHERE id = p_agent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'agent does not exist';
  END IF;
  IF v_actor_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'actor does not own the agent';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.frelux_archie_execution_runs
    WHERE id = p_run_id
      AND target_key = 'archie-agent-task'
      AND status = 'RUNNING'
  ) THEN
    RAISE EXCEPTION 'execution run is not an active archie-agent-task run';
  END IF;

  -- Serialize concurrent retries for the same run. Advisory-lock hash
  -- collisions only serialize unrelated work; they cannot corrupt it.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_run_id::text, 0));

  SELECT count(*) INTO v_existing_report_count
    FROM public.frelux_archie_agent_reports
    WHERE run_id = p_run_id;
  IF v_existing_report_count > 1 THEN
    RAISE EXCEPTION 'execution run has multiple existing agent reports; manual reconciliation required';
  END IF;

  SELECT id, agent_id, detail
    INTO v_report_id, v_existing_agent_id, v_existing_detail
    FROM public.frelux_archie_agent_reports
    WHERE run_id = p_run_id
    LIMIT 1;

  IF FOUND THEN
    IF v_existing_agent_id IS DISTINCT FROM p_agent_id THEN
      RAISE EXCEPTION 'execution run is already associated with a different agent report';
    END IF;
    v_reported_success := COALESCE((v_existing_detail ->> 'executed')::boolean, false);
    IF (p_event = 'REPORT') IS DISTINCT FROM v_reported_success THEN
      RAISE EXCEPTION 'retry result conflicts with the already-persisted report';
    END IF;
  ELSE
    v_reported_success := p_event = 'REPORT';
    INSERT INTO public.frelux_archie_agent_reports
      (agent_id, run_id, summary, detail, gates, engine)
    VALUES
      (p_agent_id, p_run_id, p_summary, p_detail, p_gates, p_engine)
    RETURNING id INTO v_report_id;
  END IF;

  SELECT count(*), (array_agg(event ORDER BY created_date DESC))[1]
    INTO v_existing_event_count, v_existing_event_type
    FROM public.frelux_archie_agent_events
    WHERE agent_id = p_agent_id
      AND event IN ('REPORT', 'FAIL')
      AND detail ->> 'run_id' = p_run_id::text;
  IF v_existing_event_count > 1 THEN
    RAISE EXCEPTION 'execution run has multiple terminal lifecycle events; manual reconciliation required';
  END IF;
  IF v_existing_event_type IS NOT NULL
     AND v_existing_event_type IS DISTINCT FROM CASE WHEN v_reported_success THEN 'REPORT' ELSE 'FAIL' END THEN
    RAISE EXCEPTION 'terminal lifecycle event conflicts with persisted report';
  END IF;

  IF v_existing_event_type IS NULL THEN
    INSERT INTO public.frelux_archie_agent_events (agent_id, event, detail, actor)
    VALUES (
      p_agent_id,
      CASE WHEN v_reported_success THEN 'REPORT' ELSE 'FAIL' END,
      jsonb_build_object(
        'kind', CASE WHEN v_reported_success THEN 'TASK_EXECUTED' ELSE 'TASK_FAILED' END,
        'report_id', v_report_id,
        'run_id', p_run_id,
        'engine', p_engine
      ),
      p_actor_id
    );
  END IF;

  RETURN v_report_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.archie_persist_agent_report_with_event(uuid, uuid, uuid, text, jsonb, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archie_persist_agent_report_with_event(uuid, uuid, uuid, text, jsonb, jsonb, text, text)
  TO service_role;
