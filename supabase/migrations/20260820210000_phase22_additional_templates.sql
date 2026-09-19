/*
# Additional Calculator Templates (Phase 2c)

Adds 24 more curated public templates (total 40+) covering real-world
Nigerian construction scenarios across paint, tile, screeding, and POP ceiling.

Templates store INPUT DATA only — the calculator engine always recalculates
using current rules and prices.

All templates use display_order starting at 101 to avoid collisions
with the 16 existing templates (orders 1–16).
*/

-- =========================================================
-- Painting templates (8 new)
-- =========================================================
INSERT INTO calculator_templates
  (user_id, calculator_type, name, description, input_data, visibility, is_published, is_featured, display_order, slug, seo_title, seo_description)
VALUES
  (NULL, 'paint', 'Dining Room',
   'Dining room: 3.5m x 4.5m, 2.8m ceiling, 2 coats, 1 door, 2 windows.',
   '{"length":3.5,"width":4.5,"wallHeight":2.8,"coats":2,"doors":1,"windows":2,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 101, 'dining-room-painting',
   'Paint Calculator Template: Dining Room | FRELUX',
   'Calculate paint needed for a dining room with this FRELUX template. Pre-configured for 3.5m x 4.5m rooms.'),

  (NULL, 'paint', 'Children''s Room',
   'Children''s room: 3m x 3m, 2.7m ceiling, 2 coats, 1 door, 1 window.',
   '{"length":3,"width":3,"wallHeight":2.7,"coats":2,"doors":1,"windows":1,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 102, 'childrens-room-painting',
   'Paint Calculator Template: Children''s Room | FRELUX',
   'Calculate paint needed for a children''s room with this FRELUX template.'),

  (NULL, 'paint', 'Kitchen Walls',
   'Kitchen walls: 3m x 4m, 2.7m ceiling, 2 coats, 1 door, 1 window, ceiling excluded.',
   '{"length":3,"width":4,"wallHeight":2.7,"coats":2,"doors":1,"windows":1,"projectType":"interior","includeCeiling":false,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 103, 'kitchen-walls-painting',
   'Paint Calculator Template: Kitchen Walls | FRELUX',
   'Calculate paint needed for kitchen walls with this FRELUX template.'),

  (NULL, 'paint', 'Corridor & Stairwell',
   'Corridor and stairwell: 8m long, 1.5m wide, 3.5m height, 2 coats, 3 doors.',
   '{"length":8,"width":1.5,"wallHeight":3.5,"coats":2,"doors":3,"windows":0,"projectType":"interior","includeCeiling":false,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 104, 'corridor-stairwell-painting',
   'Paint Calculator Template: Corridor & Stairwell | FRELUX',
   'Calculate paint for corridors and stairwells with this FRELUX template.'),

  (NULL, 'paint', '2-Bedroom Flat (Full)',
   'Full 2-bedroom flat: 10m x 8m total, 2.8m ceiling, 2 coats, 6 doors, 8 windows.',
   '{"length":10,"width":8,"wallHeight":2.8,"coats":2,"doors":6,"windows":8,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 105, '2-bedroom-flat-full-painting',
   'Paint Calculator Template: 2-Bedroom Flat | FRELUX',
   'Calculate paint for a complete 2-bedroom flat with this FRELUX template.'),

  (NULL, 'paint', 'Office Space',
   'Office space: 6m x 8m, 3m ceiling, 2 coats, 2 doors, 4 windows.',
   '{"length":6,"width":8,"wallHeight":3,"coats":2,"doors":2,"windows":4,"projectType":"interior","includeCeiling":true,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 106, 'office-space-painting',
   'Paint Calculator Template: Office Space | FRELUX',
   'Calculate paint needed for office space with this FRELUX template.'),

  (NULL, 'paint', 'Exterior Duplex',
   'Exterior duplex: 20m perimeter, 6m height (2 floors), 2 coats.',
   '{"length":20,"width":0,"wallHeight":6,"coats":2,"projectType":"exterior","includeCeiling":false,"wasteMargin":15,"unit":"meters"}'::jsonb,
   'public', true, true, 107, 'exterior-duplex-painting',
   'Paint Calculator Template: Exterior Duplex | FRELUX',
   'Calculate paint for exterior duplex walls with this FRELUX template.'),

  (NULL, 'paint', 'Shop / Retail Front',
   'Shop front: 5m wide, 4m high, 2 coats, 1 large entrance.',
   '{"length":5,"width":0,"wallHeight":4,"coats":2,"doors":1,"windows":0,"projectType":"exterior","includeCeiling":false,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 108, 'shop-retail-front-painting',
   'Paint Calculator Template: Shop / Retail Front | FRELUX',
   'Calculate paint for shop and retail fronts with this FRELUX template.'),

-- =========================================================
-- Tiling templates (6 new)
-- =========================================================
  (NULL, 'tile', 'Balcony Floor Tiling',
   'Balcony floor: 2m x 4m, 300x300mm tiles, cement method.',
   '{"surfaceType":"floor","method":"traditional","length":2,"width":4,"tileWidthMm":300,"tileHeightMm":300,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 109, 'balcony-floor-tiling',
   'Tile Calculator Template: Balcony Floor Tiling | FRELUX',
   'Calculate tiles for balcony floors with this FRELUX template.'),

  (NULL, 'tile', 'Kitchen Floor Tiles',
   'Kitchen floor: 3m x 4m, 600x600mm tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":3,"width":4,"tileWidthMm":600,"tileHeightMm":600,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 110, 'kitchen-floor-tiling',
   'Tile Calculator Template: Kitchen Floor Tiles | FRELUX',
   'Calculate tiles for kitchen floors with this FRELUX template.'),

  (NULL, 'tile', 'Guest Toilet Wall Tiles',
   'Guest toilet walls: 1.5m x 1m, 200x400mm tiles, adhesive method.',
   '{"surfaceType":"wall","method":"adhesive","length":1.5,"width":1,"tileWidthMm":200,"tileHeightMm":400,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, false, 111, 'guest-toilet-wall-tiling',
   'Tile Calculator Template: Guest Toilet Wall Tiles | FRELUX',
   'Calculate tiles for guest toilet walls with this FRELUX template.'),

  (NULL, 'tile', 'Staircase Tiling',
   'Staircase: 1m wide x 3m run, 300x300mm tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":1,"width":3,"tileWidthMm":300,"tileHeightMm":300,"wasteMargin":15,"unit":"meters"}'::jsonb,
   'public', true, false, 112, 'staircase-tiling',
   'Tile Calculator Template: Staircase Tiling | FRELUX',
   'Calculate tiles for staircases with this FRELUX template.'),

  (NULL, 'tile', 'Terrazzo-Style Porcelain Floor',
   'Large hall: 12m x 8m, 800x800mm porcelain tiles, adhesive method.',
   '{"surfaceType":"floor","method":"adhesive","length":12,"width":8,"tileWidthMm":800,"tileHeightMm":800,"wasteMargin":10,"unit":"meters"}'::jsonb,
   'public', true, true, 113, 'terrazzo-porcelain-floor-tiling',
   'Tile Calculator Template: Large Format Porcelain Floor | FRELUX',
   'Calculate tiles for large format porcelain floors with this FRELUX template.'),

  (NULL, 'tile', 'Wall Feature Strip',
   'Decorative wall strip: 4m wide x 1m high, 100x200mm mosaic tiles, adhesive method.',
   '{"surfaceType":"wall","method":"adhesive","length":4,"width":1,"tileWidthMm":100,"tileHeightMm":200,"wasteMargin":15,"unit":"meters"}'::jsonb,
   'public', true, false, 114, 'wall-feature-strip-tiling',
   'Tile Calculator Template: Wall Feature Strip | FRELUX',
   'Calculate tiles for decorative wall feature strips with this FRELUX template.'),

-- =========================================================
-- Screeding templates (5 new)
-- =========================================================
  (NULL, 'screeding', 'Dining Room Screeding',
   'Full room screeding: 3.5m x 4.5m, 2.8m ceiling, 1 door, 2 windows.',
   '{"method":"full_room","roomLength":3.5,"roomWidth":4.5,"wallHeight":2.8,"doors":1,"windows":2,"unit":"meters"}'::jsonb,
   'public', true, false, 115, 'dining-room-screeding',
   'Screeding Calculator Template: Dining Room | FRELUX',
   'Calculate screeding materials for a dining room with this FRELUX template.'),

  (NULL, 'screeding', 'Office Screeding',
   'Full office screeding: 6m x 8m, 3m ceiling, 2 doors, 4 windows.',
   '{"method":"full_room","roomLength":6,"roomWidth":8,"wallHeight":3,"doors":2,"windows":4,"unit":"meters"}'::jsonb,
   'public', true, false, 116, 'office-screeding',
   'Screeding Calculator Template: Office | FRELUX',
   'Calculate screeding materials for office walls with this FRELUX template.'),

  (NULL, 'screeding', 'Corridor Screeding',
   'Corridor screeding: 8m x 1.5m, 3m ceiling, 3 doors.',
   '{"method":"full_room","roomLength":8,"roomWidth":1.5,"wallHeight":3,"doors":3,"windows":0,"unit":"meters"}'::jsonb,
   'public', true, false, 117, 'corridor-screeding',
   'Screeding Calculator Template: Corridor | FRELUX',
   'Calculate screeding materials for corridors with this FRELUX template.'),

  (NULL, 'screeding', 'Single Feature Wall',
   'Single feature wall screeding: 4m wide, 2.8m high, 1 wall.',
   '{"method":"individual_wall","wallWidth":4,"wallCount":1,"wallHeight":2.8,"doors":0,"windows":0,"unit":"meters"}'::jsonb,
   'public', true, false, 118, 'single-feature-wall-screeding',
   'Screeding Calculator Template: Single Feature Wall | FRELUX',
   'Calculate screeding materials for a single feature wall with this FRELUX template.'),

  (NULL, 'screeding', 'Shop Front Screeding',
   'Shop front screeding: 5m wide, 4m high, 1 large opening.',
   '{"method":"individual_wall","wallWidth":5,"wallCount":1,"wallHeight":4,"doors":1,"windows":0,"unit":"meters"}'::jsonb,
   'public', true, false, 119, 'shop-front-screeding',
   'Screeding Calculator Template: Shop Front | FRELUX',
   'Calculate screeding materials for shop front walls with this FRELUX template.'),

-- =========================================================
-- POP Ceiling templates (5 new)
-- =========================================================
  (NULL, 'pop', 'Dining Room POP Ceiling',
   'Dining room POP ceiling: 3.5m x 4.5m, with decorative elements.',
   '{"workflow":"nigeria","roomLength":3.5,"roomWidth":4.5,"wasteMargin":10,"includeDecorative":true,"includeOptional":false,"unit":"meters"}'::jsonb,
   'public', true, false, 120, 'dining-room-pop-ceiling',
   'POP Ceiling Calculator Template: Dining Room | FRELUX',
   'Calculate POP ceiling materials for a dining room with this FRELUX template.'),

  (NULL, 'pop', 'Kitchen POP Ceiling',
   'Kitchen POP ceiling: 3m x 4m, basic design without decorative elements.',
   '{"workflow":"nigeria","roomLength":3,"roomWidth":4,"wasteMargin":10,"includeDecorative":false,"includeOptional":false,"unit":"meters"}'::jsonb,
   'public', true, false, 121, 'kitchen-pop-ceiling',
   'POP Ceiling Calculator Template: Kitchen | FRELUX',
   'Calculate POP ceiling materials for a kitchen with this FRELUX template.'),

  (NULL, 'pop', 'Corridor POP Ceiling',
   'Corridor POP ceiling: 8m x 1.5m, with cornice.',
   '{"workflow":"nigeria","roomLength":8,"roomWidth":1.5,"wasteMargin":10,"includeDecorative":true,"includeOptional":false,"unit":"meters"}'::jsonb,
   'public', true, false, 122, 'corridor-pop-ceiling',
   'POP Ceiling Calculator Template: Corridor | FRELUX',
   'Calculate POP ceiling materials for a corridor with this FRELUX template.'),

  (NULL, 'pop', 'Master Bedroom POP Ceiling',
   'Master bedroom POP ceiling: 4m x 4m, with decorative rose.',
   '{"workflow":"nigeria","roomLength":4,"roomWidth":4,"wasteMargin":10,"includeDecorative":true,"includeOptional":true,"unit":"meters"}'::jsonb,
   'public', true, true, 123, 'master-bedroom-pop-ceiling',
   'POP Ceiling Calculator Template: Master Bedroom | FRELUX',
   'Calculate POP ceiling materials for a master bedroom with this FRELUX template.'),

  (NULL, 'pop', 'Conference Room POP Ceiling',
   'Large conference room POP ceiling: 8m x 10m, decorative design.',
   '{"workflow":"nigeria","roomLength":8,"roomWidth":10,"wasteMargin":10,"includeDecorative":true,"includeOptional":true,"unit":"meters"}'::jsonb,
   'public', true, false, 124, 'conference-room-pop-ceiling',
   'POP Ceiling Calculator Template: Conference Room | FRELUX',
   'Calculate POP ceiling materials for a large conference room with this FRELUX template.')

ON CONFLICT (slug) DO NOTHING;
