-- =========================================================
-- ARCHIE SPEAKER PROFILE — WITHIN-SPEAKER SPREADS
-- 20260919090000_archie_speaker_profile_spreads.sql
--
-- Sensory periphery (audit re-assessment 2026-09-19):
-- enrollment now measures the owner's PER-DIMENSION
-- within-speaker variability (median absolute deviation in
-- normalized feature space) alongside the median template.
-- Verification scores each dimension against the owner's
-- own measured spread — stable dimensions discriminate,
-- content-dependent ones are forgiven within real bounds.
--
-- Additive only: nullable jsonb; legacy single-sample
-- profiles simply have no spreads (classic metric applies).
-- RLS: table is already owner-locked (20260918130000).
-- =========================================================

alter table frelux_archie_speaker_profile
  add column if not exists feature_spreads jsonb;
