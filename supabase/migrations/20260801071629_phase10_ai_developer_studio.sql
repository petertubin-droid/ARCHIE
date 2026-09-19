/*
# AI Developer Studio — Database Foundation

## Purpose
Creates the complete data layer for the AI Developer Studio, a modular AI-assisted
development environment within the FRELUX admin panel. This migration creates 10 new
tables that store AI sessions, generated artifacts, version history, prompt library
entries, plugin registry, integration configs, feature flags, system metrics,
role/permission definitions, and chat conversations.

## New Tables

1. **ai_studio_sessions** — Each AI Studio interaction (chat message, code generation
   request, etc.) belongs to a session. Sessions group related interactions together.

2. **ai_studio_artifacts** — Stores all generated outputs (pages, components, APIs,
   schemas, tests, docs, workflows). Each artifact has a type, title, content, status,
   and metadata. Supports versioning via the version_number field.

3. **ai_studio_versions** — Snapshots of artifact content over time. Every save creates
   a version, enabling rollback and diff viewing.

4. **ai_studio_prompts** — Reusable prompt templates in the Prompt Library. Each has a
   category, system prompt, user prompt template, and optional example.

5. **ai_studio_plugins** — Registry of installed plugins/modules. Each plugin has a slug,
   name, description, version, status (installed/enabled/disabled), and config.

6. **ai_studio_integrations** — Configuration for external service integrations
   (databases, APIs, CI/CD, monitoring). Stores connection type, config JSON, and status.

7. **ai_studio_features** — Feature flags managed by the Feature Management tool.
   Each feature has a key, label, description, enabled state, rollout percentage,
   and targeting rules.

8. **ai_studio_metrics** — System monitoring metrics. Stores metric name, value, unit,
   category, and timestamp. Used for the System Monitoring dashboard.

9. **ai_studio_roles** — Role and permission definitions. Each role has a name,
   description, and permissions array (JSON list of permission strings).

10. **ai_studio_chat** — Chat messages for the AI Chat Assistant. Stores the session ID,
    role (user/assistant/system), content, and metadata.

## Security
- All tables have RLS enabled.
- All tables are admin-only (TO authenticated with role = 'admin' check via profiles).
- Admin users can perform full CRUD on all tables.
- Non-admin users get no access.

## Important Notes
1. Admin access is enforced via a check against the profiles table where role = 'admin'.
2. All timestamps default to now().
3. UUIDs are used for all primary keys.
4. JSONB columns are used for flexible metadata/config storage.
*/

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- =========================================================
-- 1. ai_studio_sessions
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tool_type text NOT NULL,
  title text NOT NULL DEFAULT 'Untitled Session',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_sessions" ON ai_studio_sessions;
CREATE POLICY "admin_select_studio_sessions" ON ai_studio_sessions FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_sessions" ON ai_studio_sessions;
CREATE POLICY "admin_insert_studio_sessions" ON ai_studio_sessions FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_sessions" ON ai_studio_sessions;
CREATE POLICY "admin_update_studio_sessions" ON ai_studio_sessions FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_sessions" ON ai_studio_sessions;
CREATE POLICY "admin_delete_studio_sessions" ON ai_studio_sessions FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_sessions_user ON ai_studio_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_tool ON ai_studio_sessions(tool_type);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_updated ON ai_studio_sessions(updated_at DESC);

-- =========================================================
-- 2. ai_studio_artifacts
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES ai_studio_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  artifact_type text NOT NULL,
  title text NOT NULL,
  description text,
  content text NOT NULL DEFAULT '',
  language text DEFAULT 'typescript',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'deployed', 'rejected')),
  version_number integer NOT NULL DEFAULT 1,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_artifacts" ON ai_studio_artifacts;
CREATE POLICY "admin_select_studio_artifacts" ON ai_studio_artifacts FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_artifacts" ON ai_studio_artifacts;
CREATE POLICY "admin_insert_studio_artifacts" ON ai_studio_artifacts FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_artifacts" ON ai_studio_artifacts;
CREATE POLICY "admin_update_studio_artifacts" ON ai_studio_artifacts FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_artifacts" ON ai_studio_artifacts;
CREATE POLICY "admin_delete_studio_artifacts" ON ai_studio_artifacts FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_artifacts_session ON ai_studio_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_artifacts_type ON ai_studio_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_studio_artifacts_status ON ai_studio_artifacts(status);
CREATE INDEX IF NOT EXISTS idx_studio_artifacts_updated ON ai_studio_artifacts(updated_at DESC);

-- =========================================================
-- 3. ai_studio_versions
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES ai_studio_artifacts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  change_summary text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_versions" ON ai_studio_versions;
CREATE POLICY "admin_select_studio_versions" ON ai_studio_versions FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_versions" ON ai_studio_versions;
CREATE POLICY "admin_insert_studio_versions" ON ai_studio_versions FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_versions" ON ai_studio_versions;
CREATE POLICY "admin_delete_studio_versions" ON ai_studio_versions FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_versions_artifact ON ai_studio_versions(artifact_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_number ON ai_studio_versions(version_number DESC);

-- =========================================================
-- 4. ai_studio_prompts
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  user_prompt_template text NOT NULL,
  example_output text,
  tool_type text,
  is_builtin boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_prompts" ON ai_studio_prompts;
CREATE POLICY "admin_select_studio_prompts" ON ai_studio_prompts FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_prompts" ON ai_studio_prompts;
CREATE POLICY "admin_insert_studio_prompts" ON ai_studio_prompts FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_prompts" ON ai_studio_prompts;
CREATE POLICY "admin_update_studio_prompts" ON ai_studio_prompts FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_prompts" ON ai_studio_prompts;
CREATE POLICY "admin_delete_studio_prompts" ON ai_studio_prompts FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_prompts_category ON ai_studio_prompts(category);
CREATE INDEX IF NOT EXISTS idx_studio_prompts_tool ON ai_studio_prompts(tool_type);

-- =========================================================
-- 5. ai_studio_plugins
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  author text,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'installed', 'enabled', 'disabled', 'error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependencies text[] NOT NULL DEFAULT '{}',
  is_official boolean NOT NULL DEFAULT false,
  installed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_plugins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_plugins" ON ai_studio_plugins;
CREATE POLICY "admin_select_studio_plugins" ON ai_studio_plugins FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_plugins" ON ai_studio_plugins;
CREATE POLICY "admin_insert_studio_plugins" ON ai_studio_plugins FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_plugins" ON ai_studio_plugins;
CREATE POLICY "admin_update_studio_plugins" ON ai_studio_plugins FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_plugins" ON ai_studio_plugins;
CREATE POLICY "admin_delete_studio_plugins" ON ai_studio_plugins FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 6. ai_studio_integrations
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service_type text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_status text DEFAULT 'unknown',
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_integrations" ON ai_studio_integrations;
CREATE POLICY "admin_select_studio_integrations" ON ai_studio_integrations FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_integrations" ON ai_studio_integrations;
CREATE POLICY "admin_insert_studio_integrations" ON ai_studio_integrations FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_integrations" ON ai_studio_integrations;
CREATE POLICY "admin_update_studio_integrations" ON ai_studio_integrations FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_integrations" ON ai_studio_integrations;
CREATE POLICY "admin_delete_studio_integrations" ON ai_studio_integrations FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 7. ai_studio_features
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage integer NOT NULL DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  targeting_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_features" ON ai_studio_features;
CREATE POLICY "admin_select_studio_features" ON ai_studio_features FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_features" ON ai_studio_features;
CREATE POLICY "admin_insert_studio_features" ON ai_studio_features FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_features" ON ai_studio_features;
CREATE POLICY "admin_update_studio_features" ON ai_studio_features FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_features" ON ai_studio_features;
CREATE POLICY "admin_delete_studio_features" ON ai_studio_features FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 8. ai_studio_metrics
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  unit text,
  category text NOT NULL DEFAULT 'system',
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_metrics" ON ai_studio_metrics;
CREATE POLICY "admin_select_studio_metrics" ON ai_studio_metrics FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_metrics" ON ai_studio_metrics;
CREATE POLICY "admin_insert_studio_metrics" ON ai_studio_metrics FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_metrics" ON ai_studio_metrics;
CREATE POLICY "admin_delete_studio_metrics" ON ai_studio_metrics FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_metrics_name ON ai_studio_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_studio_metrics_category ON ai_studio_metrics(category);
CREATE INDEX IF NOT EXISTS idx_studio_metrics_recorded ON ai_studio_metrics(recorded_at DESC);

-- =========================================================
-- 9. ai_studio_roles
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text UNIQUE NOT NULL,
  description text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_roles" ON ai_studio_roles;
CREATE POLICY "admin_select_studio_roles" ON ai_studio_roles FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_roles" ON ai_studio_roles;
CREATE POLICY "admin_insert_studio_roles" ON ai_studio_roles FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_studio_roles" ON ai_studio_roles;
CREATE POLICY "admin_update_studio_roles" ON ai_studio_roles FOR UPDATE
  TO authenticated USING (is_current_user_admin()) WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_roles" ON ai_studio_roles;
CREATE POLICY "admin_delete_studio_roles" ON ai_studio_roles FOR DELETE
  TO authenticated USING (is_current_user_admin());

-- =========================================================
-- 10. ai_studio_chat
-- =========================================================
CREATE TABLE IF NOT EXISTS ai_studio_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ai_studio_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_studio_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_studio_chat" ON ai_studio_chat;
CREATE POLICY "admin_select_studio_chat" ON ai_studio_chat FOR SELECT
  TO authenticated USING (is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_studio_chat" ON ai_studio_chat;
CREATE POLICY "admin_insert_studio_chat" ON ai_studio_chat FOR INSERT
  TO authenticated WITH CHECK (is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_studio_chat" ON ai_studio_chat;
CREATE POLICY "admin_delete_studio_chat" ON ai_studio_chat FOR DELETE
  TO authenticated USING (is_current_user_admin());

CREATE INDEX IF NOT EXISTS idx_studio_chat_session ON ai_studio_chat(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_chat_created ON ai_studio_chat(created_at ASC);

-- =========================================================
-- Seed: Built-in prompt templates
-- =========================================================
INSERT INTO ai_studio_prompts (title, category, description, system_prompt, user_prompt_template, tool_type, is_builtin, sort_order)
VALUES
  ('Generate React Page', 'page_builder', 'Create a full React page component with Tailwind styling', 'You are an expert React developer. Generate clean, production-ready React components using TypeScript and Tailwind CSS. Always include proper types, error states, loading states, and responsive design.', 'Create a page called "{pageName}" with the following requirements:\n{requirements}\n\nInclude: routing, SEO meta tags, responsive layout, loading and error states.', 'page_builder', true, 1),
  ('Generate CRUD Module', 'crud_generator', 'Create a complete CRUD module with list, create, edit, delete', 'You are an expert full-stack developer. Generate complete CRUD modules with Supabase integration, TypeScript types, and React UI components.', 'Create a CRUD module for "{entityName}" with fields: {fields}\n\nInclude: list view, create form, edit form, delete confirmation, search, pagination, and Supabase queries.', 'crud_generator', true, 1),
  ('Design Database Schema', 'db_designer', 'Generate SQL migration for new tables', 'You are a PostgreSQL database architect. Generate clean, idempotent SQL migrations with proper indexes, constraints, and RLS policies.', 'Design a database schema for: {description}\n\nInclude: tables, columns with types, primary/foreign keys, indexes, and RLS policies.', 'db_designer', true, 1),
  ('Generate API Endpoint', 'api_builder', 'Create a Supabase Edge Function', 'You are an expert Deno developer. Generate Supabase Edge Functions with proper CORS, error handling, and type safety.', 'Create an API endpoint for: {description}\n\nInclude: CORS headers, input validation, error handling, and response types.', 'api_builder', true, 1),
  ('Generate Test Suite', 'test_generator', 'Create comprehensive test files', 'You are a QA engineer. Generate comprehensive test suites covering happy paths, edge cases, and error scenarios.', 'Generate tests for: {target}\n\nCover: unit tests, integration tests, edge cases, error scenarios.', 'test_generator', true, 1),
  ('Generate Documentation', 'docs_generator', 'Create API and component documentation', 'You are a technical writer. Generate clear, comprehensive documentation with examples.', 'Generate documentation for: {target}\n\nInclude: overview, API reference, usage examples, and integration guides.', 'docs_generator', true, 1),
  ('Detect Bugs', 'bug_detection', 'Analyze code for potential bugs', 'You are a senior code reviewer. Identify bugs, security issues, and potential problems in code.', 'Analyze this code for bugs, security issues, and improvements:\n{code}\n\nProvide: list of issues with severity, description, and suggested fixes.', 'bug_detection', true, 1),
  ('Refactor Code', 'refactoring', 'Improve code quality', 'You are a refactoring expert. Improve code readability, performance, and maintainability while preserving behavior.', 'Refactor this code for better readability and maintainability:\n{code}\n\nPreserve all existing functionality.', 'refactoring', true, 1)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: System roles
-- =========================================================
INSERT INTO ai_studio_roles (role_name, description, permissions, is_system)
VALUES
  ('admin', 'Full system access', '["*"]'::jsonb, true),
  ('developer', 'Development tools access', '["studio:*","artifacts:*","prompts:read","features:*"]'::jsonb, true),
  ('viewer', 'Read-only access', '["studio:read","artifacts:read","prompts:read","metrics:read"]'::jsonb, true)
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: Default feature flags
-- =========================================================
INSERT INTO ai_studio_features (feature_key, label, description, is_enabled, category)
VALUES
  ('ai_studio', 'AI Developer Studio', 'Master switch for the AI Developer Studio', true, 'core'),
  ('ai_chat', 'AI Chat Assistant', 'Natural language chat with AI', true, 'tools'),
  ('page_builder', 'AI Page Builder', 'Generate pages from natural language', true, 'tools'),
  ('crud_generator', 'AI CRUD Generator', 'Generate CRUD modules', true, 'tools'),
  ('db_designer', 'AI Database Designer', 'Design database schemas', true, 'tools'),
  ('api_builder', 'AI API Builder', 'Generate API endpoints', true, 'tools'),
  ('code_generator', 'AI Code Generator', 'Generate code snippets', true, 'tools'),
  ('bug_detection', 'AI Bug Detection', 'Detect and fix bugs', true, 'tools')
ON CONFLICT DO NOTHING;

-- =========================================================
-- Seed: Default plugins (registry entries, not installed)
-- =========================================================
INSERT INTO ai_studio_plugins (slug, name, description, version, author, status, is_official)
VALUES
  ('stripe-payments', 'Stripe Payments', 'Accept payments via Stripe integration', '1.2.0', 'FRELUX', 'available', true),
  ('sendgrid-email', 'SendGrid Email', 'Transactional email via SendGrid', '1.0.0', 'FRELUX', 'available', true),
  ('twilio-sms', 'Twilio SMS', 'SMS notifications via Twilio', '1.0.0', 'FRELUX', 'available', true),
  ('analytics-pro', 'Analytics Pro', 'Advanced analytics and reporting', '2.1.0', 'FRELUX', 'available', true),
  ('ai-content-writer', 'AI Content Writer', 'Generate blog and marketing content', '1.0.0', 'FRELUX', 'available', true),
  ('image-optimizer', 'Image Optimizer', 'Automatic image compression and CDN', '1.0.0', 'FRELUX', 'available', true),
  ('search-engine', 'Full-Text Search', 'Advanced search with Elasticsearch', '1.0.0', 'FRELUX', 'available', true),
  ('auth-pro', 'Auth Pro', 'Advanced auth with OAuth and MFA', '1.0.0', 'FRELUX', 'available', true)
ON CONFLICT (slug) DO NOTHING;
