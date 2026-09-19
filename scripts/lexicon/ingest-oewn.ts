// =========================================================
// ARCHIE UNIVERSAL LEXICON ENGINE — OEWN INGESTION PIPELINE
//
// Repeatable, idempotent ingestion of Open English WordNet
// (CC BY 4.0 + Princeton WordNet attribution) into the lexicon
// tables over the Supabase Management SQL API. The dataset is
// the official OEWN release json format — build it verbatim
// from an OEWN repository checkout with
// scripts/lexicon/build-oewn-dataset.py.
//
//   npx tsx scripts/lexicon/ingest-oewn.ts --dataset-dir /tmp/oewn
//
// Properties:
//   * deterministic UUIDs → re-runs update/insert safely,
//     never duplicate (ON CONFLICT DO NOTHING)
//   * rejected/malformed records are counted and reported,
//     never silently dropped
//   * every import is logged in lexicon_imports with real
//     counts from RETURNING rows — never estimated
//   * adaptive batch sizing: payload errors halve the batch
//     and retry (never lose data)
//
// Flags:
//   --dataset-dir DIR   extracted OEWN json dir (required-ish;
//                       default /tmp/oewn)
//   --dry-run           transform + validate + report, no writes
//   --limit N           only ingest the first N entries files (test)
//   --batch-size N      initial insert batch size (default 1000)
//   --throttle-ms N     pause between HTTP calls (default 150)
// =========================================================

import * as fs from "node:fs";
import * as path from "node:path";
import {
  transformOewn,
  OEWN_SOURCE,
  uuidV5,
  type OewnEntriesFile,
  type OewnSynsetFile,
} from "../../supabase/functions/_shared/lexicon/transform";

// ---------- CLI ----------
const args = process.argv.slice(2);
function arg(name: string, def?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}
const DATASET_DIR = arg("dataset-dir", "/tmp/oewn")!;
const DRY_RUN = args.includes("--dry-run");
const LIMIT = arg("limit") ? parseInt(arg("limit")!) : Infinity;
const START_BATCH = parseInt(arg("batch-size", "1000")!);
const THROTTLE_MS = parseInt(arg("throttle-ms", "150")!);

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "hqhvlkunkdrxyuvziorm";
const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!TOKEN) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY (management token)");
  process.exit(1);
}

// ---------- SQL helpers ----------

function sqlLit(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "object")
    return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function runSql(sql: string): Promise<unknown[]> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (
    !res.ok ||
    (Array.isArray(parsed) === false &&
      typeof parsed === "object" &&
      parsed &&
      "error" in (parsed as object))
  ) {
    const err = parsed as { error?: { message?: string } | string };
    throw new Error(
      `SQL error: ${typeof err.error === "string" ? err.error : (err.error?.message ?? text.slice(0, 200))}`,
    );
  }
  return Array.isArray(parsed) ? (parsed as unknown[]) : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Insert rows in batches with ON CONFLICT DO NOTHING.
 * Adaptive: on payload/size errors, halve the batch and retry.
 * Returns { inserted, duplicates } — counted from RETURNING rows.
 */
async function insertBatched(
  table: string,
  columns: string[],
  rows: Array<Array<unknown>>,
  conflictCols: string[],
  batchSize: number,
  counters: { inserted: number; duplicates: number },
): Promise<void> {
  let size = batchSize;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const values = chunk
      .map((r) => `(${r.map((c) => sqlLit(c)).join(",")})`)
      .join(",");
    const sql =
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values} ` +
      `ON CONFLICT (${conflictCols.join(",")}) DO NOTHING RETURNING 1;`;
    try {
      const out = await runSql(sql);
      counters.inserted += out.length;
      counters.duplicates += chunk.length - out.length;
    } catch (e) {
      if (size > 50) {
        // adaptive halving — retry the same chunk smaller
        size = Math.floor(size / 2);
        i -= size; // re-process this chunk
        console.log(`  [${table}] payload error → batch size now ${size}`);
        continue;
      }
      throw e;
    }
    await sleep(THROTTLE_MS);
    if (((i / size) | 0) % 20 === 0 && i > 0) {
      console.log(`  [${table}] ${i}/${rows.length} rows…`);
    }
  }
}

// ---------- Load dataset ----------

function loadJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

console.log(
  `ARCHIE lexicon ingestion — dataset dir: ${DATASET_DIR}${DRY_RUN ? " (DRY RUN)" : ""}`,
);

const allFiles = fs.readdirSync(DATASET_DIR).filter((f) => f.endsWith(".json"));
const entryFiles = allFiles.filter((f) => f.startsWith("entries-")).sort();
const synsetFiles = allFiles.filter(
  (f) => !f.startsWith("entries-") && f !== "frames.json",
);
if (!entryFiles.length) {
  console.error("No entries-*.json files found");
  process.exit(1);
}
console.log(
  `Found ${entryFiles.length} entry files, ${synsetFiles.length} synset files`,
);

// synset data (shared across entry files)
const synsets: Record<string, OewnSynsetFile> = {};
for (const f of synsetFiles) {
  synsets[f.replace(".json", "")] = loadJson(
    path.join(DATASET_DIR, f),
  ) as OewnSynsetFile;
}

const sourceId = uuidV5(`source|${OEWN_SOURCE.dataset}|${OEWN_SOURCE.version}`);

type Totals = {
  words: number;
  senses: number;
  synsetRelations: number;
  senseRelations: number;
  wordsInserted: number;
  sensesInserted: number;
  synRelInserted: number;
  senseRelInserted: number;
  rejected: Array<{ key: string; reason: string }>;
  entryFiles: number;
};
const totals: Totals = {
  words: 0,
  senses: 0,
  synsetRelations: 0,
  senseRelations: 0,
  wordsInserted: 0,
  sensesInserted: 0,
  synRelInserted: 0,
  senseRelInserted: 0,
  rejected: [],
  entryFiles: 0,
};

// Synset relations are the same for every entry-file pass →
// collect from the FIRST pass only (they live in synset files).
let synsetRelationsRows: Array<Array<unknown>> | null = null;

const t0 = Date.now();

// ---------- Dry-run / import ----------

if (DRY_RUN) {
  for (const f of entryFiles) {
    const entries = loadJson(path.join(DATASET_DIR, f)) as OewnEntriesFile;
    const r = transformOewn(entries, synsets);
    totals.words += r.words.length;
    totals.senses += r.senses.length;
    totals.rejected.push(...r.rejected);
    totals.entryFiles++;
  }
  // count synset relations once
  const r0 = transformOewn({} as OewnEntriesFile, synsets);
  totals.synsetRelations += r0.synsetRelations.length;
  totals.senseRelations += r0.senseRelations.length;
  console.log(`DRY RUN RESULTS:
  entry files:    ${totals.entryFiles}
  words:          ${totals.words}
  senses:         ${totals.senses}
  synset rels:    ${totals.synsetRelations}
  sense rels:     (counted per entry file — see full run)
  rejected:       ${totals.rejected.length}`);
  if (totals.rejected.length) {
    console.log("  sample rejections:", totals.rejected.slice(0, 5));
  }
  process.exit(0);
}

// Upsert the source (provenance is mandatory)
await runSql(
  `INSERT INTO lexicon_sources (id, name, dataset, version, license, attribution, url, imported_at, notes)
   VALUES (${sqlLit(sourceId)}, ${sqlLit(OEWN_SOURCE.name)}, ${sqlLit(OEWN_SOURCE.dataset)}, ${sqlLit(OEWN_SOURCE.version)}, ${sqlLit(OEWN_SOURCE.license)}, ${sqlLit(OEWN_SOURCE.attribution)}, ${sqlLit(OEWN_SOURCE.url)}, now(), 'Open English WordNet 2026 development snapshot (main branch commit bff3181f, 2026-08-26; no proper nouns — those live in Open English Namenet)')
   ON CONFLICT (dataset, version) DO UPDATE SET imported_at = now();`,
);
console.log("✓ source registered (CC BY 4.0 + Princeton WordNet attribution)");

// Record the import (RUNNING)
const importId = uuidV5(`import|${OEWN_SOURCE.version}|${Date.now()}`);
await runSql(
  `INSERT INTO lexicon_imports (id, source_id, status, stats)
   VALUES (${sqlLit(importId)}, ${sqlLit(sourceId)}, 'RUNNING', ${sqlLit({ started: new Date().toISOString() })}::jsonb)
   ON CONFLICT DO NOTHING;`,
);

let status = "SUCCESS";
let lastError: string | null = null;

try {
  for (const f of entryFiles.slice(0, LIMIT)) {
    console.log(`— ${f}`);
    const entries = loadJson(path.join(DATASET_DIR, f)) as OewnEntriesFile;
    const r = transformOewn(entries, synsets);
    totals.entryFiles++;
    totals.words += r.words.length;
    totals.senses += r.senses.length;
    totals.rejected.push(...r.rejected);

    // words (deterministic ids make re-runs safe)
    const wordRows = r.words.map((w) => [
      w.id,
      w.canonical,
      w.normalized,
      w.spelling_variants,
      w.language,
      w.regional_usage,
      w.pronunciation,
      w.part_of_speech,
      w.unit_type,
      w.inflection_metadata,
      w.frequency,
      w.metadata,
    ]);
    const wCounters = { inserted: 0, duplicates: 0 };
    await insertBatched(
      "lexicon_words",
      [
        "id",
        "canonical",
        "normalized",
        "spelling_variants",
        "language",
        "regional_usage",
        "pronunciation",
        "part_of_speech",
        "unit_type",
        "inflection_metadata",
        "frequency",
        "metadata",
      ],
      wordRows,
      ["id"],
      START_BATCH,
      wCounters,
    );
    totals.wordsInserted += wCounters.inserted;

    // senses (external_id unique — dedupes across files)
    const senseRows = r.senses.map((s) => [
      s.id,
      s.word_id,
      sqlLit(sourceId) === "NULL" ? null : sourceId,
      s.external_id,
      s.synset_key,
      s.definition,
      s.usage_examples,
      s.domain,
      s.register,
      s.region,
      s.grammatical,
      s.confidence,
      s.knowledge_status,
    ]);
    const sCounters = { inserted: 0, duplicates: 0 };
    await insertBatched(
      "lexicon_senses",
      [
        "id",
        "word_id",
        "source_id",
        "external_id",
        "synset_key",
        "definition",
        "usage_examples",
        "domain",
        "register",
        "region",
        "grammatical",
        "confidence",
        "knowledge_status",
      ],
      senseRows,
      ["id"],
      START_BATCH,
      sCounters,
    );
    totals.sensesInserted += sCounters.inserted;

    // sense relations
    const srelRows = r.senseRelations.map((rel) => [
      uuidV5(
        `senserel|${rel.relation_type}|${rel.from_sense_external_id}|${rel.to_sense_external_id}`,
      ),
      rel.relation_type,
      rel.from_sense_external_id,
      rel.to_sense_external_id,
      sourceId,
    ]);
    totals.senseRelations += r.senseRelations.length;
    const srCounters = { inserted: 0, duplicates: 0 };
    await insertBatched(
      "lexicon_sense_relations",
      [
        "id",
        "relation_type",
        "from_sense_external_id",
        "to_sense_external_id",
        "source_id",
      ],
      srelRows,
      ["id"],
      START_BATCH,
      srCounters,
    );
    totals.senseRelInserted += srCounters.inserted;

    // synset relations: same data every pass — insert once (first file)
    if (!synsetRelationsRows) {
      synsetRelationsRows = r.synsetRelations.map((rel) => [
        uuidV5(
          `synrel|${rel.relation_type}|${rel.from_synset_key}|${rel.to_synset_key}`,
        ),
        rel.relation_type,
        rel.from_synset_key,
        rel.to_synset_key,
        sourceId,
      ]);
      totals.synsetRelations += synsetRelationsRows.length;
      const synCounters = { inserted: 0, duplicates: 0 };
      await insertBatched(
        "lexicon_relationships",
        [
          "id",
          "relation_type",
          "from_synset_key",
          "to_synset_key",
          "source_id",
        ],
        synsetRelationsRows,
        ["id"],
        START_BATCH,
        synCounters,
      );
      totals.synRelInserted += synCounters.inserted;
    }
  }
} catch (e) {
  status = "PARTIAL";
  lastError = e instanceof Error ? e.message : String(e);
  console.error("INGESTION ERROR:", lastError);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const stats = {
  elapsed_seconds: Number(elapsed),
  entry_files: totals.entryFiles,
  words_total: totals.words,
  words_inserted: totals.wordsInserted,
  words_duplicates: totals.words - totals.wordsInserted,
  senses_total: totals.senses,
  senses_inserted: totals.sensesInserted,
  senses_duplicates: totals.senses - totals.sensesInserted,
  synset_relations_total: totals.synsetRelations,
  synset_relations_inserted: totals.synRelInserted,
  sense_relations_total: totals.senseRelations,
  sense_relations_inserted: totals.senseRelInserted,
  rejected_records: totals.rejected.length,
};

// Close the import log (honest counts, real errors)
await runSql(
  `UPDATE lexicon_imports
   SET status = ${sqlLit(status)}, finished_at = now(),
       stats = ${sqlLit(stats)}::jsonb,
       errors = ${sqlLit(lastError ? [{ error: lastError }] : totals.rejected.slice(0, 100))}::jsonb
   WHERE id = ${sqlLit(importId)};`,
);

console.log(`IMPORT ${status} (${elapsed}s):
  entry files:            ${totals.entryFiles}/${entryFiles.length}
  words:                  ${totals.wordsInserted} inserted (${stats.words_duplicates} duplicates skipped)
  senses:                 ${totals.sensesInserted} inserted (${stats.senses_duplicates} duplicates skipped)
  synset relationships:   ${totals.synRelInserted} inserted
  sense relationships:     ${totals.senseRelInserted} inserted
  rejected records:        ${totals.rejected.length}`);
if (lastError) console.log("  last error:", lastError.slice(0, 300));
if (totals.rejected.length) {
  console.log("  sample rejections:", totals.rejected.slice(0, 3));
}
process.exit(status === "SUCCESS" ? 0 : 2);
