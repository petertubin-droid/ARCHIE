// =========================================================
// ARCHIE NATIVE ENGINE — REASONING STRATEGIES
// supabase/functions/_shared/archie-ai/native-engine/strategies.ts
//
// The scalable reasoning framework (owner directive 2026-09-10
// §3): each reasoning mode is a first-class strategy with a
// deterministic applicability score; a meta-selector ranks
// strategies for the task and EXPLAINS its own choice.
//
// Every strategy:
//   * reasons over the real FactStore / ReasoningEngine
//   * states its assumptions
//   * reports an uncertainty band
//   * cites evidence (fact ids)
//   * NEVER promotes a hypothesis to fact
//
// Classic AI search/inference, no external model anywhere.
// =========================================================

import type { Fact, Rule } from "./types.ts";
import { FactStore } from "./knowledge.ts";
import { ReasoningEngine } from "./reasoning.ts";

export type StrategyKind =
  | "logical"
  | "analytical"
  | "mathematical"
  | "causal"
  | "comparative"
  | "probabilistic"
  | "constraint"
  | "temporal"
  | "abductive"
  | "inductive"
  | "counterfactual"
  | "consistency"
  | "hypothesis"
  | "relational"
  | "hierarchical"
  | "spatial"
  | "quantitative"
  | "planning"
  | "risk"
  | "uncertainty";

export interface Conclusion {
  statement: string;
  confidence: number;
  /** hypothesis/candidate conclusions are NEVER established
   *  facts — the status field is the honesty guarantee. */
  status: "derived" | "candidate" | "hypothesis";
  evidence: string[];
}

export type UncertaintyBand =
  "high-confidence" | "moderate" | "low" | "unknown" | "conflicting";

export interface StrategyResult {
  kind: StrategyKind;
  summary: string;
  conclusions: Conclusion[];
  assumptions: string[];
  uncertainty: UncertaintyBand;
  evidence: string[];
  explanation: string;
}

export interface ReasoningTask {
  /** The user's raw task/question text. */
  text: string;
  /** Subject entity if the task names one. */
  subject?: string;
  /** Second subject, for comparative tasks. */
  subject2?: string;
  facts: FactStore;
  reasoning: ReasoningEngine;
  rules: Rule[];
}

// ---------------------------------------------------------
// Task feature extraction (deterministic, explainable)
// ---------------------------------------------------------

const CAUSAL_CUES =
  /\b(why|cause|causes|caused|leads? to|results? in|because|effect)\b/i;
const COMPARE_CUES =
  /\b(vs\.?|versus|compare|better|worse|bigger|smaller|cheaper|difference)\b/i;
const PROB_CUES =
  /\b(likely|probability|chance|risk of|odds|probably|percent of)\b/i;
const TEMPORAL_CUES =
  /\b(when|year|date|since|until|history|timeline|past|future)\b/i;
const ABDUCTIVE_CUES = /\b(why|explain|reason|what caused|could explain)\b/i;
const HYPOTHESIS_CUES =
  /\b(hypothes|theor|maybe|perhaps|could it be|guess|suppose)\b/i;
const COUNTERFactual_CUES =
  /\bif\b[^.?!]*\b(?:had not|hadn't|remove[d]?|removed|didn't|stop(?:ped)?|change[d]?)\b|\bwithout\b|\bsuppose\b/i;
const CONSISTENCY_CUES =
  /\b(consistent|contradict|conflict|disagree|both true)\b/i;
const INDUCTIVE_CUES = /\b(pattern|generally|usually|always|trend|across)\b/i;
const MATH_CUES = /[\d]/;
const CONSTRAINT_CUES =
  /\b(at least|at most|no more than|between|minimum|maximum|limit|budget|under)\b/i;
const LOGIC_CUES =
  /\b(therefore|if .*(then|,)|follows|deduce|implies|all|every)\b/i;

// ---------------------------------------------------------
// Structural feasibility (audit re-assessment 2026-09-13,
// gap 2): strategy selection is no longer purely lexical. Each
// strategy gets a deterministic FEASIBILITY score computed from
// what the task's store, rules, and two-subject structure
// actually support. Two effects, both honest:
//   1. A paraphrase with NO cue words still reaches the
//      strategy whose evidence structure exists — e.g. two
//      comparison subjects both present in the store select
//      comparative without "compare"/"vs" ever appearing.
//   2. Selection order reflects evidence: a cued strategy
//      keeps its cue score (its honest insufficient-evidence
//      verdict is unchanged), and structure adds rank.
// Probes are deterministic store/text inspections — nothing
// fabricated, every bump carries a human-readable note.
// ---------------------------------------------------------
const TEMPORAL_FACT_CUES =
  /^(?:observed|recorded|became|changed|started|finished|installed|completed|since|until|observed-at|year|date)/i;
const CAUSAL_FACT_CUES = /(?:caus|effect|leads? to|results? in)/i;

/** True when the store holds at least one fact touching the
 *  given name (subject or object side, case-insensitive). */
function storeMentions(store: FactStore, name: string): boolean {
  const n = name.toLowerCase();
  return store
    .list()
    .some(
      (f) =>
        f.subject.toLowerCase().includes(n) ||
        String(f.object).toLowerCase().includes(n),
    );
}

export function structuralFeasibility(task: ReasoningTask): Array<{
  kind: StrategyKind;
  score: number;
  note: string;
}> {
  const facts = task.facts.list();
  const notes: Array<{ kind: StrategyKind; score: number; note: string }> = [];

  const push = (kind: StrategyKind, score: number, note: string) => {
    if (score > 0) notes.push({ kind, score, note });
  };

  // comparative: two-subject structure, grounded in the store
  const pair =
    task.subject && task.subject2
      ? { a: task.subject, b: task.subject2 }
      : extractComparisonSubjects(task.text);
  if (pair) {
    const aKnown = storeMentions(task.facts, pair.a);
    const bKnown = storeMentions(task.facts, pair.b);
    if (aKnown && bKnown)
      push(
        "comparative",
        2,
        `store holds facts on both "${pair.a}" and "${pair.b}"`,
      );
    else
      push(
        "comparative",
        1,
        `two-subject structure ("${pair.a}" / "${pair.b}")`,
      );
  }

  // temporal: stored temporal-evidence predicates
  const temporalFacts = facts.filter((f) =>
    TEMPORAL_FACT_CUES.test(f.predicate),
  );
  if (temporalFacts.length >= 2)
    push(
      "temporal",
      2,
      `${temporalFacts.length} temporal-evidence fact(s) stored`,
    );
  else if (temporalFacts.length === 1)
    push("temporal", 1, "one temporal-evidence fact stored");

  // probabilistic: contested-claim structure
  const contested = facts.filter(
    (f) => f.confidence > 0 && f.confidence < 0.99,
  );
  if (contested.length >= 2)
    push(
      "probabilistic",
      2,
      `${contested.length} contested-claim fact(s) (confidence < 1)`,
    );
  else if (contested.length === 1)
    push("probabilistic", 1, "one contested-claim fact (confidence < 1)");

  // causal: stored causal links or causal rules
  const causalFacts = facts.filter((f) => CAUSAL_FACT_CUES.test(f.predicate));
  const causalRules = task.rules.filter((r) =>
    CAUSAL_FACT_CUES.test(r.produces.predicate),
  );
  if (causalFacts.length + causalRules.length >= 2)
    push(
      "causal",
      2,
      `${causalFacts.length + causalRules.length} causal link(s) available`,
    );
  else if (causalFacts.length + causalRules.length === 1)
    push("causal", 1, "one causal link available");

  // consistency: conflict-shaped store
  const conflictShaped = (() => {
    const seen = new Map<string, Set<string>>();
    for (const f of facts) {
      const key = `${f.subject}|${f.predicate}`;
      const vals = seen.get(key) ?? new Set<string>();
      vals.add(String(f.object));
      seen.set(key, vals);
    }
    return [...seen.values()].some((v) => v.size > 1);
  })();
  if (conflictShaped)
    push("consistency", 2, "same subject+predicate held with differing values");
  else if (facts.length >= 3)
    push("consistency", 1, `${facts.length} facts stored — checkable`);

  // inductive: shared-predicate structure
  const byPred = new Map<string, number>();
  for (const f of facts)
    byPred.set(f.predicate, (byPred.get(f.predicate) ?? 0) + 1);
  const shared = [...byPred.values()].filter((n) => n >= 2).length;
  if (shared >= 2)
    push("inductive", 2, `${shared} predicate(s) shared by multiple facts`);
  else if (shared === 1)
    push("inductive", 1, "one predicate shared by multiple facts");

  // mathematical / constraint: numeric evidence in the store
  const numericFacts = facts.filter(
    (f) => num(f.object) !== null || numericDimensions(f.object).length > 0,
  );
  if (numericFacts.length >= 2)
    push("mathematical", 2, `${numericFacts.length} numeric fact(s) stored`);
  else if (numericFacts.length === 1)
    push("mathematical", 1, "one numeric fact stored");
  if (numericFacts.length >= 1)
    push("constraint", 1, "numeric bounds evaluable from stored facts");

  return notes;
}

/** Deterministic, explainable strategy selection. */
export function selectStrategies(task: ReasoningTask): {
  chosen: StrategyKind[];
  rationale: string;
  scores: Array<{ kind: StrategyKind; score: number; cue: string }>;
} {
  const t = task.text;
  const scores: Array<{ kind: StrategyKind; score: number; cue: string }> = [];

  const bump = (kind: StrategyKind, score: number, cue: string) =>
    scores.push({ kind, score, cue });

  if (LOGIC_CUES.test(t)) bump("logical", 3, "logical connective in task");
  if (CAUSAL_CUES.test(t)) bump("causal", 3, "causal question");
  if (COMPARE_CUES.test(t)) bump("comparative", 3, "comparison requested");
  if (PROB_CUES.test(t))
    bump("probabilistic", 3, "probability/likelihood language");
  if (TEMPORAL_CUES.test(t)) bump("temporal", 2, "temporal reference");
  if (ABDUCTIVE_CUES.test(t)) bump("abductive", 3, "explanation requested");
  if (HYPOTHESIS_CUES.test(t)) bump("hypothesis", 3, "hypothesis language");
  if (COUNTERFactual_CUES.test(t))
    bump("counterfactual", 3, "counterfactual premise");
  if (CONSISTENCY_CUES.test(t))
    bump("consistency", 3, "consistency check requested");
  if (INDUCTIVE_CUES.test(t))
    bump("inductive", 2, "pattern generalization requested");
  if (MATH_CUES.test(t) && /\d/.test(t))
    bump("mathematical", 2, "numeric content");
  if (CONSTRAINT_CUES.test(t))
    bump("constraint", 3, "constraint/bound language");
  if (task.facts.list().length === 0)
    bump("consistency", 0, "empty store — nothing to check");

  // Audit re-assessment gap 2: STRUCTURE joins lexical cues.
  // Feasibility probes add rank to cued strategies and can
  // SELECT a strategy outright when its evidence structure is
  // strong (score >= 2) even with no cue words at all.
  const structure = structuralFeasibility(task);
  for (const f of structure) {
    const existing = scores.find((s) => s.kind === f.kind);
    if (existing) existing.score += f.score;
    else if (f.score >= 2) bump(f.kind, f.score, `structure: ${f.note}`);
  }

  // Nothing matched: honest fallback is logic over the store.
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const matched = ranked
    .filter((r) => r.score > 0)
    .slice(0, 2)
    .map((r) => r.kind);
  const chosen: StrategyKind[] =
    matched.length > 0 ? matched : (["logical"] as StrategyKind[]);

  const rationale =
    matched.length === 0
      ? "No task cues detected — defaulting to logical reasoning over the knowledge store (honest fallback)."
      : `Selected ${chosen.join(", ")}: ${ranked
          .filter((r) => chosen.includes(r.kind))
          .map((r) => r.cue)
          .join("; ")}.`;

  return {
    chosen,
    rationale,
    scores: ranked,
  };
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function band(confidence: number, conflicts: boolean): UncertaintyBand {
  if (conflicts) return "conflicting";
  if (confidence >= 0.75) return "high-confidence";
  if (confidence >= 0.5) return "moderate";
  if (confidence > 0) return "low";
  return "unknown";
}

function evidenceWeight(f: Fact): number {
  switch (f.provenance.source) {
    case "seed":
      return 0.9;
    case "inferred":
      return 0.75;
    case "owner-taught":
      return 0.6;
    case "web-research":
      return 0.5;
    default:
      return 0.4;
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.match(/-?\d+(\.\d+)?/);
    if (m) return parseFloat(m[0]);
  }
  return null;
}

/** Numeric fields inside object-valued facts (plan P5 Batch C):
 *  stored objects like { price: 9200, unit: "bag" } carry
 *  comparable numeric DIMENSIONS — extract them so comparisons
 *  work on real stored evidence, not just scalar facts. */
function numericDimensions(
  v: unknown,
): Array<{ field: string; value: number }> {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const out: Array<{ field: string; value: number }> = [];
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = num(val);
      if (n !== null) out.push({ field: k, value: n });
    }
    return out;
  }
  return [];
}

/** Extract the two subjects of a comparison request (plan
 *  P5 Batch C): "compare granite vs sand", "difference between
 *  X and Y", "which is cheaper, X or Y". Returns null when the
 *  sentence is not a two-subject comparison. */
export function extractComparisonSubjects(
  text: string,
): { a: string; b: string } | null {
  const tail = "(?:\\s+(?:in|for|on|at|by)\\b|[.?!]|$)";
  const patterns = [
    new RegExp(
      `compare\\s+([a-z0-9\\- ]+?)\\s+(?:and|with|vs\\.?|versus|to)\\s+([a-z0-9\\- ]+?)${tail}`,
      "i",
    ),
    new RegExp(
      `difference between\\s+([a-z0-9\\- ]+?)\\s+and\\s+([a-z0-9\\- ]+?)${tail}`,
      "i",
    ),
    new RegExp(
      `([a-z0-9\\- ]+?)\\s+(?:vs\\.?|versus)\\s+([a-z0-9\\- ]+?)${tail}`,
      "i",
    ),
    new RegExp(
      `which is (?:cheaper|better|bigger|smaller|stronger|more expensive|more durable)\\s*,?\\s*(?:between\\s+)?([a-z0-9\\- ]+?)\\s+or\\s+([a-z0-9\\- ]+?)${tail}`,
      "i",
    ),
    // Re-assessment gap 2 (2026-09-13): choice questions that
    // carry NO comparison cue words ("should I use granite or
    // sand for my driveway?") still carry two-subject CHOICE
    // structure. Restricted to question-shaped text (must end
    // in "?") so declarative "or" sentences are never misread.
    new RegExp(
      `([a-z0-9][a-z0-9\\- ]*?)\\s+or\\s+([a-z0-9][a-z0-9\\- ]*?)(?:\\s+(?:in|for|on|at|by)\\b[a-z0-9\\- ]*)?\\?\\s*$`,
      "i",
    ),
  ];
  const strip = (x: string) =>
    x
      .trim()
      .replace(/\s+(?:prices?|costs?|cost|rates?)$/i, "")
      .replace(/^(?:the|my)\s+/i, "");
  // Leading filler words before a choice subject ("should I use
  // granite", "would you pick sand") are stripped deterministically.
  const FILLER_LEAD =
    /^(?:should|could|would|will|i|we|you|use|is|are|do|does|did|which|what|pick|choose|need|want|get|buy|prefer|to|a|an|the|my|me)\b\s*/i;
  const stripLead = (x: string) => {
    let out = x.trim();
    while (FILLER_LEAD.test(out)) out = out.replace(FILLER_LEAD, "").trim();
    return out;
  };
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const a = stripLead(strip(m[1]));
      const b = stripLead(strip(m[2]));
      if (a && b && a.toLowerCase() !== b.toLowerCase()) return { a, b };
    }
  }
  return null;
}

// ---------------------------------------------------------
// Strategies (each: real inference, assumptions, honesty)
// ---------------------------------------------------------

/** DEDUCTIVE: forward-chain the store; report derivations
 *  plus any proof found for the task's subject claims. */
export async function deductive(task: ReasoningTask): Promise<StrategyResult> {
  const before = new Set(task.facts.list().map((f) => f.id));
  const out = await task.reasoning.forwardChain();
  const newFacts = out.explanations
    .map((e) => task.facts.get(e.derivedFactId)!)
    .filter((f) => f && !before.has(f.id));
  return {
    kind: "logical",
    summary:
      newFacts.length === 0
        ? "No new derivations — knowledge already saturated."
        : `Derived ${newFacts.length} new fact(s) by rule application.`,
    conclusions: newFacts.map((f) => ({
      statement: `${f.subject} ${f.predicate} ${String(f.object)}`,
      confidence: f.confidence,
      status: "derived" as const,
      evidence: (f.provenance.derivation?.premiseIds ?? []).map((id) => id),
    })),
    assumptions: ["All premises used by rules are trustworthy as stored."],
    uncertainty:
      newFacts.length === 0
        ? "unknown"
        : band(Math.min(1, ...newFacts.map((f) => f.confidence)), false),
    evidence: newFacts.flatMap(
      (f) => f.provenance.derivation?.premiseIds ?? [],
    ),
    explanation:
      newFacts
        .map(
          (f) =>
            `${f.subject} ${f.predicate} ${String(f.object)} ← rule ${f.provenance.derivation?.ruleId}`,
        )
        .join("; ") || "Store already closed under the rule set.",
  };
}

/** CAUSAL: follow "causes" edges (transitive closure over the
 *  causal graph, breadth-first, cycle-safe). */
export function causal(task: ReasoningTask): StrategyResult {
  const subject = task.subject ?? "";
  const edges = task.facts.query({ predicate: "causes" });
  const graph = new Map<
    string,
    Array<{ to: string; conf: number; id: string }>
  >();
  for (const e of edges) {
    const to = String(e.object);
    if (!graph.has(e.subject)) graph.set(e.subject, []);
    graph.get(e.subject)!.push({ to, conf: e.confidence, id: e.id });
  }
  const chains: Array<{ path: string[]; confidence: number; ids: string[] }> =
    [];
  const seen = new Set([subject]);
  let frontier: Array<{
    node: string;
    path: string[];
    conf: number;
    ids: string[];
  }> = [{ node: subject, path: [subject], conf: 1, ids: [] }];
  while (frontier.length > 0 && chains.length < 10) {
    const next = [];
    for (const f of frontier) {
      for (const edge of graph.get(f.node) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        const path = [...f.path, edge.to];
        const conf = f.conf * edge.conf;
        const ids = [...f.ids, edge.id];
        chains.push({ path, confidence: conf, ids });
        next.push({ node: edge.to, path, conf, ids });
      }
    }
    frontier = next.slice(0, 20);
  }
  if (chains.length === 0) {
    return {
      kind: "causal",
      summary: subject
        ? `No causal chains known from "${subject}".`
        : "No causal reasoning possible — no subject identified.",
      conclusions: [],
      assumptions: subject
        ? []
        : ["No subject entity was identified in the task."],
      uncertainty: "unknown",
      evidence: [],
      explanation:
        "The knowledge store records no 'causes' edges for this subject.",
    };
  }
  return {
    kind: "causal",
    summary: `${chains.length} causal chain(s) from "${subject}".`,
    conclusions: chains.map((c) => ({
      statement: c.path.join(" → "),
      confidence: c.confidence,
      status: "derived" as const,
      evidence: c.ids,
    })),
    assumptions: ["Recorded 'causes' relations are directionally correct."],
    uncertainty: band(Math.max(...chains.map((c) => c.confidence)), false),
    evidence: chains.flatMap((c) => c.ids),
    explanation: chains
      .slice(0, 3)
      .map((c) => c.path.join(" → "))
      .join("; "),
  };
}

/** PROBABILISTIC: combine all evidence about the subject into
 *  a weighted-confidence estimate per claim; conflicts are
 *  surfaced, never averaged away. */
export function probabilistic(task: ReasoningTask): StrategyResult {
  const subject = task.subject ?? "";
  const about = task.facts.about(subject);
  const groups = new Map<string, Fact[]>();
  for (const f of about) {
    const key = f.predicate;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const conclusions: Conclusion[] = [];
  let conflicts = false;
  for (const [predicate, facts] of groups) {
    const byObject = new Map<string, Fact[]>();
    for (const f of facts) {
      const key = JSON.stringify(f.object);
      if (!byObject.has(key)) byObject.set(key, []);
      byObject.get(key)!.push(f);
    }
    if (byObject.size > 1) {
      conflicts = true;
      // POSTERIOR ESTIMATE (audit Reasoning upgrade,
      // 2026-09-13): under the evidence-weight prior, the
      // probability of each competing claim is its share of
      // total evidence weight for this subject+predicate.
      // Real math over real stored evidence — a genuine
      // posterior, not a restated confidence.
      const totalWeight = [...byObject.values()].reduce(
        (acc, group) => acc + group.reduce((a, f) => a + evidenceWeight(f), 0),
        0,
      );
      for (const [obj, group] of byObject) {
        const weighted =
          group.reduce((acc, f) => acc + f.confidence * evidenceWeight(f), 0) /
          Math.max(
            1,
            group.reduce((acc, f) => acc + evidenceWeight(f), 0),
          );
        const posterior =
          totalWeight > 0
            ? group.reduce((a, f) => a + evidenceWeight(f), 0) / totalWeight
            : 0;
        conclusions.push({
          statement: `${subject} ${predicate} ${obj} (contested — ${byObject.size} competing claims; P(claim|evidence) ≈ ${(posterior * 100).toFixed(0)}%)`,
          confidence: weighted,
          status: "candidate",
          evidence: group.map((f) => f.id),
        });
      }
      continue;
    }
    const group = [...byObject.values()][0];
    const weighted =
      group.reduce((acc, f) => acc + f.confidence * evidenceWeight(f), 0) /
      Math.max(
        1,
        group.reduce((acc, f) => acc + evidenceWeight(f), 0),
      );
    conclusions.push({
      statement: `${subject} ${predicate} ${String([...byObject.keys()][0])}`,
      confidence: weighted,
      status: group.every((f) => f.status === "validated")
        ? "derived"
        : "candidate",
      evidence: group.map((f) => f.id),
    });
  }
  const maxConf =
    conclusions.length > 0
      ? Math.max(...conclusions.map((c) => c.confidence))
      : 0;
  return {
    kind: "probabilistic",
    summary:
      about.length === 0
        ? `No stored evidence about "${subject}" — probability unknown.`
        : `Combined ${about.length} evidence item(s) about "${subject}"${conflicts ? "; conflicts detected" : ""}.`,
    conclusions,
    assumptions: [
      "Evidence weights by provenance class: seed > inferred > owner-taught > web-research.",
    ],
    uncertainty: band(maxConf, conflicts),
    evidence: about.map((f) => f.id),
    explanation: conflicts
      ? "Competing claims exist — both are reported, neither is averaged away."
      : "All evidence about this subject agrees.",
  };
}

/** CONSISTENCY: scan the whole store for SPO contradictions. */
export function consistency(task: ReasoningTask): StrategyResult {
  const facts = task.facts.list();
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    const key = `${f.subject}|${f.predicate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const conflicts: Array<{
    subject: string;
    predicate: string;
    claims: Fact[];
  }> = [];
  for (const [key, group] of groups) {
    const objects = new Set(group.map((f) => JSON.stringify(f.object)));
    if (objects.size > 1) {
      const [subject, predicate] = key.split("|");
      conflicts.push({ subject, predicate, claims: group });
    }
  }
  return {
    kind: "consistency",
    summary:
      conflicts.length === 0
        ? "Knowledge store is internally consistent."
        : `${conflicts.length} contradiction(s) found in the knowledge store.`,
    conclusions: conflicts.map((c) => ({
      statement: `${c.subject} ${c.predicate}: ${c.claims.map((f) => `${String(f.object)} (${(f.confidence * 100).toFixed(0)}%)`).join(" VS ")}`,
      confidence: Math.max(...c.claims.map((f) => f.confidence)),
      status: "candidate" as const,
      evidence: c.claims.map((f) => f.id),
    })),
    assumptions: [
      "Contradiction means same subject+predicate with different objects.",
    ],
    uncertainty: conflicts.length > 0 ? "conflicting" : "high-confidence",
    evidence: conflicts.flatMap((c) => c.claims.map((f) => f.id)),
    explanation:
      conflicts.length === 0
        ? "No two facts assert different objects for the same subject+predicate."
        : conflicts
            .map(
              (c) =>
                `${c.subject} ${c.predicate} has ${c.claims.length} competing claims`,
            )
            .join("; "),
  };
}

/** TEMPORAL: order date-bearing facts about the subject;
 *  respects validFrom/validUntil qualifiers when present. */
export function temporal(task: ReasoningTask): StrategyResult {
  const subject = task.subject ?? "";
  const facts = task.facts.about(subject).filter((f) => {
    const obj = String(f.object);
    return (
      /\d{4}/.test(obj) ||
      f.qualifiers?.validFrom !== undefined ||
      f.qualifiers?.validUntil !== undefined
    );
  });
  const dated = facts
    .map((f) => ({
      fact: f,
      when:
        (f.qualifiers?.validFrom as string | undefined) ??
        String(f.object).match(/\d{4}(-\d{2}(-\d{2})?)?/)?.[0] ??
        null,
    }))
    .filter((d) => d.when !== null)
    .sort((a, b) => String(a.when).localeCompare(String(b.when)));
  // CHANGE DETECTION (audit Reasoning upgrade, 2026-09-13):
  // ordering is not change. Group dated facts by predicate;
  // consecutive versions with DIFFERENT objects are real
  // recorded transitions — the same supersession semantics
  // as the cognitive world model, applied to fact
  // validity windows. Nothing is interpolated.
  const changes: Array<{
    predicate: string;
    from: string;
    to: string;
    when: string;
  }> = [];
  const byPredicate = new Map<string, typeof dated>();
  for (const d of dated) {
    const key = d.fact.predicate;
    if (!byPredicate.has(key)) byPredicate.set(key, []);
    byPredicate.get(key)!.push(d);
  }
  for (const versions of byPredicate.values()) {
    for (let i = 1; i < versions.length; i += 1) {
      const prev = versions[i - 1];
      const curr = versions[i];
      if (String(prev.fact.object) !== String(curr.fact.object)) {
        changes.push({
          predicate: prev.fact.predicate,
          from: String(prev.fact.object),
          to: String(curr.fact.object),
          when: String(curr.when),
        });
      }
    }
  }
  return {
    kind: "temporal",
    summary:
      dated.length === 0
        ? `No dated facts about "${subject}".`
        : `${dated.length} dated fact(s), chronologically ordered${changes.length > 0 ? `; ${changes.length} recorded change(s) detected` : ""}.`,
    conclusions: dated.map((d) => ({
      statement: `${d.when}: ${d.fact.subject} ${d.fact.predicate} ${String(d.fact.object)}`,
      confidence: d.fact.confidence,
      status: "derived" as const,
      evidence: [d.fact.id],
    })),
    assumptions: ["Dates in fact objects/qualifiers are ISO-comparable."],
    uncertainty: band(
      dated.length > 0 ? Math.min(...dated.map((d) => d.fact.confidence)) : 0,
      false,
    ),
    evidence: dated.map((d) => d.fact.id),
    explanation:
      dated.length === 0
        ? "No temporal markers found for this subject."
        : changes.length > 0
          ? `Earliest: ${String(dated[0].when)}; latest: ${String(dated[dated.length - 1].when)}. Changes: ${changes.map((c) => `${c.predicate}: ${c.from} → ${c.to} (at ${c.when})`).join("; ")}.`
          : `Earliest: ${String(dated[0].when)}; latest: ${String(dated[dated.length - 1].when)}. No recorded value changes.`,
  };
}

/** CONSTRAINT: parse explicit numeric bounds from the task and
 *  check the subject's numeric facts against them. */
export function constraint(task: ReasoningTask): StrategyResult {
  const t = task.text;
  const subject = task.subject ?? "";
  const between = t.match(
    /between\s+(\d+(?:\.\d+)?)\s*(?:and|to|-)\s*(\d+(?:\.\d+)?)/i,
  );
  const atLeast = t.match(
    /(?:at least|minimum of|no less than)\s+(\d+(?:\.\d+)?)/i,
  );
  const atMost = t.match(
    /(?:at most|maximum of|no more than|under)\s+(\d+(?:\.\d+)?)/i,
  );
  const lo = between
    ? parseFloat(between[1])
    : atLeast
      ? parseFloat(atLeast[1])
      : null;
  const hi = between
    ? parseFloat(between[2])
    : atMost
      ? parseFloat(atMost[1])
      : null;
  if (lo === null && hi === null) {
    return {
      kind: "constraint",
      summary: "No numeric constraint detected in the task.",
      conclusions: [],
      assumptions: [],
      uncertainty: "unknown",
      evidence: [],
      explanation:
        "Constraint reasoning needs an explicit bound (e.g. 'at most 500').",
    };
  }
  const numeric = task.facts
    .about(subject)
    .filter((f) => num(f.object) !== null);
  const violations: Fact[] = [];
  const satisfied: Fact[] = [];
  for (const f of numeric) {
    const v = num(f.object)!;
    if ((lo !== null && v < lo) || (hi !== null && v > hi)) violations.push(f);
    else satisfied.push(f);
  }
  return {
    kind: "constraint",
    summary:
      lo !== null && hi !== null
        ? `Constraint [${lo}, ${hi}] — ${violations.length} violation(s).`
        : `Constraint ${lo !== null ? `≥ ${lo}` : `≤ ${hi}`} — ${violations.length} violation(s).`,
    conclusions: [
      ...satisfied.map((f) => ({
        statement: `${f.subject} ${f.predicate} = ${String(f.object)} satisfies the constraint`,
        confidence: f.confidence,
        status: "derived" as const,
        evidence: [f.id],
      })),
      ...violations.map((f) => ({
        statement: `${f.subject} ${f.predicate} = ${String(f.object)} VIOLATES the constraint`,
        confidence: f.confidence,
        status: "candidate" as const,
        evidence: [f.id],
      })),
    ],
    assumptions: [
      `Parsed bound from task text: ${lo !== null ? `min=${lo}` : ""}${hi !== null ? ` max=${hi}` : ""}`,
    ],
    uncertainty: violations.length > 0 ? "conflicting" : "high-confidence",
    evidence: numeric.map((f) => f.id),
    explanation:
      violations.length === 0
        ? "All numeric facts satisfy the stated bound."
        : `${violations.map((f) => `${f.subject} ${f.predicate}=${String(f.object)}`).join(", ")} fall outside the bound.`,
  };
}

/** COMPARATIVE: two subjects on a shared predicate. */
export function comparative(task: ReasoningTask): StrategyResult {
  const a = task.subject ?? "";
  const b = task.subject2 ?? "";
  if (!a || !b) {
    return {
      kind: "comparative",
      summary: "Comparison needs two subjects.",
      conclusions: [],
      assumptions: [],
      uncertainty: "unknown",
      evidence: [],
      explanation: "No second subject identified.",
    };
  }
  const fa = task.facts.about(a);
  const fb = task.facts.about(b);
  const shared = fa.filter((x) => fb.some((y) => y.predicate === x.predicate));
  const conclusions: Conclusion[] = [];
  for (const x of shared) {
    const y = fb.find((f) => f.predicate === x.predicate)!;
    const va = num(x.object);
    const vb = num(y.object);
    if (va !== null && vb !== null) {
      const higher = va > vb ? a : b;
      conclusions.push({
        statement: `${higher} has higher ${x.predicate} (${Math.max(va, vb)} vs ${Math.min(va, vb)})`,
        confidence: Math.min(x.confidence, y.confidence),
        status: "derived",
        evidence: [x.id, y.id],
      });
      continue;
    }
    // P5 Batch C — object-valued facts: compare shared numeric
    // dimensions inside the stored objects (e.g. { price: 9200 }).
    const dimsA = numericDimensions(x.object);
    const dimsB = new Map(
      numericDimensions(y.object).map((d) => [d.field, d.value]),
    );
    let dimensionCompared = false;
    for (const da of dimsA) {
      const dbv = dimsB.get(da.field);
      if (dbv === undefined) continue;
      dimensionCompared = true;
      const lower = da.value < dbv ? a : da.value > dbv ? b : null;
      conclusions.push({
        statement:
          lower === null
            ? `${a} and ${b} tie on ${da.field} (${da.value} each, ${x.predicate})`
            : `${lower} has lower ${da.field} for ${x.predicate} (${Math.min(da.value, dbv)} vs ${Math.max(da.value, dbv)})`,
        confidence: Math.min(x.confidence, y.confidence),
        status: "derived",
        evidence: [x.id, y.id],
      });
    }
    if (!dimensionCompared) {
      conclusions.push({
        statement: `${a} ${x.predicate} ${String(x.object)}; ${b} ${y.predicate} ${String(y.object)}`,
        confidence: Math.min(x.confidence, y.confidence),
        status: "candidate",
        evidence: [x.id, y.id],
      });
    }
  }
  return {
    kind: "comparative",
    summary:
      shared.length === 0
        ? "No shared predicates between the subjects."
        : `Compared ${shared.length} shared predicate(s).`,
    conclusions,
    assumptions: ["Both subjects' facts are equally trustworthy."],
    uncertainty: band(
      conclusions.length > 0
        ? Math.max(...conclusions.map((c) => c.confidence))
        : 0,
      false,
    ),
    // evidence cites BOTH sides of every compared pair — a
    // comparison is only as honest as its weakest-sourced side.
    evidence: shared.flatMap((x) => [
      x.id,
      fb.find((f) => f.predicate === x.predicate)!.id,
    ]),
    explanation:
      conclusions.map((c) => c.statement).join("; ") ||
      "No common ground to compare on.",
  };
}

/** ABDUCTIVE: best explanation — which rules could produce
 *  the observed claim, and are their premises supported? */
export function abductive(task: ReasoningTask): StrategyResult {
  const subject = task.subject ?? "";
  // Find rules whose conclusion could explain anything about
  // the subject; rank by premise support actually present.
  const candidates: Array<{
    rule: Rule;
    support: number;
    premiseFacts: Fact[];
  }> = [];
  for (const rule of task.rules) {
    // Does the rule actually concern this subject? A variable
    // conclusion alone is NOT enough — otherwise every general
    // rule "explains" every subject. The subject must appear
    // in the conclusion or in a condition.
    const conclusion = rule.produces;
    const concernsSubject =
      conclusion.subject === subject ||
      rule.conditions.some(
        (c) => c.subject === subject || String(c.object) === subject,
      );
    if (!concernsSubject) continue;
    let support = 0;
    const premiseFacts: Fact[] = [];
    for (const cond of rule.conditions) {
      const matching = task.facts.query({
        predicate: cond.predicate,
        subject: cond.subject?.startsWith("?") ? undefined : cond.subject,
      });
      if (matching.length > 0) {
        support += 1 / rule.conditions.length;
        premiseFacts.push(matching[0]);
      }
    }
    candidates.push({ rule, support, premiseFacts });
  }
  // Causal explanations: what causes the subject?
  const causes = task.facts.query({ object: subject, predicate: "causes" });
  for (const c of causes) {
    candidates.push({
      rule: {
        id: `cause:${c.subject}`,
        conditions: [],
        produces: { subject: c.subject, predicate: "causes", object: subject },
        weight: c.confidence,
        description: `${c.subject} causes ${subject}`,
      },
      support: 1,
      premiseFacts: [c],
    });
  }
  const ranked = candidates
    .filter((c) => c.support > 0)
    .sort((x, y) => y.support * y.rule.weight - x.support * x.rule.weight)
    .slice(0, 5);
  return {
    kind: "abductive",
    summary:
      ranked.length === 0
        ? `No stored rule or cause explains "${subject}".`
        : `Best explanation(s) for "${subject}", ranked by premise support.`,
    conclusions: ranked.map((c) => ({
      statement: c.rule.description,
      confidence: c.rule.weight * c.support,
      status: "candidate",
      evidence: c.premiseFacts.map((f) => f.id),
    })),
    assumptions: [
      "Explanations are candidate causes only — never established facts.",
    ],
    uncertainty: band(
      ranked.length > 0 ? ranked[0].rule.weight * ranked[0].support : 0,
      false,
    ),
    evidence: ranked.flatMap((c) => c.premiseFacts.map((f) => f.id)),
    explanation:
      ranked
        .map(
          (c) =>
            `${c.rule.description} (support ${(c.support * 100).toFixed(0)}%)`,
        )
        .join("; ") || "No rule in the rule set accounts for this observation.",
  };
}

/** INDUCTIVE: propose generalizations from repeated validated
 *  patterns — PROPOSALS ONLY, never auto-asserted. */
export function inductive(task: ReasoningTask): StrategyResult {
  const validated = task.facts.list().filter((f) => f.status === "validated");
  const byPredicate = new Map<string, Fact[]>();
  for (const f of validated) {
    if (!byPredicate.has(f.predicate)) byPredicate.set(f.predicate, []);
    byPredicate.get(f.predicate)!.push(f);
  }
  const proposals: Array<{
    pattern: string;
    subjects: string[];
    confidence: number;
    ids: string[];
  }> = [];
  for (const [predicate, group] of byPredicate) {
    const subjects = [...new Set(group.map((f) => f.subject))];
    if (subjects.length >= 3) {
      proposals.push({
        pattern: `${subjects.length} validated subjects share "${predicate}"`,
        subjects,
        confidence: group.reduce((a, f) => a + f.confidence, 0) / group.length,
        ids: group.map((f) => f.id),
      });
    }
  }
  return {
    kind: "inductive",
    summary:
      proposals.length === 0
        ? "Not enough validated repetition to generalize (need ≥3 subjects per predicate)."
        : `${proposals.length} generalization proposal(s) — awaiting owner review.`,
    conclusions: proposals.map((p) => ({
      statement: `Generalization candidate: things with "${p.pattern.split('"')[1]}" tend to share it`,
      confidence: p.confidence,
      status: "candidate",
      evidence: p.ids,
    })),
    assumptions: [
      "Induction is fallible by nature; proposals are never auto-added to the store.",
    ],
    uncertainty: "low",
    evidence: proposals.flatMap((p) => p.ids),
    explanation:
      proposals.map((p) => p.pattern).join("; ") ||
      "Induction requires at least three validated instances of a predicate.",
  };
}

/** COUNTERFACTUAL: remove a cause and see which effects lose
 *  their only support (real intervention on the causal graph). */
export function counterfactual(task: ReasoningTask): StrategyResult {
  // Audit #5 fix (2026-09-13): the extraction regex died on
  // trailing punctuation ("remove bad drainage?" never
  // captured), and the captured phrase ("bad drainage") never
  // matched hyphenated subjects ("bad-drainage") — prose
  // extraction silently degraded to the subject hint. Both
  // fixed: punctuation tolerated, and the target matches
  // space/hyphen variants of stored subjects.
  const captured = task.text
    .match(
      /(?:remove[d]?|without|stop(?:ped)?)\s+["']?([a-z0-9 -]+?)["']?(?:\.|,|\?|!|:|;|$)/i,
    )?.[1]
    ?.trim();
  const variants = new Set<string>();
  if (captured) {
    variants.add(captured);
    variants.add(captured.replace(/\s+/g, "-"));
    variants.add(captured.replace(/-/g, " "));
  }
  if (task.subject) variants.add(task.subject);
  const edges = task.facts.query({ predicate: "causes" });
  // Resolve the removed cause against stored subjects via the
  // variant set; fall back to the raw capture when nothing
  // matches (honest unknown target).
  let removed = "";
  const subjects = new Set(edges.map((e) => e.subject));
  for (const v of variants) {
    if (subjects.has(v)) {
      removed = v;
      break;
    }
  }
  if (!removed) removed = captured ?? task.subject ?? "";
  // Effects reachable from the removed cause before removal.
  const before = new Set<string>();
  let frontier = edges
    .filter((e) => variants.has(e.subject))
    .map((e) => String(e.object));
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      if (before.has(node)) continue;
      before.add(node);
      for (const e of edges.filter((x) => x.subject === node))
        next.push(String(e.object));
    }
    frontier = next;
  }
  // Audit #5 fix (2026-09-13): the old approximation checked
  // only DIRECT causes of each node and excluded any cause
  // that was itself downstream of the intervention — which
  // wrongly orphaned effects still reachable through a
  // surviving sibling (remove heavy-rain: erosion survives
  // via bad-drainage, so foundation-risk — reachable THROUGH
  // the surviving erosion — was still wrongly orphaned). The
  // honest intervention semantics is a two-pass reachability:
  // before = reachable from the removed cause; after =
  // reachable from every OTHER cause without traversing the
  // removed node's edges (its causal powers die with it);
  // orphaned = before \ after. Cycles are safe: both passes
  // are visited-set traversals.
  // Roots of the after-pass: causes OUTSIDE the intervention's
  // downstream set. A downstream node (runoff) may be a
  // "subject" of further edges (runoff→erosion), but those
  // edges only carry the removed causal chain — they are not
  // independent support. Traversal THROUGH a surviving
  // before-node is fine (that is the point); only the ROOT
  // must exist independently of the intervention.
  const after = new Set<string>();
  let afterFrontier = edges
    .filter((e) => !variants.has(e.subject) && !before.has(e.subject))
    .map((e) => String(e.object));
  while (afterFrontier.length > 0) {
    const nextAfter: string[] = [];
    for (const node of afterFrontier) {
      if (after.has(node)) continue;
      after.add(node);
      // The removed node's edges are dead — never expand it.
      if (variants.has(node)) continue;
      for (const e of edges.filter((x) => x.subject === node))
        nextAfter.push(String(e.object));
    }
    afterFrontier = nextAfter;
  }
  const orphaned: string[] = [...before].filter((n) => !after.has(n));
  return {
    kind: "counterfactual",
    summary: removed
      ? `Without "${removed}": ${orphaned.length} effect(s) lose all support.`
      : "No intervention target identified in the task.",
    conclusions: orphaned.map((n) => ({
      statement: `Without ${removed}, "${n}" would not follow`,
      confidence: 0.8,
      status: "candidate",
      evidence: edges.filter((e) => String(e.object) === n).map((e) => e.id),
    })),
    assumptions: [
      "The causal graph as stored is correct and complete for this question.",
      "Only stored 'causes' edges are considered.",
    ],
    uncertainty: orphaned.length > 0 ? "moderate" : "unknown",
    evidence: edges.map((e) => e.id),
    explanation:
      orphaned.length === 0
        ? `All effects of "${removed}" have independent causes — no cascade loss.`
        : `Orphaned effects: ${orphaned.join(", ")}.`,
  };
}

/** HYPOTHESIS: rank candidate explanations as explicit
 *  hypotheses with evidence needs. Status is ALWAYS
 *  "hypothesis" — presented as such, never as fact. */
export function hypothesis(task: ReasoningTask): Promise<StrategyResult> {
  const base = abductive(task);
  return Promise.resolve({
    kind: "hypothesis",
    summary:
      base.conclusions.length === 0
        ? "No grounded hypothesis can be formed — no supporting evidence at all."
        : `${base.conclusions.length} hypothesis(es), each with the evidence needed to confirm or kill it.`,
    conclusions: base.conclusions.map((c) => ({
      ...c,
      status: "hypothesis" as const,
    })),
    assumptions: [
      "Hypotheses are NOT facts. Each names the observation that would promote or eliminate it.",
    ],
    uncertainty: base.conclusions.length === 0 ? "unknown" : "low",
    evidence: base.evidence,
    explanation:
      base.conclusions
        .map(
          (c) =>
            `HYPOTHESIS: ${c.statement} — to test: verify ${c.evidence.length > 0 ? "the cited premises independently" : "a supporting premise"}`,
        )
        .join("; ") ||
      "Refusing to fabricate a hypothesis without any evidentiary basis.",
  });
}

// ---------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------

export async function executeStrategy(
  kind: StrategyKind,
  task: ReasoningTask,
): Promise<StrategyResult> {
  switch (kind) {
    case "logical":
      return deductive(task);
    case "causal":
      return causal(task);
    case "probabilistic":
      return probabilistic(task);
    case "consistency":
      return consistency(task);
    case "temporal":
      return temporal(task);
    case "constraint":
      return constraint(task);
    case "comparative":
      return comparative(task);
    case "abductive":
      return abductive(task);
    case "inductive":
      return inductive(task);
    case "counterfactual":
      return counterfactual(task);
    case "hypothesis":
      return hypothesis(task);
    default:
      return {
        kind,
        summary: `Strategy "${kind}" is declared but not yet implemented natively — honest refusal.`,
        conclusions: [],
        assumptions: [],
        uncertainty: "unknown",
        evidence: [],
        explanation:
          "Rather than faking this reasoning mode, ARCHIE states plainly that it is not yet available.",
      };
  }
}

/** Full meta-reasoning pass: select, execute, merge. */
export async function reasonWithStrategies(task: ReasoningTask): Promise<{
  selected: { chosen: StrategyKind[]; rationale: string };
  results: StrategyResult[];
}> {
  const selected = selectStrategies(task);
  const results: StrategyResult[] = [];
  for (const kind of selected.chosen) {
    results.push(await executeStrategy(kind, task));
  }
  return { selected, results };
}
