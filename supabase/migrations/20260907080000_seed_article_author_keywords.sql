-- Seed author byline and meta_keywords for all 66 published articles
-- Fills the E-E-A-T author gap and keyword metadata flagged by article validation.
-- Guarded: only fills NULL fields; re-run is a no-op.

UPDATE learn_articles SET author = 'Frelux Editorial Team', updated_at = now()
WHERE status = 'published' AND author IS NULL;

UPDATE learn_articles SET meta_keywords = 'screeding mistakes, screed defects, avoid cracks, screeding errors, prevention tips', updated_at = now()
WHERE slug = 'common-screeding-mistakes-how-to-avoid' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'screeding vs plastering, screed vs plaster, wall coating options, finishing differences, which to choose', updated_at = now()
WHERE slug = 'screeding-vs-plastering-key-differences' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'wall preparation screeding, surface prep, bonding surface, clean walls, prep steps', updated_at = now()
WHERE slug = 'how-to-prepare-walls-for-screeding' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'painting interior walls, interior painting guide, wall painting, painting sequence, professional results', updated_at = now()
WHERE slug = 'complete-guide-painting-interior-walls-professional' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'paint FAQ, paint calculator questions, paint coverage, color calculator, painting help', updated_at = now()
WHERE slug = 'frequently-asked-questions-about-paint-colors-and-calculators' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'paint colors mood, color psychology, space perception, room color effects, color choice', updated_at = now()
WHERE slug = 'how-paint-colors-affect-mood-and-space-perception' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'wall screeding, screeding guide, screed application, professional screeding, wall preparation', updated_at = now()
WHERE slug = 'complete-guide-wall-screeding-professional' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'paint trends 2026, paint innovation, coating technology, paint industry, future of paint', updated_at = now()
WHERE slug = 'paint-industry-trends-innovations-shaping-2026-and-beyond' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'painting projects, before and after, room transformations, painting makeovers, real projects', updated_at = now()
WHERE slug = 'real-world-painting-projects-dramatic-transformations' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'painting tutorials, painting videos, beginner painting, learn painting, video walkthroughs', updated_at = now()
WHERE slug = 'essential-painting-video-tutorials-walkthroughs-beginners' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'paint brands Nigeria, premium paint comparison, best paint brands, paint quality, paint prices', updated_at = now()
WHERE slug = 'top-paint-brands-compared-which-premium-paint-worth-your-money' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'screeding materials, screed quantity, cement sand calculation, screeding estimation, material quantities', updated_at = now()
WHERE slug = 'how-to-calculate-screeding-material-quantities' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'cement sand ratio, screed mix ratio, mixing screed, screed composition, correct mix', updated_at = now()
WHERE slug = 'cement-sand-ratio-screeding-explained' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'bonding agents, screed adhesion, bonding chemicals, key coat, adhesion promoters', updated_at = now()
WHERE slug = 'best-bonding-agents-wall-screeding' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'screeding cost Nigeria, screeding price, cost per square metre, labour cost screeding, budget screeding', updated_at = now()
WHERE slug = 'how-to-estimate-screeding-costs-nigeria' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'screed curing time, drying schedule, screed drying, curing walls, waiting periods', updated_at = now()
WHERE slug = 'curing-drying-times-screeded-walls' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling installation, POP ceiling guide, plaster of Paris, ceiling installation, POP process', updated_at = now()
WHERE slug = 'complete-guide-pop-ceiling-installation' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'screeding tools, hawk and trowel, screeding equipment, tool guide, screed tools', updated_at = now()
WHERE slug = 'screeding-tools-equipment-guide' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling materials, POP quantity calculation, ceiling materials, POP cement bags, material estimation', updated_at = now()
WHERE slug = 'how-to-calculate-pop-ceiling-material-quantities' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'outdoor tiling, exterior tiles, weather resistant tiles, outdoor porcelain, exterior installation', updated_at = now()
WHERE slug = 'outdoor-tiling-weather-resistant-materials' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'interior wall finishing, wall finishing guide, skim coat, putty application, finishing sequence', updated_at = now()
WHERE slug = 'complete-guide-interior-wall-finishing' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP vs suspended ceiling, ceiling comparison, suspended ceiling, ceiling options, ceiling systems', updated_at = now()
WHERE slug = 'pop-ceiling-vs-suspended-ceiling-comparison' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP board installation, ceiling board fixing, gypsum board ceiling, step by step POP, board ceiling', updated_at = now()
WHERE slug = 'step-by-step-pop-ceiling-board-installation' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling cost, POP price Nigeria, ceiling budget, POP installation cost, cost per square metre', updated_at = now()
WHERE slug = 'pop-ceiling-cost-estimation-guide' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling designs, ceiling patterns, modern ceiling designs, POP styles, ceiling types', updated_at = now()
WHERE slug = 'types-of-pop-ceiling-designs-and-patterns' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'living room POP designs, creative ceilings, living room ceiling, POP design ideas, ceiling aesthetics', updated_at = now()
WHERE slug = 'creative-pop-ceiling-designs-for-living-rooms' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling maintenance, ceiling repair, cleaning POP, ceiling care, POP upkeep', updated_at = now()
WHERE slug = 'pop-ceiling-maintenance-and-repair-tips' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'ceramic vs porcelain, tile types, natural stone tiles, tile selection, tile materials', updated_at = now()
WHERE slug = 'choosing-right-tiles-ceramic-porcelain-stone' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'DIY POP ceiling, self install ceiling, POP DIY guide, ceiling installation yourself, DIY risks', updated_at = now()
WHERE slug = 'diy-pop-ceiling-can-you-install-yourself' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tile quantity calculation, tile calculator, tiles per square metre, tile estimation, coverage calculation', updated_at = now()
WHERE slug = 'how-to-calculate-tile-quantities-any-room' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'construction material estimation, building materials, phase by phase budgeting, material quantities, construction cost planning', updated_at = now()
WHERE slug = 'how-to-estimate-materials-each-construction-phase' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tile layout patterns, herringbone pattern, diagonal tiling, straight lay, pattern waste', updated_at = now()
WHERE slug = 'tile-layout-patterns-herringbone-straight-diagonal' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tiling mistakes, tile failures, lippage, hollow tiles, prevention tips', updated_at = now()
WHERE slug = 'common-tiling-mistakes-and-how-to-avoid' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'floor tile installation, tiling guide, laying floor tiles, tile adhesive, installation steps', updated_at = now()
WHERE slug = 'complete-guide-floor-tile-installation' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'painting kitchen cabinets, cabinet refinishing, painting without removal, kitchen makeover, cabinet paint', updated_at = now()
WHERE slug = 'paint-kitchen-cabinets-without-removing-them' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'building construction sequence, construction phases, build process Nigeria, site preparation, building project stages', updated_at = now()
WHERE slug = 'complete-guide-building-construction-sequence' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'construction quality control, inspection checklist, site inspection, building standards, quality assurance construction', updated_at = now()
WHERE slug = 'construction-quality-control-inspection-checklist' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'Nigerian building regulations, building approval, town planning permits, building codes Nigeria, construction law', updated_at = now()
WHERE slug = 'nigerian-building-regulations-what-you-need-to-know' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'painting tips, painting techniques, professional painting, cutting in, roller technique', updated_at = now()
WHERE slug = 'professional-painting-tips-techniques-better-results' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'paint types, paint finishes, sheen selection, room by room paint, matte vs gloss', updated_at = now()
WHERE slug = 'choosing-right-paint-type-finish-for-every-room' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tile grout selection, grouting technique, grout types, epoxy grout, sealing grout', updated_at = now()
WHERE slug = 'tile-grout-selection-and-application' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'wall tiling, wall tile installation, vertical tiling, tiling walls, bathroom wall tiles', updated_at = now()
WHERE slug = 'wall-tiling-step-by-step-installation' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tile cost estimation, tiling budget, tiling cost Nigeria, labour cost tiling, tile prices', updated_at = now()
WHERE slug = 'tile-cost-estimation-materials-labour-budget' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'surface preparation, painting prep, priming walls, cleaning before paint, prep checklist', updated_at = now()
WHERE slug = 'essential-guide-preparing-surfaces-before-painting' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'construction mistakes, building defects prevention, site supervision, quality control building, common building errors', updated_at = now()
WHERE slug = 'common-construction-mistakes-and-how-to-prevent' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'build to roof project, project planning, construction planning, build stages, house construction plan', updated_at = now()
WHERE slug = 'how-to-plan-your-build-to-roof-project' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'tile maintenance, cleaning tiles, grout care, sealing schedule, tile upkeep', updated_at = now()
WHERE slug = 'tile-maintenance-cleaning-sealing-grout-care' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'finishing standards, quality benchmarks, wall inspection, acceptable tolerance, finishing checklist', updated_at = now()
WHERE slug = 'finishing-quality-standards-what-to-look-for' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'exterior screeding, outdoor wall screed, weather resistant screed, exterior walls, external finish', updated_at = now()
WHERE slug = 'screeding-exterior-walls-tips-techniques' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling problems, ceiling cracks, POP repair, ceiling defects, ceiling solutions', updated_at = now()
WHERE slug = 'common-pop-ceiling-problems-and-solutions' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'bathroom tiling, waterproofing membrane, wet area tiling, shower waterproofing, best practices', updated_at = now()
WHERE slug = 'how-to-tile-bathroom-waterproofing-best-practices' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'POP ceiling lighting, cove lighting, recessed lights, ceiling lights, LED ceiling design', updated_at = now()
WHERE slug = 'pop-ceiling-lighting-integration-guide' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'smooth wall finish, wall preparation, skim coating technique, finishing tools, flawless walls', updated_at = now()
WHERE slug = 'how-to-achieve-smooth-wall-finish' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'wall finish types, skim coat vs putty, paint finishes, wall finishing options, interior finishes', updated_at = now()
WHERE slug = 'types-of-wall-finishes-skim-coat-putty-paint' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'interior vs exterior finish, exterior wall finishing, weather resistant finishes, finish selection, wall protection', updated_at = now()
WHERE slug = 'interior-vs-exterior-wall-finishing-differences' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'finishing tools, contractor tools, trowels and floats, plastering tools, tool list', updated_at = now()
WHERE slug = 'finishing-tools-every-contractor-should-own' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'build process stages, foundation construction, roofing stage, construction milestones, build to roof', updated_at = now()
WHERE slug = 'foundation-to-roof-understanding-build-process' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'wall finishing cost, finishing cost estimation, budget finishing, price per square metre, finishing materials cost', updated_at = now()
WHERE slug = 'cost-estimation-wall-finishing-projects' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'skimming vs plastering, skim coat, plastering, wall finish options, render vs skim', updated_at = now()
WHERE slug = 'skimming-vs-plastering-understanding-options' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'multi-story building, structural design, columns and beams, high-rise construction, structural engineering basics', updated_at = now()
WHERE slug = 'structural-considerations-multi-story-buildings' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'building on a budget, construction cost optimization, saving money building, cost cutting construction, budget building Nigeria', updated_at = now()
WHERE slug = 'building-on-budget-cost-optimization-strategies' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'roof types Nigeria, roofing materials, roof design, choosing a roof, roofing costs', updated_at = now()
WHERE slug = 'choosing-right-roof-type-for-your-building' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'textured finishes, texture techniques, textured walls, finishing tools, decorative finishes', updated_at = now()
WHERE slug = 'achieving-textured-finishes-techniques-tools' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'finishing defects, wall cracks, paint defects, repair wall finish, defect prevention', updated_at = now()
WHERE slug = 'common-finishing-defects-and-how-to-fix' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'finish selection, surface appropriate finishes, matching finishes, finish durability, interior surfaces', updated_at = now()
WHERE slug = 'choosing-right-finish-different-surfaces' AND status = 'published' AND meta_keywords IS NULL;

UPDATE learn_articles SET meta_keywords = 'construction timeline, building duration Nigeria, how long to build a house, construction schedule, project timeline', updated_at = now()
WHERE slug = 'construction-timeline-how-long-each-phase-takes' AND status = 'published' AND meta_keywords IS NULL;

