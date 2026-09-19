-- Client onboarding: add onboarding fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_state text;

COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Whether the client has completed the onboarding flow';
COMMENT ON COLUMN public.profiles.onboarding_goals IS 'Project goals selected during onboarding (painting, building, estimating, hiring)';
COMMENT ON COLUMN public.profiles.onboarding_state IS 'State selected during onboarding';
