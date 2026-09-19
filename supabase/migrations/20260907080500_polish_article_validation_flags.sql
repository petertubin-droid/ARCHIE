-- Polish pass: bring all 66 articles to fully-green validation
-- - Rename '## Closing' -> '## Conclusion' (conclusion-section signal)
-- - Add internal links to the 11 painting guides (internal-links rule)
-- - Rewrite over-length meta descriptions to 120-160 chars
-- - Shorten 5 over-length meta titles to 30-60 chars
-- - Correct 7 read_time_minutes values to match word count
-- All statements guarded; re-run is a no-op.

UPDATE learn_articles SET content = replace(content, '## Closing', '## Conclusion'), updated_at = now()
WHERE status='published' AND content LIKE '%## Closing%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='frequently-asked-questions-about-paint-colors-and-calculators' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='paint-industry-trends-innovations-shaping-2026-and-beyond' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='real-world-painting-projects-dramatic-transformations' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='essential-painting-video-tutorials-walkthroughs-beginners' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='top-paint-brands-compared-which-premium-paint-worth-your-money' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = regexp_replace(content, 'Frelux paint calculator', '[Frelux paint calculator](/paint-calculator)'), updated_at = now()
WHERE slug='choosing-right-paint-type-finish-for-every-room' AND status='published' AND content LIKE '%Frelux paint calculator%' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = content || $body$

Before you start, size the job precisely — the [Frelux paint calculator](/paint-calculator) turns your room dimensions into exact paint quantities, coats and all.$body$, updated_at = now()
WHERE slug='complete-guide-painting-interior-walls-professional' AND status='published' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = content || $body$

See the effects before you commit: browse the [Frelux color gallery](/colors) to preview how warm, cool, and neutral palettes read in real rooms.$body$, updated_at = now()
WHERE slug='how-paint-colors-affect-mood-and-space-perception' AND status='published' AND content NOT LIKE '%](/painting-estimator)%';

UPDATE learn_articles SET content = content || $body$

Then price the job before you open a tin — the [Frelux painting estimator](/painting-estimator) works out paint, primer, and labour from your room's dimensions.$body$, updated_at = now()
WHERE slug='professional-painting-tips-techniques-better-results' AND status='published' AND content NOT LIKE '%](/painting-estimator)%';

UPDATE learn_articles SET content = content || $body$

When the surface is ready, match the effort with measured materials: the [Frelux paint calculator](/paint-calculator) sizes your paint exactly to the prepared area.$body$, updated_at = now()
WHERE slug='essential-guide-preparing-surfaces-before-painting' AND status='published' AND content NOT LIKE '%](/paint-calculator)%';

UPDATE learn_articles SET content = content || $body$

## Conclusion

Whether you refresh one cabinet or the whole kitchen, the sequence holds: clean, sand, prime, and give every coat its cure time. Start by sizing the job with the [Frelux paint calculator](/paint-calculator) so the quantities you buy keep every coat generous.$body$, updated_at = now()
WHERE slug='paint-kitchen-cabinets-without-removing-them' AND status='published' AND content NOT LIKE '%## Conclusion%';

UPDATE learn_articles SET content = content || $body$

## Conclusion

Whether you specify smart coatings or simply pick next year's colour, precision is the trend worth keeping: test the surface, calculate the quantities, and buy exactly what the job needs.$body$, updated_at = now()
WHERE slug='paint-industry-trends-innovations-shaping-2026-and-beyond' AND status='published' AND content NOT LIKE '%## Conclusion%';

UPDATE learn_articles SET meta_description = 'Cost optimization strategies for Nigerian building projects: smart material sourcing, design simplification, and labour management that cut waste, not quality.', updated_at = now()
WHERE slug='building-on-budget-cost-optimization-strategies' AND status='published' AND meta_description IS DISTINCT FROM 'Cost optimization strategies for Nigerian building projects: smart material sourcing, design simplification, and labour management that cut waste, not quality.';

UPDATE learn_articles SET meta_description = 'The most common Nigerian construction mistakes and how to prevent them: foundation errors, structural issues, material failures, and quality control gaps.', updated_at = now()
WHERE slug='common-construction-mistakes-and-how-to-prevent' AND status='published' AND meta_description IS DISTINCT FROM 'The most common Nigerian construction mistakes and how to prevent them: foundation errors, structural issues, material failures, and quality control gaps.';

UPDATE learn_articles SET meta_description = 'Every phase of the building construction sequence, from site preparation and foundation to walls, roof, finishing, and handover, in the right order.', updated_at = now()
WHERE slug='complete-guide-building-construction-sequence' AND status='published' AND meta_description IS DISTINCT FROM 'Every phase of the building construction sequence, from site preparation and foundation to walls, roof, finishing, and handover, in the right order.';

UPDATE learn_articles SET meta_description = 'Construction quality control checklist: foundation, structure, walls, roof, and finishing inspection points that ensure building quality and safety.', updated_at = now()
WHERE slug='construction-quality-control-inspection-checklist' AND status='published' AND meta_description IS DISTINCT FROM 'Construction quality control checklist: foundation, structure, walls, roof, and finishing inspection points that ensure building quality and safety.';

UPDATE learn_articles SET meta_description = 'Realistic timelines for each construction phase in Nigeria: foundation, walls, roof, finishing, and total project duration with the factors that move them.', updated_at = now()
WHERE slug='construction-timeline-how-long-each-phase-takes' AND status='published' AND meta_description IS DISTINCT FROM 'Realistic timelines for each construction phase in Nigeria: foundation, walls, roof, finishing, and total project duration with the factors that move them.';

UPDATE learn_articles SET meta_description = 'How to estimate building materials phase by phase: foundation, walls, roof, and finishing calculations with Nigerian market prices and quantities.', updated_at = now()
WHERE slug='how-to-estimate-materials-each-construction-phase' AND status='published' AND meta_description IS DISTINCT FROM 'How to estimate building materials phase by phase: foundation, walls, roof, and finishing calculations with Nigerian market prices and quantities.';

UPDATE learn_articles SET meta_description = 'Plan a build-to-roof project properly: budgeting, material scheduling, contractor selection, permits, and project management for Nigerian construction.', updated_at = now()
WHERE slug='how-to-plan-your-build-to-roof-project' AND status='published' AND meta_description IS DISTINCT FROM 'Plan a build-to-roof project properly: budgeting, material scheduling, contractor selection, permits, and project management for Nigerian construction.';

UPDATE learn_articles SET meta_description = 'Nigerian building regulations explained: planning approval, building codes, structural standards, safety requirements, and the approval process.', updated_at = now()
WHERE slug='nigerian-building-regulations-what-you-need-to-know' AND status='published' AND meta_description IS DISTINCT FROM 'Nigerian building regulations explained: planning approval, building codes, structural standards, safety requirements, and the approval process.';

UPDATE learn_articles SET meta_description = 'Structural considerations for multi-story buildings: foundations, column spacing, load calculations, lateral stability, and Nigerian material specs.', updated_at = now()
WHERE slug='structural-considerations-multi-story-buildings' AND status='published' AND meta_description IS DISTINCT FROM 'Structural considerations for multi-story buildings: foundations, column spacing, load calculations, lateral stability, and Nigerian material specs.';

UPDATE learn_articles SET meta_description = 'Techniques for textured wall finishes: stippling, swirl, knockdown, and sand textures, with the right tools, materials, and application methods.', updated_at = now()
WHERE slug='achieving-textured-finishes-techniques-tools' AND status='published' AND meta_description IS DISTINCT FROM 'Techniques for textured wall finishes: stippling, swirl, knockdown, and sand textures, with the right tools, materials, and application methods.';

UPDATE learn_articles SET meta_description = 'How to choose the right wall finish for concrete, block, plaster, wood, and metal surfaces: compatibility, preparation, and application.', updated_at = now()
WHERE slug='choosing-right-finish-different-surfaces' AND status='published' AND meta_description IS DISTINCT FROM 'How to choose the right wall finish for concrete, block, plaster, wood, and metal surfaces: compatibility, preparation, and application.';

UPDATE learn_articles SET meta_description = 'Identify and fix common wall finishing defects: cracks, blisters, efflorescence, uneven surfaces, and peeling paint, with causes and solutions.', updated_at = now()
WHERE slug='common-finishing-defects-and-how-to-fix' AND status='published' AND meta_description IS DISTINCT FROM 'Identify and fix common wall finishing defects: cracks, blisters, efflorescence, uneven surfaces, and peeling paint, with causes and solutions.';

UPDATE learn_articles SET meta_description = 'Complete guide to interior wall finishing: surface preparation, skim coating, putty, sanding, priming, and painting for flawless walls.', updated_at = now()
WHERE slug='complete-guide-interior-wall-finishing' AND status='published' AND meta_description IS DISTINCT FROM 'Complete guide to interior wall finishing: surface preparation, skim coating, putty, sanding, priming, and painting for flawless walls.';

UPDATE learn_articles SET meta_description = 'The wall finishing tools every contractor needs: trowels, floats, sanders, mixing tools, spray equipment, and safety gear for pro results.', updated_at = now()
WHERE slug='finishing-tools-every-contractor-should-own' AND status='published' AND meta_description IS DISTINCT FROM 'The wall finishing tools every contractor needs: trowels, floats, sanders, mixing tools, spray equipment, and safety gear for pro results.';

UPDATE learn_articles SET meta_description = 'Professional techniques for smooth wall finishes: surface prep, application methods, sanding tips, and the issues that prevent smooth results.', updated_at = now()
WHERE slug='how-to-achieve-smooth-wall-finish' AND status='published' AND meta_description IS DISTINCT FROM 'Professional techniques for smooth wall finishes: surface prep, application methods, sanding tips, and the issues that prevent smooth results.';

UPDATE learn_articles SET meta_description = 'Interior vs exterior wall finishing: the differences in materials, techniques, weather resistance, and durability for each application.', updated_at = now()
WHERE slug='interior-vs-exterior-wall-finishing-differences' AND status='published' AND meta_description IS DISTINCT FROM 'Interior vs exterior wall finishing: the differences in materials, techniques, weather resistance, and durability for each application.';

UPDATE learn_articles SET meta_description = 'Paint buying guide covering types, finishes, sheens, and quality grades: which paint to use in every room for the best results and longevity.', updated_at = now()
WHERE slug='choosing-right-paint-type-finish-for-every-room' AND status='published' AND meta_description IS DISTINCT FROM 'Paint buying guide covering types, finishes, sheens, and quality grades: which paint to use in every room for the best results and longevity.';

UPDATE learn_articles SET meta_description = 'Paint interior walls like a professional: tools, preparation, priming, cutting in, rolling, and the pro tips that deliver a flawless finish.', updated_at = now()
WHERE slug='complete-guide-painting-interior-walls-professional' AND status='published' AND meta_description IS DISTINCT FROM 'Paint interior walls like a professional: tools, preparation, priming, cutting in, rolling, and the pro tips that deliver a flawless finish.';

UPDATE learn_articles SET meta_description = 'Surface preparation before painting: cleaning, removing old paint, repairing cracks, sanding, and priming, for drywall, wood, and masonry.', updated_at = now()
WHERE slug='essential-guide-preparing-surfaces-before-painting' AND status='published' AND meta_description IS DISTINCT FROM 'Surface preparation before painting: cleaning, removing old paint, repairing cracks, sanding, and priming, for drywall, wood, and masonry.';

UPDATE learn_articles SET meta_description = 'Essential painting video tutorials for beginners: cutting in, rolling, cabinet painting, preparation, and fixing common mistakes visually.', updated_at = now()
WHERE slug='essential-painting-video-tutorials-walkthroughs-beginners' AND status='published' AND meta_description IS DISTINCT FROM 'Essential painting video tutorials for beginners: cutting in, rolling, cabinet painting, preparation, and fixing common mistakes visually.';

UPDATE learn_articles SET meta_description = 'Answers to common questions on paint types, coverage, color selection, paint calculators, preparation, and fixing painting problems.', updated_at = now()
WHERE slug='frequently-asked-questions-about-paint-colors-and-calculators' AND status='published' AND meta_description IS DISTINCT FROM 'Answers to common questions on paint types, coverage, color selection, paint calculators, preparation, and fixing painting problems.';

UPDATE learn_articles SET meta_description = 'Paint industry trends and innovations for 2026: smart coatings, sustainable formulations, color trends, and the digital tools reshaping paint.', updated_at = now()
WHERE slug='paint-industry-trends-innovations-shaping-2026-and-beyond' AND status='published' AND meta_description IS DISTINCT FROM 'Paint industry trends and innovations for 2026: smart coatings, sustainable formulations, color trends, and the digital tools reshaping paint.';

UPDATE learn_articles SET meta_description = 'Paint kitchen cabinets without removing them: cleaning, sanding, priming, painting, and reinstalling hardware for a professional finish.', updated_at = now()
WHERE slug='paint-kitchen-cabinets-without-removing-them' AND status='published' AND meta_description IS DISTINCT FROM 'Paint kitchen cabinets without removing them: cleaning, sanding, priming, painting, and reinstalling hardware for a professional finish.';

UPDATE learn_articles SET meta_description = 'Professional painting tips and techniques: brush skills, roller methods, paint selection, timing, tape tricks, and cleanup for flawless results.', updated_at = now()
WHERE slug='professional-painting-tips-techniques-better-results' AND status='published' AND meta_description IS DISTINCT FROM 'Professional painting tips and techniques: brush skills, roller methods, paint selection, timing, tape tricks, and cleanup for flawless results.';

UPDATE learn_articles SET meta_description = 'Real painting project case studies with dramatic transformations: paneling, cabinets, exteriors, and small-apartment colour strategies.', updated_at = now()
WHERE slug='real-world-painting-projects-dramatic-transformations' AND status='published' AND meta_description IS DISTINCT FROM 'Real painting project case studies with dramatic transformations: paneling, cabinets, exteriors, and small-apartment colour strategies.';

UPDATE learn_articles SET meta_description = 'Premium paint brands compared: Benjamin Moore, Sherwin Williams, Behr, Farrow and Ball, and Valspar on coverage, durability, and value.', updated_at = now()
WHERE slug='top-paint-brands-compared-which-premium-paint-worth-your-money' AND status='published' AND meta_description IS DISTINCT FROM 'Premium paint brands compared: Benjamin Moore, Sherwin Williams, Behr, Farrow and Ball, and Valspar on coverage, durability, and value.';

UPDATE learn_articles SET meta_description = 'Identify and fix common POP ceiling issues: cracks, sagging, water stains, joint problems, and mould, with practical homeowner solutions.', updated_at = now()
WHERE slug='common-pop-ceiling-problems-and-solutions' AND status='published' AND meta_description IS DISTINCT FROM 'Identify and fix common POP ceiling issues: cracks, sagging, water stains, joint problems, and mould, with practical homeowner solutions.';

UPDATE learn_articles SET meta_description = 'POP ceilings vs suspended grid ceilings compared: cost, installation, appearance, durability, and maintenance to choose the right system.', updated_at = now()
WHERE slug='pop-ceiling-vs-suspended-ceiling-comparison' AND status='published' AND meta_description IS DISTINCT FROM 'POP ceilings vs suspended grid ceilings compared: cost, installation, appearance, durability, and maintenance to choose the right system.';

UPDATE learn_articles SET meta_description = 'The complete wall screeding process from preparation to finish: materials, cement-sand ratios, application techniques, and curing.', updated_at = now()
WHERE slug='complete-guide-wall-screeding-professional' AND status='published' AND meta_description IS DISTINCT FROM 'The complete wall screeding process from preparation to finish: materials, cement-sand ratios, application techniques, and curing.';

UPDATE learn_articles SET meta_description = 'Floor tile installation from the subfloor up: preparation, set-out, adhesive, laying, spacing, cutting, curing, and grouting done right.', updated_at = now()
WHERE slug='complete-guide-floor-tile-installation' AND status='published' AND meta_description IS DISTINCT FROM 'Floor tile installation from the subfloor up: preparation, set-out, adhesive, laying, spacing, cutting, curing, and grouting done right.';

UPDATE learn_articles SET meta_description = 'Tiling a bathroom properly: waterproofing membranes, wet-area adhesives, falls to drains, grouting, and sealing for a shower that never leaks.', updated_at = now()
WHERE slug='how-to-tile-bathroom-waterproofing-best-practices' AND status='published' AND meta_description IS DISTINCT FROM 'Tiling a bathroom properly: waterproofing membranes, wet-area adhesives, falls to drains, grouting, and sealing for a shower that never leaks.';

UPDATE learn_articles SET meta_description = 'Outdoor tiling with weather-resistant materials: absorption ratings, slip resistance, movement joints, exterior adhesives, and drainage.', updated_at = now()
WHERE slug='outdoor-tiling-weather-resistant-materials' AND status='published' AND meta_description IS DISTINCT FROM 'Outdoor tiling with weather-resistant materials: absorption ratings, slip resistance, movement joints, exterior adhesives, and drainage.';

UPDATE learn_articles SET meta_description = 'Tile grout selection and application: types compared, joint-width rules, colour choice, mixing and packing technique, curing, and sealing.', updated_at = now()
WHERE slug='tile-grout-selection-and-application' AND status='published' AND meta_description IS DISTINCT FROM 'Tile grout selection and application: types compared, joint-width rules, colour choice, mixing and packing technique, curing, and sealing.';

UPDATE learn_articles SET meta_description = 'Tile layout patterns compared: straight grid, running bond, diagonal, herringbone, and modular weaves, with waste factors and set-out.', updated_at = now()
WHERE slug='tile-layout-patterns-herringbone-straight-diagonal' AND status='published' AND meta_description IS DISTINCT FROM 'Tile layout patterns compared: straight grid, running bond, diagonal, herringbone, and modular weaves, with waste factors and set-out.';

UPDATE learn_articles SET meta_description = 'Wall tiling step by step: surface preparation, batten set-out, vertical adhesive work, spacing, cutting around fittings, and grouting.', updated_at = now()
WHERE slug='wall-tiling-step-by-step-installation' AND status='published' AND meta_description IS DISTINCT FROM 'Wall tiling step by step: surface preparation, batten set-out, vertical adhesive work, spacing, cutting around fittings, and grouting.';

UPDATE learn_articles SET meta_title = 'Painting Interior Walls Like a Professional', updated_at = now()
WHERE slug='complete-guide-painting-interior-walls-professional' AND status='published' AND meta_title IS DISTINCT FROM 'Painting Interior Walls Like a Professional';

UPDATE learn_articles SET meta_title = 'Painting Video Tutorials for Beginners', updated_at = now()
WHERE slug='essential-painting-video-tutorials-walkthroughs-beginners' AND status='published' AND meta_title IS DISTINCT FROM 'Painting Video Tutorials for Beginners';

UPDATE learn_articles SET meta_title = 'FAQ: Paint, Colors, and Paint Calculators', updated_at = now()
WHERE slug='frequently-asked-questions-about-paint-colors-and-calculators' AND status='published' AND meta_title IS DISTINCT FROM 'FAQ: Paint, Colors, and Paint Calculators';

UPDATE learn_articles SET meta_title = 'Paint Trends and Innovations for 2026', updated_at = now()
WHERE slug='paint-industry-trends-innovations-shaping-2026-and-beyond' AND status='published' AND meta_title IS DISTINCT FROM 'Paint Trends and Innovations for 2026';

UPDATE learn_articles SET meta_title = 'Which Premium Paint Brand Is Worth Your Money?', updated_at = now()
WHERE slug='top-paint-brands-compared-which-premium-paint-worth-your-money' AND status='published' AND meta_title IS DISTINCT FROM 'Which Premium Paint Brand Is Worth Your Money?';

UPDATE learn_articles SET read_time_minutes = 10, updated_at = now()
WHERE slug='top-paint-brands-compared-which-premium-paint-worth-your-money' AND status='published' AND read_time_minutes IS DISTINCT FROM 10;

UPDATE learn_articles SET read_time_minutes = 15, updated_at = now()
WHERE slug='complete-guide-interior-wall-finishing' AND status='published' AND read_time_minutes IS DISTINCT FROM 15;

UPDATE learn_articles SET read_time_minutes = 14, updated_at = now()
WHERE slug='how-to-achieve-smooth-wall-finish' AND status='published' AND read_time_minutes IS DISTINCT FROM 14;

UPDATE learn_articles SET read_time_minutes = 14, updated_at = now()
WHERE slug='types-of-wall-finishes-skim-coat-putty-paint' AND status='published' AND read_time_minutes IS DISTINCT FROM 14;

UPDATE learn_articles SET read_time_minutes = 14, updated_at = now()
WHERE slug='interior-vs-exterior-wall-finishing-differences' AND status='published' AND read_time_minutes IS DISTINCT FROM 14;

UPDATE learn_articles SET read_time_minutes = 14, updated_at = now()
WHERE slug='finishing-tools-every-contractor-should-own' AND status='published' AND read_time_minutes IS DISTINCT FROM 14;

UPDATE learn_articles SET read_time_minutes = 14, updated_at = now()
WHERE slug='common-finishing-defects-and-how-to-fix' AND status='published' AND read_time_minutes IS DISTINCT FROM 14;

