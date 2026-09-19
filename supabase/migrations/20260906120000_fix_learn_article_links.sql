-- Fix broken internal calculator links in Learn article content.
--
-- The phase52/phase53 article seeds linked to /finishing-calculator and
-- /build-to-roof-calculator, which are not valid routes in App.tsx
-- (the real routes are /finish-estimator and /build-to-roof-estimator).
-- Users clicking those links in any of the 22 affected articles landed
-- on the 404 page. This migration rewrites the links in place. Safe to
-- re-run (the replace is a no-op once applied).
UPDATE public.learn_articles
SET content = replace(
      replace(
        content,
        '](/finishing-calculator)',
        '](/finish-estimator)'
      ),
      '](/build-to-roof-calculator)',
      '](/build-to-roof-estimator)'
    ),
    updated_at = now()
WHERE content LIKE '%](/finishing-calculator)%'
   OR content LIKE '%](/build-to-roof-calculator)%';
