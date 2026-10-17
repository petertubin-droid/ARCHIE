// ============================================================
// ARCHIE SIMULATION ENGINE — HONEST COUNTERFACTUAL PROJECTION
// (full-agent audit 2026-10-17, suggested engine 15)
//
// "What happens if the price of cement rises 20%?"
//
// The honest simulation policy, mirroring ARCHIE's knowledge
// policy: a projection is DERIVED, never invented.
//   * The premise comes from the owner (parsed verbatim).
//   * The basis comes from RECORDED world-model transitions
//     for the subject — observations only.
//   * Numeric premises project arithmetic EXPLICITLY:
//     recorded value + stated delta = projected value, every
//     number shown with its derivation.
//   * Qualitative premises get the recorded current state
//     restated as the hypothetical, plus exactly which
//     recorded transitions it touches — and an honest note
//     where no recorded basis exists to project further.
//   * Every answer is labeled PROJECTION, capped at 0.45
//     confidence (always below observation-grade), and cites
//     the recorded observations it derived from.
//
// Deterministic end to end: no randomness, no external AI,
// same question → same projection, every run.
// ============================================================

import type { WorldTimelineTransition } from "../native-engine/engine.ts";

/** Deterministic subject resolution for world-model lookup:
 *  owners say "the price of cement" when the recorded
 *  subject is "cement". The qualifier is stripped for lookup
 *  only — the answer quotes the recorded subject. This is
 *  normalization, not interpretation: fixed qualifier list,
 *  same input → same candidates, every run. */
export function candidateSubjects(subject: string): string[] {
  const out = [subject];
  const m = subject.match(/^(?:price|cost|value|level|rate)\s+of\s+(.+)$/i);
  if (m) {
    const inner = m[1].trim();
    if (inner && !out.includes(inner)) out.push(inner);
  }
  return out;
}

export interface Hypothetical {
  subject: string;
  premise: string;
}

/** Parse a hypothetical question. Trigger phrases are fixed;
 *  the subject is the noun phrase between the trigger and
 *  the change verb; the premise is the owner's clause,
 *  preserved verbatim. */
export function parseHypothetical(input: string): Hypothetical | null {
  const text = (input ?? "").trim();
  const m = text.match(
    /\b(?:what\s+(?:happens|happen|would\s+happen)\s+if|what\s+if|suppose\s+(?:that\s+)?|hypothetically[,:]?\s*)\s*(?:the\s+)?([a-z0-9' -]{2,40}?)\s+(rises|falls|drops|increases|decreases|doubles|halves|becomes|is|changes|changes to)\b\s*([a-z0-9%'’., -]{0,60})/i,
  );
  if (!m) return null;
  const subject = m[1].trim().replace(/\s+/g, " ");
  if (!subject) return null;
  const premise = `${m[1].trim()} ${m[2].toLowerCase()}${m[3].trim() ? " " + m[3].trim() : ""}`.replace(/\s+/g, " ").trim();
  const bare = subject.replace(/^(the|my|our|a|an)\s+/i, "").trim();
  return {
    subject: bare.length > 0 ? bare : subject,
    premise: premise.replace(/^(the|my|our|a|an)\s+/i, ""),
  };
}

export interface ProjectionResult {
  /** Full composed answer, labeled as a projection. */
  text: string;
  /** Capped confidence — projections are always below
   *  observation grade. */
  confidence: number;
  /** True when the premise projected numerically. */
  numeric: boolean;
}

// ------------------------------------------------------------
// Numeric premise: "<subject> rises/falls/doubles/halves
// (by X%|by N)" over the latest recorded numeric value.
// ------------------------------------------------------------

interface NumericDelta {
  kind: "percent" | "absolute" | "double" | "half";
  amount: number;
}

function parseDelta(premise: string): NumericDelta | null {
  const p = premise.toLowerCase();
  if (/\bdouble[sd]?\b/.test(p)) return { kind: "double", amount: 2 };
  if (/\bhalv?(?:e|es|ed)\b/.test(p)) return { kind: "half", amount: 0.5 };
  const pm = p.match(/\b(?:by\s+)?([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pm) return { kind: "percent", amount: Number(pm[1]) };
  const am = p.match(/\bby\s+([0-9]+(?:\.[0-9]+)?)\b/);
  if (am) return { kind: "absolute", amount: Number(am[1]) };
  return null;
}

function latestNumericValue(
  transitions: WorldTimelineTransition[],
): number | null {
  for (const t of transitions) {
    const m = t.toValue.match(/-?[0-9]+(?:\.[0-9]+)?/);
    if (m) return Number(m[0]);
  }
  return null;
}

// ------------------------------------------------------------
// The projection
// ------------------------------------------------------------

export function projectHypothetical(
  transitions: WorldTimelineTransition[],
  hyp: Hypothetical,
): ProjectionResult {
  const cap = 0.45;
  if (transitions.length === 0) {
    return {
      text:
        `I have no recorded observations for "${hyp.subject}", so I honestly cannot project what happens if ${hyp.premise}. ` +
        `Tell me its current state and its history — for example "the ${hyp.subject} was 4200 last month, now it is 4500" — and then I can extrapolate from the recorded numbers, with the derivation shown.`,
      confidence: cap * 0.7,
      numeric: false,
    };
  }

  const delta = parseDelta(hyp.premise);
  const base = latestNumericValue(transitions);

  if (delta && base !== null) {
    // Numeric projection — every number derived explicitly.
    let projected: number;
    let math: string;
    const up = !/falls|drops|decreases|halv/.test(hyp.premise.toLowerCase());
    switch (delta.kind) {
      case "double":
        projected = base * 2;
        math = `${base} doubled`;
        break;
      case "half":
        projected = base / 2;
        math = `${base} halved`;
        break;
      case "percent":
        projected = up ? base * (1 + delta.amount / 100) : base * (1 - delta.amount / 100);
        math = `${base} ${up ? "+ " : "- "}${delta.amount}%`;
        break;
      default:
        projected = up ? base + delta.amount : base - delta.amount;
        math = `${base} ${up ? "+ " : "- "}${delta.amount}`;
    }
    projected = Math.round(projected * 100) / 100;
    return {
      text:
        `PROJECTION, not an observation. From my recorded observations, the latest recorded value for "${hyp.subject}" is ${base}. ` +
        `If ${hyp.premise}, that projects to ${projected} (${math}). This is arithmetic on the recorded number under YOUR premise — nothing else is extrapolated: I have no recorded relations linking "${hyp.subject}" to other outcomes, so I will not invent downstream effects. Record what follows, and the projection becomes an observation.`,
      confidence: cap,
      numeric: true,
    };
  }

  // Qualitative premise: restate the recorded basis, list the
  // touched transitions, refuse to invent beyond them.
  const current = transitions[0];
  const lines = transitions
    .slice(0, 3)
    .map((t) => `${t.relation}: ${t.fromValue} → ${t.toValue} (observed ${t.toObservedAt.slice(0, 10)})`);
  return {
    text:
      `PROJECTION, not an observation. You asked what happens if ${hyp.premise}. My recorded basis for "${hyp.subject}" is: ${lines.join("; ")}. ` +
      `Under your premise, the current recorded state ("${current.toValue}") is the value being replaced by the hypothesis — but I have no recorded relations linking "${hyp.subject}" to other outcomes, so I will not invent downstream effects. ` +
      `Record what follows after such a change (state it as "${hyp.subject} was ${current.toValue} … now it is <state>") and my projection gets a recorded basis.`,
    confidence: cap * 0.9,
    numeric: false,
  };
}
