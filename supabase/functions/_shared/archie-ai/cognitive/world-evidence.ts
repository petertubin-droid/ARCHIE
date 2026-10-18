// =========================================================
// ARCHIE WORLD MODEL — REASONING READ PATH
// supabase/functions/_shared/archie-ai/cognitive/world-evidence.ts
//
// Turns the world model's current view into bounded, labelled
// evidence the reasoning side can use. It never invents
// relations: every line is a recorded observation with its
// observation date, confidence, and provenance.
//
// It adds three things the raw query does not give:
//   * freshness: observations older than a cutoff are flagged
//     STALE (kept, never silently dropped);
//   * conflicts: the same subject and relation recorded with
//     different objects is reported as a CONFLICT, not resolved
//     by picking the newest or the most confident one;
//   * honesty: an unknown subject returns found=false, and the
//     rendered text says nothing was recorded.
//
// The source is any object with query() and history(), so the
// function works on WorldModel and on isolated test doubles.
// =========================================================

import type { WorldRelation } from "./types.ts";

export const EVIDENCE_LIMITS = {
  maxDepth: 2,
  maxRelations: 20,
  defaultRelations: 8,
  defaultStaleAfterDays: 180,
  maxFieldChars: 200,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface EvidenceSource {
  query(q: { about?: string; depth?: number }): WorldRelation[];
  history(subject: string): WorldRelation[];
}

export interface EvidenceRelation {
  subject: string;
  relation: string;
  object: string;
  confidence: number;
  provenance: string;
  observedAt: string | null;
  stale: boolean;
}

export interface EvidenceConflict {
  subject: string;
  relation: string;
  objects: string[];
}

export interface WorldEvidence {
  subject: string;
  found: boolean;
  relations: EvidenceRelation[];
  conflicts: EvidenceConflict[];
  /** Superseded versions for this subject (kept in history, not
   *  shown as current). */
  supersededVersions: number;
  /** True when more recorded relations exist than were returned. */
  truncated: boolean;
  rejectedReason?: string;
}

export interface EvidenceOptions {
  depth?: number;
  maxRelations?: number;
  staleAfterDays?: number;
  now?: Date;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function observedMs(r: WorldRelation): number {
  const ms = new Date(r.observedAt ?? r.createdAt).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, EVIDENCE_LIMITS.maxFieldChars);
}

export function buildWorldEvidence(
  source: EvidenceSource,
  subject: string,
  opts: EvidenceOptions = {},
): WorldEvidence {
  const name = typeof subject === "string" ? subject.trim() : "";
  if (
    name.length === 0 ||
    name.length > EVIDENCE_LIMITS.maxFieldChars ||
    CONTROL_CHARS.test(name)
  ) {
    return {
      subject: singleLine(String(subject ?? "")),
      found: false,
      relations: [],
      conflicts: [],
      supersededVersions: 0,
      truncated: false,
      rejectedReason: "invalid subject",
    };
  }

  const depth = clamp(opts.depth ?? 1, 1, EVIDENCE_LIMITS.maxDepth);
  const maxRelations = clamp(
    opts.maxRelations ?? EVIDENCE_LIMITS.defaultRelations,
    1,
    EVIDENCE_LIMITS.maxRelations,
  );
  const now = (opts.now ?? new Date()).getTime();
  const staleMs =
    (opts.staleAfterDays ?? EVIDENCE_LIMITS.defaultStaleAfterDays) * DAY_MS;

  // De-duplicate by full triple, keeping the newest observation.
  const unique = new Map<string, WorldRelation>();
  for (const r of source.query({ about: name, depth })) {
    const key = `${r.subject}|${r.relation}|${r.object}`.toLowerCase();
    const prev = unique.get(key);
    if (!prev || observedMs(r) > observedMs(prev)) unique.set(key, r);
  }
  const all = [...unique.values()].sort((a, b) => observedMs(b) - observedMs(a));

  // Conflicts are judged over every recorded relation, not only
  // the returned slice, so truncation cannot hide a disagreement.
  const byPair = new Map<string, { subject: string; relation: string; objects: Set<string> }>();
  for (const r of all) {
    const key = `${r.subject}|${r.relation}`.toLowerCase();
    const entry = byPair.get(key) ?? {
      subject: singleLine(r.subject),
      relation: singleLine(r.relation),
      objects: new Set<string>(),
    };
    entry.objects.add(singleLine(r.object));
    byPair.set(key, entry);
  }
  const conflicts: EvidenceConflict[] = [...byPair.values()]
    .filter((e) => e.objects.size > 1)
    .map((e) => ({ subject: e.subject, relation: e.relation, objects: [...e.objects] }));

  const shown = all.slice(0, maxRelations);
  const relations: EvidenceRelation[] = shown.map((r) => {
    const ms = observedMs(r);
    return {
      subject: singleLine(r.subject),
      relation: singleLine(r.relation),
      object: singleLine(r.object),
      confidence: Number.isFinite(r.confidence) ? r.confidence : 0,
      provenance: singleLine(r.provenance ?? ""),
      observedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
      stale: Number.isFinite(ms) && now - ms > staleMs,
    };
  });

  const supersededVersions = source
    .history(name)
    .filter((r) => r.supersededBy)
    .length;

  return {
    subject: singleLine(name),
    found: all.length > 0,
    relations,
    conflicts,
    supersededVersions,
    truncated: all.length > shown.length,
  };
}

/** Bullet lines for one evidence record. Every line states that
 *  it is a recorded observation; nothing here is a validated fact. */
export function renderEvidenceLines(ev: WorldEvidence): string[] {
  if (ev.rejectedReason || !ev.found) return [];
  const lines: string[] = [];
  for (const r of ev.relations) {
    const date = r.observedAt ? r.observedAt.slice(0, 10) : "unknown date";
    const flags = r.stale ? ", STALE" : "";
    lines.push(
      `- ${r.subject} —[${r.relation}]→ ${r.object} (recorded ${date}, ` +
        `confidence ${r.confidence.toFixed(2)}, source: ${r.provenance || "unspecified"}${flags})`,
    );
  }
  for (const c of ev.conflicts) {
    lines.push(
      `- CONFLICT on "${c.subject} ${c.relation}": recorded values disagree (${c.objects
        .map((o) => `"${o}"`)
        .join(" vs ")}). Do not choose one without further evidence.`,
    );
  }
  if (ev.truncated) {
    lines.push(`- (more recorded observations exist about "${ev.subject}"; showing the newest ${ev.relations.length})`);
  }
  return lines;
}

/** Standalone rendering for a single subject, including the
 *  not-recorded case. */
export function renderWorldEvidence(ev: WorldEvidence): string {
  if (ev.rejectedReason) return "";
  if (!ev.found) return `No recorded world-model observations for "${ev.subject}".`;
  return [`Recorded observations about "${ev.subject}":`, ...renderEvidenceLines(ev)].join("\n");
}
