-- =========================================================
-- FRELUX F4 RECONCILIATION (audit 2026-09-13, applied 2026-09-13)
-- Capture the 11 tables that were created out-of-band (their
-- migrations were applied to prod but never committed to the
-- repo chain). This makes the migration chain authoritative:
-- a project rebuilt from the chain now recreates these tables.
-- All statements are IF NOT EXISTS — no-op on current prods
-- (Frelukx/Freluxtools already carry these objects).
-- ARCHIE tables captured from Frelukx; user_roles from Freluxtools.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.archie_installation_identity (
  id uuid not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT archie_installation_identity_pkey PRIMARY KEY (id)
);
ALTER TABLE public.archie_installation_identity ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'archie_installation_identity' AND policyname = 'archie_installation_identity_admin_all') THEN
    CREATE POLICY "archie_installation_identity_admin_all" ON public.archie_installation_identity FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'archie_installation_identity' AND policyname = 'archie_installation_identity_service_all') THEN
    CREATE POLICY "archie_installation_identity_service_all" ON public.archie_installation_identity FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT ALL ON public.archie_installation_identity TO service_role;
REVOKE ALL ON public.archie_installation_identity FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.archie_migration_environments (
  id uuid not null,
  identity_id uuid not null,
  kind text not null,
  name text not null,
  notes text,
  state text default 'UNTRUSTED'::text not null,
  authorization_record_id text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT archie_migration_environments_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS archie_migration_environments_state_idx ON public.archie_migration_environments USING btree (state);
ALTER TABLE public.archie_migration_environments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'archie_migration_environments' AND policyname = 'archie_migration_environments_admin_all') THEN
    CREATE POLICY "archie_migration_environments_admin_all" ON public.archie_migration_environments FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'archie_migration_environments' AND policyname = 'archie_migration_environments_service_all') THEN
    CREATE POLICY "archie_migration_environments_service_all" ON public.archie_migration_environments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
GRANT ALL ON public.archie_migration_environments TO service_role;
REVOKE ALL ON public.archie_migration_environments FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_datasets (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text default ''::text not null,
  version integer default 1 not null,
  status text default 'REGISTERED'::text not null,
  size_bytes bigint default 0 not null,
  item_count bigint default 0 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_datasets_name_key UNIQUE (name),
  CONSTRAINT frelux_archie_datasets_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS frelux_archie_datasets_name_key ON public.frelux_archie_datasets USING btree (name);
ALTER TABLE public.frelux_archie_datasets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_datasets' AND policyname = 'admins manage archie datasets') THEN
    CREATE POLICY "admins manage archie datasets" ON public.frelux_archie_datasets FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_datasets TO service_role;
REVOKE ALL ON public.frelux_archie_datasets FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_device_sessions (
  id uuid default gen_random_uuid() not null,
  device_id uuid not null,
  owner_id uuid not null,
  status text default 'ACTIVE'::text not null,
  issued_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '30 days'::interval) not null,
  last_activity_at timestamp with time zone default now() not null,
  user_agent text default ''::text not null,
  CONSTRAINT frelux_archie_device_sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_archie_device_sessions_owner ON public.frelux_archie_device_sessions USING btree (owner_id, status);
ALTER TABLE public.frelux_archie_device_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_device_sessions' AND policyname = 'owner manage own device sessions') THEN
    CREATE POLICY "owner manage own device sessions" ON public.frelux_archie_device_sessions FOR ALL TO authenticated USING (((owner_id = auth.uid()) OR is_admin())) WITH CHECK (((owner_id = auth.uid()) OR is_admin()));
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_device_sessions TO service_role;
REVOKE ALL ON public.frelux_archie_device_sessions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_family_members (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  member_user_id uuid,
  name text not null,
  relation text default 'family'::text not null,
  status text default 'PENDING'::text not null,
  permissions jsonb default '{}'::jsonb not null,
  expires_at timestamp with time zone,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_family_members_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_archie_family_members_owner ON public.frelux_archie_family_members USING btree (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_archie_family_members_member ON public.frelux_archie_family_members USING btree (member_user_id, status);
ALTER TABLE public.frelux_archie_family_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_family_members' AND policyname = 'admins manage family members') THEN
    CREATE POLICY "admins manage family members" ON public.frelux_archie_family_members FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_family_members' AND policyname = 'members read own family membership') THEN
    CREATE POLICY "members read own family membership" ON public.frelux_archie_family_members FOR SELECT TO authenticated USING ((member_user_id = auth.uid()));
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_family_members TO service_role;
REVOKE ALL ON public.frelux_archie_family_members FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_memory (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  key text not null,
  value text not null,
  scope text default 'PRIVATE'::text not null,
  scope_key text,
  source text default 'chat'::text not null,
  confidence numeric,
  status text default 'ACTIVE'::text not null,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_memory_owner_id_key_key UNIQUE (owner_id, key),
  CONSTRAINT frelux_archie_memory_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS frelux_archie_memory_owner_id_key_key ON public.frelux_archie_memory USING btree (owner_id, key);
CREATE INDEX IF NOT EXISTS idx_archie_memory_owner ON public.frelux_archie_memory USING btree (owner_id, status);
ALTER TABLE public.frelux_archie_memory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_memory' AND policyname = 'users manage own archie memory') THEN
    CREATE POLICY "users manage own archie memory" ON public.frelux_archie_memory FOR ALL TO authenticated USING (((owner_id = auth.uid()) OR is_admin())) WITH CHECK (((owner_id = auth.uid()) OR is_admin()));
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_memory TO service_role;
REVOKE ALL ON public.frelux_archie_memory FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_model_experiments (
  id uuid default gen_random_uuid() not null,
  name text not null,
  kind text not null,
  status text default 'PLANNED'::text not null,
  model_id uuid,
  results jsonb default '{}'::jsonb not null,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_model_experiments_pkey PRIMARY KEY (id)
);
ALTER TABLE public.frelux_archie_model_experiments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_model_experiments' AND policyname = 'admins manage archie model experiments') THEN
    CREATE POLICY "admins manage archie model experiments" ON public.frelux_archie_model_experiments FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_model_experiments TO service_role;
REVOKE ALL ON public.frelux_archie_model_experiments FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_model_invocations (
  id uuid default gen_random_uuid() not null,
  runtime_name text not null,
  purpose text not null,
  ok boolean default true not null,
  latency_ms integer,
  error text,
  created_by uuid,
  created_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_model_invocations_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_archie_model_invocations_date ON public.frelux_archie_model_invocations USING btree (created_date DESC);
ALTER TABLE public.frelux_archie_model_invocations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_model_invocations' AND policyname = 'admins read model invocations') THEN
    CREATE POLICY "admins read model invocations" ON public.frelux_archie_model_invocations FOR SELECT TO authenticated USING (is_admin());
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_model_invocations TO service_role;
REVOKE ALL ON public.frelux_archie_model_invocations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_model_registry (
  id uuid default gen_random_uuid() not null,
  name text not null,
  version text default '0.0.0'::text not null,
  status text default 'REGISTERED'::text not null,
  task text default ''::text not null,
  dataset_id uuid,
  metrics jsonb default '{}'::jsonb not null,
  notes text default ''::text not null,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_model_registry_name_key UNIQUE (name),
  CONSTRAINT frelux_archie_model_registry_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS frelux_archie_model_registry_name_key ON public.frelux_archie_model_registry USING btree (name);
ALTER TABLE public.frelux_archie_model_registry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_model_registry' AND policyname = 'admins manage archie model registry') THEN
    CREATE POLICY "admins manage archie model registry" ON public.frelux_archie_model_registry FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_model_registry TO service_role;
REVOKE ALL ON public.frelux_archie_model_registry FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.frelux_archie_model_runtimes (
  id uuid default gen_random_uuid() not null,
  name text not null,
  kind text not null,
  provider text default ''::text not null,
  model_id text default ''::text not null,
  status text default 'DISABLED'::text not null,
  priority integer default 100 not null,
  config jsonb default '{}'::jsonb not null,
  notes text default ''::text not null,
  created_date timestamp with time zone default now() not null,
  updated_date timestamp with time zone default now() not null,
  CONSTRAINT frelux_archie_model_runtimes_name_key UNIQUE (name),
  CONSTRAINT frelux_archie_model_runtimes_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS frelux_archie_model_runtimes_name_key ON public.frelux_archie_model_runtimes USING btree (name);
ALTER TABLE public.frelux_archie_model_runtimes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_model_runtimes' AND policyname = 'admins manage model runtimes') THEN
    CREATE POLICY "admins manage model runtimes" ON public.frelux_archie_model_runtimes FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'frelux_archie_model_runtimes' AND policyname = 'authenticated read model runtimes') THEN
    CREATE POLICY "authenticated read model runtimes" ON public.frelux_archie_model_runtimes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
GRANT ALL ON public.frelux_archie_model_runtimes TO service_role;
REVOKE ALL ON public.frelux_archie_model_runtimes FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid not null,
  role text default 'user'::text not null,
  created_at timestamp with time zone default now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_roles_role_check CHECK (role = ANY (ARRAY['user'::text, 'admin'::text])),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_roles TO service_role;
REVOKE ALL ON public.user_roles FROM anon, authenticated;
