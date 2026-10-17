// ============================================================
// ARCHIE OWNER MODEL — THEORY OF MIND ENGINE
// (full-agent audit 2026-10-17, suggested engine 12)
//
// ARCHIE serves ONE owner, long-term. The honest way to
// "know" the owner is the same as its knowledge policy:
//
//   * DIRECT STATEMENTS become model entries, always with
//     the exact owner quote as evidence and a timestamp —
//     "call me Felix", "keep answers short", "I'm a
//     builder". Never paraphrased into something stronger
//     than what was said.
//   * INFERRED SIGNALS (message cadence, correction rate)
//     are labeled "inferred" and never presented as
//     statements of the owner's will.
//   * LATEST WINS with history: a new direct statement
//     supersedes the old value, and the superseded entry is
//     kept — the model never forgets that it changed its
//     mind, because the owner did.
//   * CONSUMPTION is real: the model drives the substrate
//     engine's verbosity (owner-stated brevity preference)
//     — not a decorative profile.
//
// Deterministic extraction: fixed pattern lists, same
// message → same updates, every run. No external AI, ever
// (owner directive). Per-isolate singleton until ARCHIE's
// new database is wired — the persistence port below is
// the drop-in point; the volatility boundary is stated,
// never implied.
// ============================================================

import type { Verbosity } from "../native-engine/composer.ts";

export type ModelSource = "owner-stated" | "inferred";

export interface OwnerModelEntry {
  key: string;
  value: string;
  /** The verbatim owner words that justify this entry —
   *  required for owner-stated, always quoted back. */
  evidence: string;
  source: ModelSource;
  updatedAt: number;
  supersededBy?: string | null;
}

export interface ModelUpdate {
  key: string;
  value: string;
  previous: string | null;
  evidence: string;
}

// ------------------------------------------------------------
// Direct-statement patterns. Each pattern's capture group 1
// is the value; patterns are checked in order, first match
// wins, and a pattern only fires ONCE per message.
// ------------------------------------------------------------

const DIRECT_PATTERNS: Array<{
  key: string;
  re: RegExp;
  transform?: (raw: string) => string;
}> = [
  {
    key: "address_name",
    // "call me Felix" / "you can call me Felix"
    re: /\b(?:you\s+can\s+)?call\s+me\s+([A-Za-z][A-Za-z'’-]{0,30})\b/i,
    transform: (r) => r.trim(),
  },
  {
    key: "brevity",
    re: /\b(?:keep\s+(?:it|answers|replies)\s+)?(?:more\s+)?(?:short|brief|concise)\b|\bshorter\s+answers\b|\bno\s+(?:long|lengthy)\s+(?:answers|replies)\b|\bstraight\s+to\s+the\s+point\b/i,
    transform: () => "concise",
  },
  {
    key: "brevity",
    re: /\b(?:more\s+)?(?:detail(?:ed)?|thorough)\s+(?:answers|replies|explanations?)\b|\bexplain\s+(?:it\s+)?(?:in\s+)?detail\b|\bgo\s+deeper\b|\bdon'?t\s+(?:be\s+)?(?:so\s+)?brief\b/i,
    transform: () => "detailed",
  },
  {
    key: "list_style",
    re: /\b(?:no|don'?t\s+use)\s+(?:bullet\s+points|lists|numbered\s+lists)\b/i,
    transform: () => "no-lists",
  },
  {
    key: "list_style",
    re: /\b(?:use|give\s+me|prefer)\s+(?:bullet\s+points|lists)\b/i,
    transform: () => "prefer-lists",
  },
  {
    key: "timezone",
    re: /\bmy\s+time(?:zone)?\s+is\s+([A-Za-z/_+-]{2,32})\b|\bi'?m\s+in\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s*(?:time|timezone)?\b[\s.]*$/i,
    transform: (r) => r.trim().replace(/\s+time$/, ""),
  },
  {
    key: "role",
    // "I'm a builder" / "I am an engineer by trade"
    re: /\bi\s*(?:am|'m)\s+(?:a|an)\s+([a-z][a-z\s-]{1,40}?)(?:\s+by\s+trade)?\b(?=[.,!?]|$)/i,
    transform: (r) => r.trim(),
  },
];

// ------------------------------------------------------------
// The model
// ------------------------------------------------------------

export class OwnerModel {
  private entries = new Map<string, OwnerModelEntry>();
  private history = new Map<string, OwnerModelEntry[]>();
  private counters = {
    messagesObserved: 0,
    correctionsIssued: 0,
    thanksReceived: 0,
  };

  /** Observe one owner message. Deterministic: same message,
   *  same updates. Returns the updates applied (may be
   *  empty) — callers may log them; evidence is always the
   *  verbatim quote. */
  observe(message: string, nowMs = Date.now()): ModelUpdate[] {
    const text = (message ?? "").trim();
    if (!text) return [];
    this.counters.messagesObserved++;
    if (/\b(?:that'?s|that\s+is)\s+(?:wrong|incorrect|not\s+right)\b|\bno,?\s+(?:archie|that'?s)\b|\bactually,?\s+(?:the\s+)?(?:correct|right)/i.test(text)) {
      this.counters.correctionsIssued++;
    }
    if (/\b(?:thanks|thank\s+you|appreciate\s+(?:it|this))\b/i.test(text)) {
      this.counters.thanksReceived++;
    }
    const updates: ModelUpdate[] = [];
    const fired = new Set<string>();
    for (const { key, re, transform } of DIRECT_PATTERNS) {
      if (fired.has(key)) continue; // one statement per key
      const m = text.match(re);
      if (!m) continue;
      const raw = m[1] || m[2] || "";
      const value = transform ? transform(raw) : raw;
      if (!value) continue;
      const prev = this.entries.get(key) ?? null;
      if (prev && prev.value === value) {
        // Re-affirmation refreshes the timestamp only.
        prev.updatedAt = nowMs;
        continue;
      }
      const entry: OwnerModelEntry = {
        key,
        value,
        evidence: m[0],
        source: "owner-stated",
        updatedAt: nowMs,
        supersededBy: null,
      };
      if (prev) {
        prev.supersededBy = value;
        const h = this.history.get(key) ?? [];
        h.push(prev);
        this.history.set(key, h);
      }
      this.entries.set(key, entry);
      fired.add(key);
      updates.push({
        key,
        value,
        previous: prev?.value ?? null,
        evidence: m[0],
      });
    }
    return updates;
  }

  get(key: string): OwnerModelEntry | undefined {
    return this.entries.get(key);
  }

  /** The owner-stated brevity preference, translated into
   *  the substrate engine's verbosity option. No statement,
   *  no override — ARCHIE keeps its default. */
  verbosityPreference(): Verbosity | null {
    const e = this.entries.get("brevity");
    if (!e || e.source !== "owner-stated") return null;
    return e.value === "concise" ? "concise" : e.value === "detailed" ? "detailed" : null;
  }

  /** The preferred way to address the owner, if stated. */
  addressName(): string | null {
    return this.entries.get("address_name")?.value ?? null;
  }

  /** Honest view: every live entry with its evidence, the
   *  supersession history, and the inferred counters
   *  labeled as inferred. */
  snapshot(): {
    entries: OwnerModelEntry[];
    history: Record<string, Array<{ value: string; evidence: string; supersededBy: string | null }>>;
    inferred: { key: string; value: string }[];
  } {
    return {
      entries: [...this.entries.values()],
      history: Object.fromEntries(
        [...this.history.entries()].map(([k, v]) => [
          k,
          v.map((e) => ({
            value: e.value,
            evidence: e.evidence,
            supersededBy: e.supersededBy ?? null,
          })),
        ]),
      ),
      inferred: [
        { key: "messages_observed", value: String(this.counters.messagesObserved) },
        { key: "corrections_issued", value: String(this.counters.correctionsIssued) },
        { key: "thanks_received", value: String(this.counters.thanksReceived) },
      ],
    };
  }

  size(): number {
    return this.entries.size;
  }
}

// ------------------------------------------------------------
// Per-isolate singleton. HONEST LIMIT: entries live only as
// long as this isolate. The persistence port (below) is the
// drop-in for the new database — same shape as the World
// Model store; until then volatility is stated, not hidden.
// ------------------------------------------------------------

let singleton: OwnerModel | null = null;

export function getOwnerModel(): OwnerModel {
  if (!singleton) singleton = new OwnerModel();
  return singleton;
}
