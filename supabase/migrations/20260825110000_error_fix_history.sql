-- =========================================================
-- Error Fix History — tracks AI Studio error analysis workflow
-- =========================================================

CREATE TABLE IF NOT EXISTS error_fix_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the application error
  error_id uuid NOT NULL REFERENCES application_errors(id) ON DELETE CASCADE,

  -- Error snapshot (sanitized — no secrets)
  error_message text NOT NULL,
  error_type text,
  error_severity text,

  -- AI diagnosis
  diagnosis jsonb NOT NULL DEFAULT '{}',
  -- Contains: { what_failed, where_failed, root_cause, affected_file,
  --   affected_component, category, proposed_solution, risk_level,
  --   protected_functionality_affected, recommended_action }

  -- Proposed fix
  proposed_fix jsonb DEFAULT '{}',
  -- Contains: { file, existing_code, proposed_code, explanation, risk_level, expected_effect }

  -- Applied fix
  applied_changes jsonb DEFAULT '{}',
  -- Contains: { files_changed: [{file, diff}], commit_sha }

  -- Workflow tracking
  status text NOT NULL DEFAULT 'analyzing'
    CHECK (status IN (
      'analyzing', 'fix_proposed', 'awaiting_approval',
      'validation_failed', 'approved', 'deployed',
      'verified', 'failed', 'rolled_back'
    )),

  -- Admin approval
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,

  -- Validation
  validation_result jsonb DEFAULT '{}',
  -- Contains: { passed, errors: [], build_output, test_output }

  -- Verification (post-deploy)
  verification_result jsonb DEFAULT '{}',
  -- Contains: { status: 'resolved'|'reduced'|'still_occurring'|'worse',
  --   error_count_before, error_count_after, new_errors }

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  deployed_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_fix_history_error_id ON error_fix_history(error_id);
CREATE INDEX IF NOT EXISTS idx_error_fix_history_status ON error_fix_history(status);
CREATE INDEX IF NOT EXISTS idx_error_fix_history_created_at ON error_fix_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_fix_history_approved_by ON error_fix_history(approved_by);

-- RLS — admin only
ALTER TABLE error_fix_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "efh_admin_all" ON error_fix_history;
DROP POLICY IF EXISTS "efh_admin_select" ON error_fix_history;

-- Admin full access
CREATE POLICY "efh_admin_all" ON error_fix_history
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON error_fix_history TO authenticated;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_error_fix_history_updated_at
  BEFORE UPDATE ON error_fix_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
