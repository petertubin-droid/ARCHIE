// =========================================================
// ARCHIE UNIVERSAL LEXICON ENGINE — PRUNING & COMPACTION CLI
//
// Prunes unverified, low-confidence, and low-frequency long-tail
// lexicon data from the database to eliminate table bloat while
// preserving:
//   1. High-frequency curated vocabulary
//   2. Verified operational domain senses (construction,
//      engineering, computing, cybersecurity, finance)
//   3. Owner-asserted / USER_PROVIDED custom vocabulary
//   4. Validated relational edges
//
// Usage:
//   npx tsx scripts/lexicon/prune-lexicon.ts --dry-run
//   npx tsx scripts/lexicon/prune-lexicon.ts --min-frequency 10
//   npx tsx scripts/lexicon/prune-lexicon.ts --keep-unverified
// =========================================================

const args = process.argv.slice(2);
function arg(name: string, def?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
}

const DRY_RUN = args.includes("--dry-run");
const KEEP_UNVERIFIED = args.includes("--keep-unverified");
const MIN_FREQUENCY = parseFloat(arg("min-frequency", "5")!);

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "hqhvlkunkdrxyuvziorm";
const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_MANAGEMENT_TOKEN ?? "";
const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

interface PruneResult {
  dry_run: boolean;
  status: string;
  pruned_senses?: number;
  candidate_senses_to_prune?: number;
  pruned_sense_relations?: number;
  pruned_relationships?: number;
  pruned_words?: number;
  remaining_words?: number;
  remaining_senses?: number;
  current_total_words?: number;
  current_total_senses?: number;
}

async function runPrune() {
  console.log("=========================================================");
  console.log("ARCHIE Lexicon Database Compaction & Long-Tail Pruning");
  console.log("=========================================================");
  console.log(`Mode:            ${DRY_RUN ? "DRY-RUN (audit only, no deletes)" : "EXECUTE (deletions committed)"}`);
  console.log(`Min Frequency:   ${MIN_FREQUENCY}`);
  console.log(`Prune Unverified:${!KEEP_UNVERIFIED}`);
  console.log(`Project Ref:     ${PROJECT_REF}`);
  console.log("---------------------------------------------------------");

  if (!TOKEN) {
    console.warn("Notice: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_MANAGEMENT_TOKEN is not set.");
    console.log("To execute against remote Supabase, set SUPABASE_SERVICE_ROLE_KEY.");
    console.log("Printing generated maintenance SQL query instead:\n");
    const sql = `SELECT public.prune_lexicon_long_tail(${MIN_FREQUENCY}, ${DRY_RUN}, ${!KEEP_UNVERIFIED});`;
    console.log(sql);
    console.log("\nRun this query directly in the Supabase SQL Editor to execute.");
    return;
  }

  const sql = `SELECT public.prune_lexicon_long_tail(${MIN_FREQUENCY}, ${DRY_RUN}, ${!KEEP_UNVERIFIED}) AS result;`;

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`HTTP Error ${res.status}: ${errText}`);
      process.exit(1);
    }

    const data = (await res.json()) as Array<{ result: PruneResult }>;
    const result = data[0]?.result;

    if (!result) {
      console.error("Unexpected empty result from pruning function.");
      process.exit(1);
    }

    console.log("Pruning Outcome:");
    console.log(JSON.stringify(result, null, 2));

    if (DRY_RUN) {
      console.log(`\nAudit Summary: ${result.candidate_senses_to_prune ?? 0} candidate senses eligible for compaction.`);
    } else {
      console.log(`\nCompaction Summary:`);
      console.log(`  - Senses pruned:          ${result.pruned_senses ?? 0}`);
      console.log(`  - Sense relations pruned: ${result.pruned_sense_relations ?? 0}`);
      console.log(`  - Relationships pruned:   ${result.pruned_relationships ?? 0}`);
      console.log(`  - Orphaned words pruned:  ${result.pruned_words ?? 0}`);
      console.log(`  - Remaining words:        ${result.remaining_words ?? 0}`);
      console.log(`  - Remaining senses:       ${result.remaining_senses ?? 0}`);
      console.log("\nDatabase compacted successfully. Sourced core dictionary and user vocabulary preserved.");
    }
  } catch (err) {
    console.error("Pruning failed with exception:", err);
    process.exit(1);
  }
}

runPrune();
