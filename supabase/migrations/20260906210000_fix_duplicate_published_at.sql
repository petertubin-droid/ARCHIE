-- Give the 11 painting-guide articles that shared an identical published_at
-- (2026-08-27 00:00:00+00) distinct hourly timestamps so chronological ordering
-- (Learn index, category pages, sitemap lastmod) works correctly. Idempotent:
-- the WHERE guard only matches rows still on the old timestamp.
BEGIN;
UPDATE learn_articles SET published_at = '2026-08-27 06:00:00+00' WHERE slug = 'paint-industry-trends-innovations-shaping-2026-and-beyond' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 07:07:00+00' WHERE slug = 'essential-painting-video-tutorials-walkthroughs-beginners' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 08:14:00+00' WHERE slug = 'complete-guide-painting-interior-walls-professional' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 09:21:00+00' WHERE slug = 'real-world-painting-projects-dramatic-transformations' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 10:28:00+00' WHERE slug = 'essential-guide-preparing-surfaces-before-painting' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 11:35:00+00' WHERE slug = 'paint-kitchen-cabinets-without-removing-them' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 12:42:00+00' WHERE slug = 'how-paint-colors-affect-mood-and-space-perception' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 13:49:00+00' WHERE slug = 'frequently-asked-questions-about-paint-colors-and-calculators' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 14:56:00+00' WHERE slug = 'professional-painting-tips-techniques-better-results' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 15:03:00+00' WHERE slug = 'choosing-right-paint-type-finish-for-every-room' AND published_at = '2026-08-27 00:00:00+00';
UPDATE learn_articles SET published_at = '2026-08-27 16:10:00+00' WHERE slug = 'top-paint-brands-compared-which-premium-paint-worth-your-money' AND published_at = '2026-08-27 00:00:00+00';
COMMIT;
