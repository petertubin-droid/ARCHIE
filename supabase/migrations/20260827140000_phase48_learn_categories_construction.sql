-- Phase 48: Add learn categories for non-painting tools
-- Screeding, POP Ceiling, Tile, Finishing, Construction

INSERT INTO learn_categories (slug, name, description, icon, sort_order) VALUES
  ('screeding-guides', 'Screeding Guides', 'Complete guides on wall screeding techniques, material calculation, and best practices', 'Trowel', 12),
  ('pop-ceiling-guides', 'POP Ceiling Guides', 'Everything about POP ceiling installation, design, repair, and cost estimation', 'PanelsTopLeft', 13),
  ('tile-guides', 'Tile Guides', 'Comprehensive tile installation guides covering floor tiles, wall tiles, patterns, and cost calculation', 'Grid3x3', 14),
  ('finishing-guides', 'Finishing Guides', 'Interior and exterior finishing techniques, material selection, and surface treatment guides', 'Sparkles', 15),
  ('construction-guides', 'Construction Guides', 'Foundation to roof construction guides, structural calculations, and building cost estimation', 'Building2', 16)
ON CONFLICT (slug) DO NOTHING;
