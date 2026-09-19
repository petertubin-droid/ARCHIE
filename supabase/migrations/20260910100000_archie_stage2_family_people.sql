-- =========================================================
-- FRELUX ARCHIE STAGE 2 — FAMILY / TRUSTED PEOPLE NETWORK
--
-- Owner invites family + trusted professionals into ARCHIE:
--   * invitation codes: crypto-random, hashed at rest,
--     single-use, short-lived, server-validated
--   * the code ALONE grants nothing: redemption creates a
--     PENDING_REQUEST the Owner must review and approve
--   * permissions are configured by the Owner BEFORE
--     activation; nothing is auto-granted (spec §§25-28)
--   * strict multi-person data isolation: family members see
--     ONLY resources the Owner explicitly shared, enforced by
--     RLS + SECURITY DEFINER RPCs — never the Owner's private
--     conversations, knowledge, files or settings
-- =========================================================

-- ---------------------------------------------------------
-- People: one row per trusted person in the Owner's network
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  relation text NOT NULL
    CHECK (relation IN (
      'FAMILY','PARTNER','SIBLING','ARCHITECT','ENGINEER',
      'QUANTITY_SURVEYOR','CONTRACTOR','CONSULTANT','OTHER'
    )),
  status text NOT NULL DEFAULT 'PENDING_INVITE'
    CHECK (status IN (
      'PENDING_INVITE','PENDING_REQUEST','ACTIVE',
      'SUSPENDED','REVOKED'
    )),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  access_expires_at timestamptz,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  revoked_at timestamptz,
  created_date timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.frelux_archie_people IS
  'ARCHIE trusted people network — Owner-controlled family/professional access with explicit permissions.';

ALTER TABLE public.frelux_archie_people ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages own people" ON public.frelux_archie_people;
CREATE POLICY "owner manages own people" ON public.frelux_archie_people
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- The invited person may see ONLY their own person record
-- (name, relation, status, their granted permissions) — nothing else.
DROP POLICY IF EXISTS "person sees own record" ON public.frelux_archie_people;
CREATE POLICY "person sees own record" ON public.frelux_archie_people
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------
-- Invitations: only the SHA-256 hash of the code is stored.
-- Codes are single-use and expire (server-side enforced).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  people_id uuid NOT NULL REFERENCES public.frelux_archie_people(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_date timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.frelux_archie_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages own invitations" ON public.frelux_archie_invitations;
CREATE POLICY "owner manages own invitations" ON public.frelux_archie_invitations
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------
-- Shares: explicit Owner grants of individual resources to a
-- person. No share row = no access. Ever.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frelux_archie_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.frelux_archie_people(id) ON DELETE CASCADE,
  resource_type text NOT NULL
    CHECK (resource_type IN ('conversation','knowledge_item','project','property')),
  resource_id uuid NOT NULL,
  created_date timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, resource_type, resource_id)
);

ALTER TABLE public.frelux_archie_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages own shares" ON public.frelux_archie_shares;
CREATE POLICY "owner manages own shares" ON public.frelux_archie_shares
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- The shared person may read only rows shared with THEM, while
-- their person record is ACTIVE and not expired.
DROP POLICY IF EXISTS "person reads own shares" ON public.frelux_archie_shares;
CREATE POLICY "person reads own shares" ON public.frelux_archie_shares
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.frelux_archie_people p
      WHERE p.id = frelux_archie_shares.person_id
        AND p.user_id = auth.uid()
        AND p.status = 'ACTIVE'
        AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
    )
  );

-- ---------------------------------------------------------
-- Data isolation RPCs (SECURITY DEFINER): shared resources
-- are served ONLY through these gates, which check the
-- person's permissions, status and expiry every call.
-- ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.frelux_archie_shared_conversations()
RETURNS TABLE (id uuid, title text, created_date timestamptz)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.title, c.created_date
  FROM public.frelux_archie_conversations c
  WHERE EXISTS (
    SELECT 1
    FROM public.frelux_archie_shares s
    JOIN public.frelux_archie_people p ON p.id = s.person_id
    WHERE s.resource_type = 'conversation'
      AND s.resource_id = c.id
      AND p.user_id = auth.uid()
      AND p.status = 'ACTIVE'
      AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
      AND p.permissions ? 'ARCHIE_CHAT'
  );
$$;

CREATE OR REPLACE FUNCTION public.frelux_archie_shared_knowledge()
RETURNS TABLE (id uuid, topic text, capability text, version int)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id, k.topic, k.capability, k.version
  FROM public.frelux_knowledge_items k
  WHERE EXISTS (
    SELECT 1
    FROM public.frelux_archie_shares s
    JOIN public.frelux_archie_people p ON p.id = s.person_id
    WHERE s.resource_type = 'knowledge_item'
      AND s.resource_id = k.id
      AND p.user_id = auth.uid()
      AND p.status = 'ACTIVE'
      AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
      AND p.permissions ? 'SHARED_KNOWLEDGE'
  );
$$;

REVOKE ALL ON FUNCTION public.frelux_archie_shared_conversations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.frelux_archie_shared_knowledge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.frelux_archie_shared_conversations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.frelux_archie_shared_knowledge() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_people TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frelux_archie_shares TO authenticated;
