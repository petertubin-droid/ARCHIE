-- =========================================================
-- ENSURE frelux_operation_class ENUM VALUES (replay-safe shim)
--
-- Some long-lived branch databases carry
-- public.frelux_operation_class from an older manual
-- application whose value list is a SUBSET of the canonical
-- five. The guarded CREATE TYPE in phase8p5 cannot repair that
-- (duplicate_object -> skip), and ALTER TYPE ... ADD VALUE
-- inside phase8p5 itself is unusable in-transaction (55P04
-- "unsafe use of new value" — values added by ADD VALUE may
-- not be used until their transaction commits).
--
-- This file runs in its OWN transaction immediately before
-- phase8p5, so any values it adds are committed before
-- phase8p5's ADD COLUMN ... DEFAULT 'API_CUSTOMER_OPERATION'
-- needs them. On a fresh database the type does not exist yet
-- and the guard skips (phase8p5's CREATE TYPE handles it).
-- =========================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'frelux_operation_class'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.frelux_operation_class ADD VALUE IF NOT EXISTS 'INTERNAL_ARCHIE_OPERATION';
    ALTER TYPE public.frelux_operation_class ADD VALUE IF NOT EXISTS 'OWNER_OPERATION';
    ALTER TYPE public.frelux_operation_class ADD VALUE IF NOT EXISTS 'SUBSCRIBER_OPERATION';
    ALTER TYPE public.frelux_operation_class ADD VALUE IF NOT EXISTS 'PUBLIC_USER_OPERATION';
    ALTER TYPE public.frelux_operation_class ADD VALUE IF NOT EXISTS 'API_CUSTOMER_OPERATION';
  END IF;
END $$;
