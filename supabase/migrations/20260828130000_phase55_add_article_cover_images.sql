-- Phase 55: Add cover images to all learn articles
--
-- Previously only 11 painting articles had cover images.
-- Added cover images to the remaining 55 articles across:
-- - Screeding Guides (11 articles) - screeding/plastering themed images
-- - POP Ceiling Guides (11 articles) - gypsum ceiling themed images
-- - Tile Guides (11 articles) - tile installation themed images
-- - Finishing Guides (11 articles) - wall finishing themed images
-- - Construction Guides (11 articles) - construction site themed images
--
-- Images are a mix of:
-- - Openverse CC-licensed stock photos (25 articles, first batch)
-- - AI-generated images via Base44 generate_image tool (30 articles)
--
-- This migration documents the update. The actual cover_image_url values
-- were set via the Supabase REST API and are external CDN URLs.

SELECT 1; -- Placeholder: actual updates were applied via REST API
