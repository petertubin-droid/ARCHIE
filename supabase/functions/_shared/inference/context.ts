// =========================================================
// ARCHIE CONTEXT & INFERENCE ENGINE — CONTEXT MANAGER
//
// Spec §3: contextual analysis of the current message, prior
// relevant messages, referenced concepts, task, domain,
// language, temporal context, explicit user constraints and
// unresolved ambiguities — RELEVANT AND BOUNDED. The full
// conversation is never blindly injected.
//
// Everything here is deterministic. No fake NLU, no invented
// intent: markers are matched honestly and unmatched text is
// simply not claimed.
// =========================================================

import { lexicalTokens, stem } from "../lexicon/retrieval.ts";
import type { ContextModel, Premise } from "./types.ts";

export interface ContextOptions {
  /** Max prior turns loaded (default 3 — bounded). */
  maxPriorTurns?: number;
  /** Carried ambiguities from the previous turn. */
  carriedAmbiguities?: string[];
  /** Resolved language registry code (from archie-core). */
  language?: string | null;
  /** Knowledge-edition label for the temporal note. */
  sourceLabel?: string;
  /** Clock override for deterministic tests. */
  now?: () => string;
}

/** Deterministic reference markers: openers that usually
 *  point at the prior turn ("it", "that one", "he", …). */
const REFERENCE_OPENERS = new Set([
  "it",
  "this",
  "that",
  "these",
  "those",
  "he",
  "she",
  "they",
  "them",
  "there",
  "then",
  "such",
  "yes",
  "no",
  "ok",
  "okay",
]);

/** Deterministic constraint markers (spec §3 — explicit user
 *  constraints). Matched as tokens, never invented. */
const CONSTRAINT_MARKERS: Array<{ marker: string; negates: boolean }> = [
  { marker: "must", negates: false },
  { marker: "must not", negates: true },
  { marker: "only", negates: false },
  { marker: "never", negates: true },
  { marker: "always", negates: false },
  { marker: "exactly", negates: false },
  { marker: "do not", negates: true },
  { marker: "don't", negates: true },
  { marker: "cannot", negates: true },
  { marker: "can't", negates: true },
  { marker: "no other", negates: true },
  { marker: "required to", negates: false },
];

/** Deterministic unavailability markers → USER_PROVIDED
 *  premises (spec §14 — user premise, never verified fact). */
const UNAVAILABLE_MARKERS = [
  "unavailable",
  "not available",
  "broken",
  "is down",
  "was down",
  "out of stock",
  "offline",
  "can't access",
  "cannot access",
  "cannot be accessed",
  "doesn't work",
  "does not work",
];

const AVAILABILITY_MARKERS = [
  "is available",
  "now works",
  "is back",
  "restored",
  "is working",
];

export interface HistoryTurn {
  role: string;
  content: string;
}

/**
 * Build the bounded context model for the current turn.
 * Deterministic and bounded: only relevance-ranked prior
 * turns are loaded, plus the immediately previous turn when
 * a reference opener suggests the message points at it.
 */
export function buildContextModel(
  message: string,
  history: HistoryTurn[],
  opts: ContextOptions = {},
): ContextModel {
  const maxPriorTurns = opts.maxPriorTurns ?? 3;
  const now = (opts.now ?? (() => new Date().toISOString()))();

  const messageStems = new Set(
    lexicalTokens(message)
      .map((t) => stem(t))
      .filter((t) => t.length >= 3),
  );

  // --- reference detection: does this message point at the
  // prior turn? (pronoun/reference openers, deterministic)
  // NOTE: read the RAW first word — lexicalTokens filters
  // stopwords, and pronoun openers ARE stopwords, so the
  // filtered list would never see them.
  const rawFirstWord =
    message
      .trim()
      .toLowerCase()
      .split(/[^\p{L}\p{N}']+/u)[0] ?? "";
  const referencedPriorTurnLikely =
    history.length > 0 && REFERENCE_OPENERS.has(rawFirstWord);

  // --- relevance-ranked prior turns (never the whole history)
  const scored = history.map((turn, idx) => {
    const turnStems = lexicalTokens(turn.content)
      .map((t) => stem(t))
      .filter((t) => t.length >= 3);
    let overlap = 0;
    for (const st of new Set(turnStems)) {
      if (messageStems.has(st)) overlap += 1;
    }
    // recency weight: later turns matter more
    const recency = idx / Math.max(1, history.length);
    return { index: idx, turn, overlap, relevance: overlap + recency };
  });

  const relevantPriorTurns: ContextModel["relevantPriorTurns"] = [];
  for (const s of scored) {
    if (relevantPriorTurns.length >= maxPriorTurns) break;
    const isLastTurn = s.index === history.length - 1;
    const include = s.overlap > 0 || (isLastTurn && referencedPriorTurnLikely);
    if (!include) continue;
    relevantPriorTurns.push({
      index: s.index,
      role: s.turn.role,
      content: s.turn.content,
      relevance: Number(s.relevance.toFixed(3)),
      reason:
        s.overlap > 0
          ? `${s.overlap} shared term${s.overlap === 1 ? "" : "s"} with the current message`
          : "immediately previous turn — the message appears to reference it",
    });
  }

  // --- explicit user constraints (deterministic markers)
  const constraints: ContextModel["constraints"] = [];
  const lower = message.toLowerCase();
  const scanForConstraints = (
    text: string,
    source: "USER_MESSAGE" | "HISTORY",
  ) => {
    const low = text.toLowerCase();
    for (const { marker } of CONSTRAINT_MARKERS) {
      if (low.includes(marker)) constraints.push({ text: marker, source });
    }
  };
  scanForConstraints(lower, "USER_MESSAGE");
  for (const t of relevantPriorTurns) {
    scanForConstraints(t.content, "HISTORY");
  }

  // --- user-provided premises (spec §14 — always labeled,
  //  never promoted to verified knowledge)
  const userPremises: Premise[] = [];
  let premiseSeq = 0;
  const premise = (statement: string): Premise => ({
    id: `user-premise-${premiseSeq++}`,
    kind: "ASSUMPTION",
    statement,
    knowledgeStatus: "USER_PROVIDED",
    source: "USER_PROVIDED",
    temporalNote: `stated by the user this turn (${now})`,
  });
  for (const marker of UNAVAILABLE_MARKERS) {
    if (lower.includes(marker)) {
      userPremises.push(premise(`the user states that something "${marker}"`));
    }
  }
  for (const marker of AVAILABILITY_MARKERS) {
    if (lower.includes(marker)) {
      userPremises.push(premise(`the user states that something "${marker}"`));
    }
  }

  return {
    currentMessage: message,
    relevantPriorTurns,
    referencedPriorTurnLikely,
    domainCandidates: [], // filled by the engine from graph evidence
    language: opts.language ?? null,
    temporal: {
      now,
      priorTurnCount: history.length,
      note:
        `Stored graph/lexicon facts carry the edition label (${opts.sourceLabel ?? "current dataset edition"}); ` +
        "their temporal validity beyond that edition is not asserted. Old stored facts are never treated as automatically current.",
    },
    constraints,
    userPremises,
    unresolvedAmbiguities: opts.carriedAmbiguities ?? [],
  };
}
