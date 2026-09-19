// =========================================================
// ARCHIE SEMANTIC KNOWLEDGE GRAPH — TEST FIXTURE GENERATOR
//
// Extracts REAL lexical data for the graph test vocabulary
// from the production lexicon (spec §20: context tests for
// bank/run/light/plant/scale/charge/field/point/file/bat,
// plus the cement→building-material hierarchy for multi-hop
// and tree tests). Mirrors scripts/lexicon/generate-test-fixtures.ts:
//
//   npx tsx scripts/semantic-graph/generate-test-fixtures.ts
//
// Requires SUPABASE_SERVICE_ROLE_KEY (management token) in the
// environment. Output: supabase/functions/_shared/semantic-graph/
// __fixtures__/lexicon-for-graph.json — never hand-written
// expectations about the data.
// =========================================================

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "hqhvlkunkdrxyuvziorm";
const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!TOKEN) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY (management token)");
  process.exit(1);
}

const TERMS = [
  // spec §20 ambiguity set
  "bank",
  "run",
  "light",
  "plant",
  "scale",
  "charge",
  "field",
  "point",
  "file",
  "bat",
  // cement chain + construction concepts (spec §§9, 14)
  "cement",
  "concrete",
  "mortar",
  "sand",
  "aggregate",
  "building material",
  "portland cement",
  "plaster",
  // context words used by the tests
  "mortgage",
  "river",
  "house",
  "program",
  "deposit",
];

async function runSql(sql: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SQL failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as Record<string, unknown>[];
}

async function main() {
  const termList = TERMS.map((t) => `'${t}'`).join(",");

  // 1) seed words (all senses, VERIFIED)
  const seedSenses = await runSql(`
    SELECT w.id AS word_id, w.canonical, w.normalized, w.part_of_speech,
           w.unit_type, w.language, w.frequency,
           s.id AS sense_id, s.external_id, s.synset_key, s.definition,
           s.domain, s.register, s.region, s.source_id, s.knowledge_status
    FROM lexicon_words w
    JOIN lexicon_senses s ON s.word_id = w.id
    WHERE w.normalized IN (${termList}) AND w.language = 'en'
      AND s.knowledge_status = 'VERIFIED'
    ORDER BY w.canonical, s.external_id`);

  const synsets0 = [...new Set(seedSenses.map((r) => String(r.synset_key)))];

  // 2) hypernym^3 up + hyponym^1 down from the seed synsets
  const synList = synsets0.map((s) => `'${s}'`).join(",");
  const chain = await runSql(`
    WITH RECURSIVE up AS (
      SELECT r.from_synset_key AS k, r.to_synset_key AS nxt, 1 AS depth
      FROM lexicon_relationships r
      WHERE r.relation_type = 'HYPERNYM' AND r.from_synset_key IN (${synList})
      UNION
      SELECT u.nxt, r.to_synset_key, u.depth + 1
      FROM up u
      JOIN lexicon_relationships r
        ON r.relation_type = 'HYPERNYM' AND r.from_synset_key = u.nxt
      WHERE u.depth < 3
    ), down AS (
      SELECT r.to_synset_key AS k, 0 AS depth
      FROM lexicon_relationships r
      WHERE r.relation_type = 'HYPONYM' AND r.from_synset_key IN (${synList})
    ), chain AS (SELECT k FROM up UNION SELECT k FROM down)
    SELECT s.id AS sense_id, s.external_id, s.synset_key, s.definition,
           s.domain, s.source_id, w.canonical, w.part_of_speech, w.frequency
    FROM chain c
    JOIN lexicon_senses s ON s.synset_key = c.k AND s.knowledge_status = 'VERIFIED'
    JOIN lexicon_words w ON w.id = s.word_id
    ORDER BY s.synset_key, s.external_id`);

  const allSynsetKeys = [
    ...new Set([...synsets0, ...chain.map((r) => String(r.synset_key))]),
  ];
  const allSenseIds = [
    ...new Set([
      ...seedSenses.map((r) => String(r.external_id)),
      ...chain.map((r) => String(r.external_id)),
    ]),
  ];

  const allSynList = allSynsetKeys.map((s) => `'${s}'`).join(",");
  const allSenseList = allSenseIds
    .map((s) => `'${s.replace(/'/g, "''")}'`)
    .join(",");

  // 3) synset relations among fixture synsets
  const synsetRelations = await runSql(`
    SELECT relation_type, from_synset_key, to_synset_key
    FROM lexicon_relationships
    WHERE from_synset_key IN (${allSynList}) AND to_synset_key IN (${allSynList})
    ORDER BY relation_type, from_synset_key, to_synset_key`);

  // 4) sense relations among fixture senses
  const senseRelations = await runSql(`
    SELECT relation_type, from_sense_external_id, to_sense_external_id
    FROM lexicon_sense_relations
    WHERE from_sense_external_id IN (${allSenseList})
      AND to_sense_external_id IN (${allSenseList})
    ORDER BY relation_type, from_sense_external_id, to_sense_external_id`);

  // 5) all words for the chain senses (full word rows)
  const wordIds = [...new Set(seedSenses.map((r) => String(r.word_id)))];
  const chainWordIds = await runSql(`
    SELECT DISTINCT s.word_id FROM lexicon_senses s
    WHERE s.synset_key IN (${allSynList}) AND s.knowledge_status = 'VERIFIED'`);
  for (const r of chainWordIds) wordIds.push(String(r.word_id));
  const wordIdList = [...new Set(wordIds)].map((w) => `'${w}'`).join(",");
  const words = await runSql(`
    SELECT id, canonical, normalized, spelling_variants, language,
           regional_usage, pronunciation, part_of_speech, unit_type,
           inflection_metadata, frequency
    FROM lexicon_words WHERE id IN (${wordIdList})
    ORDER BY canonical, part_of_speech`);

  // 6) every sense of the fixture words (VERIFIED) for the
  //    full-turn ground truth (context scoring needs the
  //    context words' senses too)
  const senses = await runSql(`
    SELECT s.id, s.word_id, s.external_id, s.synset_key, s.definition,
           s.usage_examples, s.domain, s.register, s.region,
           s.grammatical, s.confidence, s.source_id, s.knowledge_status, s.version
    FROM lexicon_senses s
    WHERE s.knowledge_status = 'VERIFIED'
      AND (s.synset_key IN (${allSynList})
           OR s.word_id IN (
             SELECT id FROM lexicon_words
             WHERE normalized IN (${termList}) AND language = 'en'))
    ORDER BY s.external_id`);

  const sourceRows = await runSql(
    `SELECT id, name, dataset, version, license, attribution, url FROM lexicon_sources`,
  );

  const fixture = {
    generated_at: new Date().toISOString(),
    source: sourceRows[0],
    words,
    senses,
    synsetRelations,
    senseRelations,
  };

  const out =
    "supabase/functions/_shared/semantic-graph/__fixtures__/lexicon-for-graph.json";
  const fs = await import("node:fs");
  fs.mkdirSync(out.slice(0, out.lastIndexOf("/")), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(fixture, null, 1) + "\n");

  console.log(
    `fixture written: ${out}\n  words: ${words.length}\n  senses: ${senses.length}\n` +
      `  synsets: ${allSynsetKeys.length}\n  synset relations: ${synsetRelations.length}\n` +
      `  sense relations: ${senseRelations.length}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
