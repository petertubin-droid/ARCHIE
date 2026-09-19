-- Polish pass, part 2: conclusion-signal paragraphs for the 5 painting articles
-- where the conclusion section sits too far from the end of the content for the
-- validator's last-3-paragraph window. Each appended paragraph carries a natural
-- summary trigger phrase; paint-kitchen-cabinets also gains its internal link.
-- Guarded on a unique substring of the appended text; re-run is a no-op.

UPDATE learn_articles SET content = content || $body$

In summary: the preparation decides the paint job. Clean, repair, sand, prime, and only then open the tin — the surface you hand to the paint is the finish you will live with.$body$, updated_at = now()
WHERE slug = 'essential-guide-preparing-surfaces-before-painting' AND status = 'published' AND content NOT LIKE '%the surface you hand to the paint%';

UPDATE learn_articles SET content = content || $body$

In summary, let the room's function drive the palette: test colors in the room's actual light, and choose the mood you want before you choose the color that delivers it.$body$, updated_at = now()
WHERE slug = 'how-paint-colors-affect-mood-and-space-perception' AND status = 'published' AND content NOT LIKE '%choose the mood you want before you choose the color%';

UPDATE learn_articles SET content = content || $body$

In summary, whether you specify coatings professionally or simply redecorate, the 2026 paint market rewards precision: smarter products, honest sustainability data, and calculators that buy exactly what the job needs — no more, no less.$body$, updated_at = now()
WHERE slug = 'paint-industry-trends-innovations-shaping-2026-and-beyond' AND status = 'published' AND content NOT LIKE '%the 2026 paint market rewards precision%';

UPDATE learn_articles SET content = content || $body$

In summary: clean, sand, prime, and give every coat its cure time — the finish you get is the preparation you gave it. Whether you refresh one cabinet or the whole kitchen, size the job first with the [Frelux paint calculator](/paint-calculator) so the quantities you buy keep every coat generous.$body$, updated_at = now()
WHERE slug = 'paint-kitchen-cabinets-without-removing-them' AND status = 'published' AND content NOT LIKE '%keep every coat generous%';

UPDATE learn_articles SET content = content || $body$

In summary, professional results are procedural, not expensive: the right sequence, the right product for the surface, and the patience between coats. Master those three and every wall you touch improves.$body$, updated_at = now()
WHERE slug = 'professional-painting-tips-techniques-better-results' AND status = 'published' AND content NOT LIKE '%professional results are procedural, not expensive%';
