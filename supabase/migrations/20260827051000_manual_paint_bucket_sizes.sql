-- =========================================================
-- FRELUX Manual Paint Bucket Sizes (Cost Estimator)
--
-- Adds an admin-configurable list of bucket/container sizes
-- (in liters) offered in the Cost Estimator's manual paint
-- price entry section. Instead of entering a price per liter,
-- users pick a bucket size (e.g. 20L, 4L) and enter the price
-- for that bucket — matching how paint is actually sold.
-- =========================================================

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS manual_paint_bucket_sizes jsonb NOT NULL DEFAULT '[20, 4]'::jsonb;

COMMENT ON COLUMN site_settings.manual_paint_bucket_sizes IS
  'Admin-configurable bucket sizes (liters) offered for manual paint price entry in the Cost Estimator, e.g. [20, 4, 1].';
