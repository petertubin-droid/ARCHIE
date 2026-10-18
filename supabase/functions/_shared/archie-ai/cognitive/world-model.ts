// =========================================================
// ARCHIE COGNITIVE ENGINE — WORLD MODEL
// supabase/functions/_shared/archie-ai/cognitive/world-model.ts
//
// Represents relationships between concepts, people,
// organizations, systems, software, objects, events,
// environments, projects and outcomes. Entities and relations
// are unbounded (no hardcoded domain ceiling) and carry
// confidence + provenance. Persisted in
// frelux_archie_world_model (owner-scoped). Every write is
// real; nothing is simulated.
//
// TEMPORAL AXIS (audit phase 7, 2026-09-11): relations are
// VERSIONED. Each observation is stamped observed_at; a new
// observation that contradicts a current one SUPERSEDES it
// (the old version points at its replacement via
// superseded_by — nothing is silently overwritten).
// currentView() projects the present; history(subject)
// returns the full versioned past. The kernel's MODEL phase
// stamps observation time through relate() — the single
// point where observations enter the model.
// =========================================================

import { table } from "../tables.ts";
import type { SupabaseLike } from "../native-engine/persistence.ts";
import type { WorldEntity, WorldModelQuery, WorldRelation } from "./types.ts";

export const WORLD_MODEL_TABLE = table("archie_world_model");

/** The owner's scope. Existing rows and the owner's writes use
 *  this value, matching ARCHIE's memory tables (user_id DEFAULT
 *  'owner'). Any other scope is a non-owner (visitor) world and
 *  never reads or overwrites owner rows. */
export const OWNER_SCOPE = "owner";
const SCOPE_RE = /^[a-z0-9_-]{1,64}$/;

interface WorldModelRow {
  user_id?: string | null;
  id: string;
  subject: string;
  relation: string;
  object: string;
  subject_kind: string;
  object_kind: string;
  confidence: number;
  provenance: string;
  created_at: string;
  observed_at?: string | null;
  superseded_by?: string | null;
}

/** Entity kinds ARCHIE recognizes — open set: any other kind
 *  is accepted and stored verbatim (unbounded expansion). */
export const ENTITY_KINDS = [
  "Person",
  "Organization",
  "System",
  "Software",
  "Project",
  "Object",
  "Event",
  "Environment",
  "Concept",
  "Outcome",
] as const;

function idFor(...parts: string[]): string {
  return parts.join("::").toLowerCase();
}

export class WorldModel {
  /** CURRENT view only — superseded versions live in the
   *  observation log below (temporal axis, audit phase 7). */
  private relations = new Map<string, WorldRelation>();
  /** Full versioned observation log (current + superseded) —
   *  the temporal axis history() reads. */
  private observations: WorldRelation[] = [];
  private entities = new Map<string, WorldEntity>();
  /** Entity-kind memory per relation id (kinds live on DB rows,
   *  not on the WorldRelation projection) — lets re-observation
   *  persist a FULL row instead of a partial patch. */
  private kinds = new Map<
    string,
    { subjectKind: string; objectKind: string }
  >();
  /** Every version id ever issued or hydrated. A version id is
   *  unique per OBSERVATION (not per semantic triple): a relation
   *  that is superseded and later re-observed gets a new id, so
   *  its earlier row is never overwritten (audit fix, 2026-10-18). */
  private usedIds = new Set<string>();
  private db: SupabaseLike | null;
  private hydrated = false;
  /** Owner scope of this model instance (OWNER_SCOPE by default).
   *  Every read is filtered to it and every write is stamped
   *  with it, so one scope's facts never leak into another's. */
  readonly ownerScope: string;
  /** Prefix that keeps non-owner row ids disjoint from owner
   *  row ids (the table's id is a global primary key). */
  private keyPrefix: string;

  constructor(db?: SupabaseLike, options?: { ownerScope?: string }) {
    this.db = db ?? null;
    const scope = options?.ownerScope ?? OWNER_SCOPE;
    if (!SCOPE_RE.test(scope)) {
      throw new Error("invalid world-model scope");
    }
    this.ownerScope = scope;
    this.keyPrefix = scope === OWNER_SCOPE ? "" : `s:${scope}::`;
  }

  /** Semantic identity of a relation within this scope. */
  private key(subject: string, relation: string, object: string): string {
    return this.keyPrefix + idFor(subject, relation, object);
  }

  /** Issue a version id for a new observation of a semantic
   *  triple. The first version keeps the triple's id (backward
   *  compatible with existing rows); later versions get a suffix. */
  private nextVersionId(semanticKey: string): string {
    let candidate = semanticKey;
    let n = 1;
    while (this.usedIds.has(candidate)) {
      candidate = `${semanticKey}::v${n}`;
      n += 1;
    }
    this.usedIds.add(candidate);
    return candidate;
  }

  /** Load persisted world relations (subject/relation/object
   *  rows; entities are derived). */
  async hydrate(): Promise<number> {
    if (this.hydrated || !this.db) return 0;
    this.hydrated = true;
    try {
      const selected = this.db
        .from(WORLD_MODEL_TABLE)
        .select(
          "id,user_id,subject,relation,object,subject_kind,object_kind,confidence,provenance,created_at,observed_at,superseded_by",
        );
      // Scope filter in the database when the client supports it;
      // otherwise filter the rows here. Either way a row outside
      // this scope is never loaded.
      const { data, error } = selected.eq
        ? await selected.eq("user_id", this.ownerScope)
        : await selected;
      if (error || !Array.isArray(data)) return 0;
      const scoped = (data as WorldModelRow[]).filter(
        (row) => (row.user_id ?? OWNER_SCOPE) === this.ownerScope,
      );
      for (const row of scoped) {
        this.entities.set(idFor(row.subject), {
          id: idFor(row.subject),
          name: row.subject,
          kind: row.subject_kind || "Concept",
          confidence: row.confidence ?? 0.8,
          provenance: row.provenance ?? "hydrated",
          createdAt: row.created_at ?? new Date().toISOString(),
        });
        this.entities.set(idFor(row.object), {
          id: idFor(row.object),
          name: row.object,
          kind: row.object_kind || "Concept",
          confidence: row.confidence ?? 0.8,
          provenance: row.provenance ?? "hydrated",
          createdAt: row.created_at ?? new Date().toISOString(),
        });
        const versioned: WorldRelation = {
          id: row.id,
          subject: row.subject,
          relation: row.relation,
          object: row.object,
          confidence: row.confidence ?? 0.8,
          provenance: row.provenance ?? "hydrated",
          createdAt: row.created_at ?? new Date().toISOString(),
          observedAt:
            row.observed_at ?? row.created_at ?? new Date().toISOString(),
          supersededBy: row.superseded_by ?? null,
        };
        this.usedIds.add(row.id);
        this.kinds.set(row.id, {
          subjectKind: row.subject_kind || "Concept",
          objectKind: row.object_kind || "Concept",
        });
        this.observations.push(versioned);
        // Superseded versions are history, not the present. The
        // current view is keyed by the semantic triple.
        if (!versioned.supersededBy) {
          this.relations.set(
            this.key(row.subject, row.relation, row.object),
            versioned,
          );
        }
      }
      return this.relations.size;
    } catch {
      // Hydration failure is honest: the in-memory model still
      // operates; persistence retries on next write.
      return 0;
    }
  }

  /** Assert a relation (and both entities) into the model.
   *  Returns the stored relation.
   *
   *  TEMPORAL AXIS (audit phase 7, 2026-09-11):
   *  - every observation is stamped observed_at (the kernel's
   *    MODEL phase enters observations here — the single
   *    point where observation time is stamped);
   *  - re-observing the SAME subject+relation+object
   *    strengthens confidence and refreshes observed_at;
   *  - observing a DIFFERENT object for an existing current
   *    subject+relation pair SUPERSEDES the old version (it
   *    points at its replacement via superseded_by and leaves
   *    the current view) — nothing is silently overwritten;
   *    history(subject) still returns every version. */
  async relate(input: {
    subject: string;
    relation: string;
    object: string;
    subjectKind?: string;
    objectKind?: string;
    confidence: number;
    provenance: string;
    /** Optional observation stamp — owner state-change CLAIMS
     *  carry their own dates ("muddy last week"), and honest
     *  versioning must stamp what the owner asserted, not the
     *  moment of the telling. Default: now. */
    observedAt?: string;
  }): Promise<WorldRelation> {
    const observedAt = input.observedAt ?? new Date().toISOString();
    const id = this.key(input.subject, input.relation, input.object);
    const existing = this.relations.get(id);
    if (existing) {
      // Strengthen confidence when re-observed — and stamp the
      // re-observation time (the temporal axis tracks the last
      // time this version was actually observed).
      existing.confidence = Math.min(
        0.99,
        existing.confidence + 0.5 * (1 - existing.confidence),
      );
      existing.observedAt = observedAt;
      const kind = this.kinds.get(existing.id) ?? {
        subjectKind: "Concept",
        objectKind: "Concept",
      };
      if (this.db) {
        try {
          // FULL row (not a partial patch): the re-observation
          // keeps the kinds and provenance of the stored
          // relation and stamps the new observation time.
          await this.db.from(WORLD_MODEL_TABLE).upsert({
            id: existing.id,
            user_id: this.ownerScope,
            subject: existing.subject,
            relation: existing.relation,
            object: existing.object,
            subject_kind: kind.subjectKind,
            object_kind: kind.objectKind,
            confidence: existing.confidence,
            provenance: existing.provenance,
            superseded_by: null,
            observed_at: observedAt,
          });
        } catch {
          // Persistence failure does not corrupt the in-memory
          // model; the relation stays available for this run.
        }
      }
      return existing;
    }
    // SUPERSESSION — a new object for an existing current
    // subject+relation pair replaces the old version in the
    // current view; the old version is retained in the
    // observation log, pointing at its replacement.
    const versionId = this.nextVersionId(id);
    const supersededIds: string[] = [];
    for (const [key, rel] of [...this.relations.entries()]) {
      if (
        rel.subject.toLowerCase() === input.subject.toLowerCase() &&
        rel.relation.toLowerCase() === input.relation.toLowerCase() &&
        rel.object.toLowerCase() !== input.object.toLowerCase()
      ) {
        rel.supersededBy = versionId;
        supersededIds.push(rel.id);
        this.relations.delete(key);
      }
    }
    const relation: WorldRelation = {
      id: versionId,
      subject: input.subject,
      relation: input.relation,
      object: input.object,
      confidence: input.confidence,
      provenance: input.provenance,
      createdAt: observedAt,
      observedAt,
      supersededBy: null,
    };
    for (const [name, kind] of [
      [input.subject, input.subjectKind ?? "Concept"],
      [input.object, input.objectKind ?? "Concept"],
    ] as const) {
      const eid = idFor(name);
      if (!this.entities.has(eid)) {
        this.entities.set(eid, {
          id: eid,
          name,
          kind,
          confidence: input.confidence,
          provenance: input.provenance,
          createdAt: relation.createdAt,
        });
      }
    }
    this.kinds.set(versionId, {
      subjectKind: input.subjectKind ?? "Concept",
      objectKind: input.objectKind ?? "Concept",
    });
    this.relations.set(id, relation);
    this.observations.push(relation);
    if (this.db) {
      try {
        // The superseded versions point at their replacement.
        for (const oldId of supersededIds) {
          await this.db
            .from(WORLD_MODEL_TABLE)
            .update({ superseded_by: versionId })
            .eq("id", oldId);
        }
        await this.db.from(WORLD_MODEL_TABLE).upsert({
          id: versionId,
          user_id: this.ownerScope,
          subject: input.subject,
          relation: input.relation,
          object: input.object,
          subject_kind: input.subjectKind ?? "Concept",
          object_kind: input.objectKind ?? "Concept",
          confidence: input.confidence,
          provenance: input.provenance,
          observed_at: observedAt,
          superseded_by: null,
        });
      } catch {
        // Persistence failure does not corrupt the in-memory
        // model; the relation stays available for this run.
      }
    }
    return relation;
  }

  /** Relations touching a given entity, expanding up to
   *  `depth` hops (breadth-first; default 1). */
  query(q: WorldModelQuery): WorldRelation[] {
    if (!q.about) return [...this.relations.values()];
    const depth = Math.max(1, Math.min(3, q.depth ?? 1));
    const visited = new Set<string>([q.about.toLowerCase()]);
    let frontier = [q.about];
    const found: WorldRelation[] = [];
    for (let hop = 0; hop < depth; hop += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        // Defensive honesty (found via D-1 e2e probe): a term
        // extracted upstream can be undefined/empty when NLU
        // parsing found no node — a query must never crash the
        // cycle on it. Skipped, not guessed.
        if (!node || typeof node !== "string") continue;
        for (const rel of this.relations.values()) {
          // Robustness: a malformed relation row (dirty persisted
          // data) must never crash a live cycle. Skipped.
          if (typeof rel.subject !== "string" || typeof rel.object !== "string")
            continue;
          if (
            rel.subject.toLowerCase() === node.toLowerCase() ||
            rel.object.toLowerCase() === node.toLowerCase()
          ) {
            if (!found.includes(rel)) found.push(rel);
            const other =
              rel.subject.toLowerCase() === node.toLowerCase()
                ? rel.object
                : rel.subject;
            if (!visited.has(other.toLowerCase())) {
              visited.add(other.toLowerCase());
              next.push(other);
            }
          }
        }
      }
      frontier = next;
    }
    // Transitive causal composition (cr-2): if A causes B and
    // B causes C, derive the composite edge A causes C —
    // explicitly provenance-tagged as derived (never an
    // observed relation), confidence = product of the hops.
    if (q.relation === undefined || q.relation === "causes") {
      const causal = found.filter((r) => r.relation === "causes");
      const bySubject = new Map<string, WorldRelation[]>();
      for (const rel of causal) {
        const key = rel.subject.toLowerCase();
        if (!bySubject.has(key)) bySubject.set(key, []);
        bySubject.get(key)!.push(rel);
      }
      const derived: WorldRelation[] = [];
      for (const first of causal) {
        for (const second of bySubject.get(first.object.toLowerCase()) ?? []) {
          const id = `derived::${first.subject}::causes::${second.object}`;
          if (this.relations.has(id)) continue;
          derived.push({
            id,
            subject: first.subject,
            relation: "causes",
            object: second.object,
            confidence: Number(
              (first.confidence * second.confidence).toFixed(3),
            ),
            provenance: `derived: transitive ${first.subject}→${first.object}→${second.object}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      // 3-hop chains compose from the 2-hop derivations.
      for (const d of derived) {
        for (const second of bySubject.get(d.object.toLowerCase()) ?? []) {
          const id = `derived::${d.subject}::causes::${second.object}`;
          if (derived.some((x) => x.id === id)) continue;
          derived.push({
            id,
            subject: d.subject,
            relation: "causes",
            object: second.object,
            confidence: Number((d.confidence * second.confidence).toFixed(3)),
            provenance: `derived: transitive chain via ${d.object}`,
            createdAt: new Date().toISOString(),
          });
        }
      }
      found.push(...derived);
    }
    return q.relation ? found.filter((r) => r.relation === q.relation) : found;
  }

  /** All relations involving a subject predicate pair. */
  about(name: string): WorldRelation[] {
    return this.query({ about: name, depth: 1 });
  }

  /** TEMPORAL QUERY (remediation batch 1, 2026-09-12): the
   *  version of every relation that was CURRENT at instant t.
   *  Per semantic identity (subject::relation::object), the
   *  observation with the latest observed_at <= t wins; a
   *  relation first observed after t is absent — it did not
   *  exist yet. Pure projection over the versioned
   *  observation log; no interpolation, no guessing. */
  aliveAt(t: Date): WorldRelation[] {
    const tms = t.getTime();
    const latest = new Map<string, WorldRelation>();
    const at = (r: WorldRelation) =>
      new Date(r.observedAt ?? r.createdAt).getTime();
    for (const obs of this.observations) {
      const oms = at(obs);
      if (oms > tms) continue;
      // One state slot per subject+relation: supersession only
      // lets one object be current per slot, so a superseded
      // object must not stay alive alongside its replacement.
      const key = `${obs.subject}::${obs.relation}`.toLowerCase();
      const cur = latest.get(key);
      if (!cur || oms > at(cur)) latest.set(key, obs);
    }
    return [...latest.values()].map((r) => ({ ...r }));
  }

  /** TEMPORAL QUERY: observations first recorded within
   *  [from, to] inclusive — the world's changelog window,
   *  newest first. */
  between(from: Date, to: Date): WorldRelation[] {
    const fms = from.getTime();
    const tms = to.getTime();
    const at = (r: WorldRelation) =>
      new Date(r.observedAt ?? r.createdAt).getTime();
    return this.observations
      .filter((r) => {
        const oms = at(r);
        return oms >= fms && oms <= tms;
      })
      .map((r) => ({ ...r }))
      .sort((a, b) => at(b) - at(a));
  }

  /** CURRENT VIEW (temporal axis, audit phase 7): every
   *  relation that has not been superseded — the world as it
   *  stands, each with its observation time. */
  currentView(): WorldRelation[] {
    return [...this.relations.values()].map((r) => ({ ...r }));
  }

  /** VERSIONED HISTORY (temporal axis, audit phase 7): every
   *  observation — current AND superseded — involving the
   *  subject, newest first. Superseded versions carry the id
   *  of their replacement; the timeline is never lossy. */
  history(subject: string): WorldRelation[] {
    const needle = subject.toLowerCase();
    return (
      this.observations
        .filter(
          (r) =>
            r.subject.toLowerCase() === needle ||
            r.object.toLowerCase() === needle,
        )
        // newest first; same-timestamp ties resolve by insertion
        // order (the later observation is the newer one)
        .map((r, i) => ({ r, i }))
        .sort(
          (x, y) =>
            new Date(y.r.observedAt ?? y.r.createdAt).getTime() -
              new Date(x.r.observedAt ?? x.r.createdAt).getTime() || y.i - x.i,
        )
        .map(({ r }) => ({ ...r }))
    );
  }

  /** The full observation log — every version, current and
   *  superseded, newest first. */
  allObservations(): WorldRelation[] {
    return [...this.observations]
      .map((r, i) => ({ r, i }))
      .sort(
        (x, y) =>
          new Date(y.r.observedAt ?? y.r.createdAt).getTime() -
            new Date(x.r.observedAt ?? x.r.createdAt).getTime() || y.i - x.i,
      )
      .map(({ r }) => ({ ...r }));
  }

  entitiesCount(): number {
    return this.entities.size;
  }

  relationsCount(): number {
    return this.relations.size;
  }

  listEntities(): WorldEntity[] {
    return [...this.entities.values()];
  }

  getEntity(name: string): WorldEntity | undefined {
    return this.entities.get(idFor(name));
  }

  // -------------------------------------------------------
  // TRANSITION ALGEBRA (audit HIGH-1 fix, 2026-09-13): the
  // temporal axis existed (supersession + history) but was
  // WRITE-ONLY for change questions — nothing derived
  // "X changed from A to B". These methods turn the
  // versioned observation log into explicit transitions and
  // point-in-time state reconstructions. All derivation is
  // from REAL recorded observations; nothing is interpolated.
  // -------------------------------------------------------

  /** Every recorded state transition: a superseded version
   *  and its replacement on the same subject+relation. The
   *  world CHANGED between the two observation stamps — this
   *  is that change, made explicit. */
  transitions(subject?: string): WorldTransition[] {
    const needle = subject?.toLowerCase();
    const byId = new Map<string, WorldRelation>();
    for (const obs of this.observations) byId.set(obs.id, obs);
    const out: WorldTransition[] = [];
    for (const old of this.observations) {
      if (!old.supersededBy) continue;
      if (needle && old.subject.toLowerCase() !== needle) continue;
      const replacement = byId.get(old.supersededBy);
      if (!replacement) continue;
      out.push({
        subject: old.subject,
        relation: old.relation,
        fromValue: old.object,
        toValue: replacement.object,
        fromObservedAt: old.observedAt ?? old.createdAt,
        toObservedAt: replacement.observedAt ?? replacement.createdAt,
        supersededRelationId: old.id,
        confidence: Math.min(old.confidence, replacement.confidence),
      });
    }
    return out.sort(
      (a, b) =>
        new Date(b.toObservedAt).getTime() - new Date(a.toObservedAt).getTime(),
    );
  }

  /** The subject's state as it stood at time `at`: for each
   *  relation, the latest version OBSERVED at or before `at`.
   *  Reconstructed purely from stamped observations — never
   *  invented. */
  stateAt(subject: string, at: Date): WorldRelation[] {
    const tms = at.getTime();
    const needle = subject.toLowerCase();
    const stamp = (r: WorldRelation) =>
      new Date(r.observedAt ?? r.createdAt).getTime();
    const versions = this.observations
      .filter((r) => r.subject.toLowerCase() === needle)
      .filter((r) => stamp(r) <= tms)
      .sort((a, b) => stamp(a) - stamp(b)); // oldest → newest
    // The LATEST version per relation id that was live before
    // `at`. A superseded version's replacement supersedes it
    // only once the replacement was observed; since both are
    // stamped, "latest observed ≤ at" per (subject,relation)
    // is exactly the state at `at`.
    const liveByRelation = new Map<string, WorldRelation>();
    for (const v of versions) {
      liveByRelation.set(v.relation.toLowerCase(), v);
    }
    return [...liveByRelation.values()].map((r) => ({ ...r }));
  }

  /** Transitions whose NEW observation landed after `since`. */
  changesSince(subject: string, since: Date): WorldTransition[] {
    const sms = since.getTime();
    return this.transitions(subject).filter(
      (t) => new Date(t.toObservedAt).getTime() >= sms,
    );
  }
}

// ---------------------------------------------------------
// TEMPORAL UTILITY (audit HIGH-1 fix): deterministic parsing
// of a state-change claim in owner text, shared by the NLU
// rule cascade and the engine handler. Pure regex + date
// arithmetic; nothing is guessed — an unparsable claim yields
// null and the caller reports that honestly.
// ---------------------------------------------------------

export interface WorldTransition {
  subject: string;
  relation: string;
  fromValue: string;
  toValue: string;
  fromObservedAt: string;
  toObservedAt: string;
  supersededRelationId: string;
  confidence: number;
}

export interface StateChangeClaim {
  subject: string;
  fromState: string;
  fromWhen: "past" | "recent-past" | "dated";
  fromAt: string; // ISO timestamp derived from the phrase
  toState: string;
  toAt: string; // ISO timestamp — now, or the stated date
}

/** Parse "<subject> was <state1> <time-phrase> (and|but)
 *  (now|currently) (it is|it's) <state2>" style claims.
 *  Deterministic; returns null when nothing matches. */
export function parseStateChangeClaim(
  now = new Date(),
): (text: string) => StateChangeClaim | null {
  return (text: string): StateChangeClaim | null => {
    const m = text.match(
      /([a-z][a-z0-9' -]{1,40}?)\s+(?:was|were)\s+([a-z0-9' -]{2,40}?)\s+(yesterday|last (?:week|month|year)|[0-9]{4}-[0-9]{2}-[0-9]{2}(?:[a-z]*))\b[^a-z0-9]*(?:,|and|but)?\s*(?:now|currently|today|at present)\b\s*((?:it is|it's|is|are)\s+)?([a-z0-9' -]{2,40}?)(?:[.?!]|$)/i,
    );
    if (!m) return null;
    // Canonical subject identity: strip leading articles so
    // the recorded subject matches the query extractor
    // ("the site was muddy..." and "how did the site
    // change..." both resolve to subject "site").
    const subject = m[1]
      .trim()
      .replace(/\s+/g, " ")
      .replace(/^(?:the|my|our|a|an)\s+/i, "");
    const fromState = m[2].trim();
    const timePhrase = m[3].toLowerCase().trim();
    const toState = m[5].trim();
    if (!subject || !fromState || !toState) return null;
    const from = new Date(now);
    let fromWhen: StateChangeClaim["fromWhen"] = "dated";
    if (/^last week/.test(timePhrase)) {
      from.setDate(from.getDate() - 7);
      fromWhen = "recent-past";
    } else if (/^last month/.test(timePhrase)) {
      from.setMonth(from.getMonth() - 1);
      fromWhen = "recent-past";
    } else if (/^last year/.test(timePhrase)) {
      from.setFullYear(from.getFullYear() - 1);
      fromWhen = "recent-past";
    } else if (timePhrase === "yesterday") {
      from.setDate(from.getDate() - 1);
      fromWhen = "past";
    }
    return {
      subject,
      fromState,
      fromWhen,
      fromAt: from.toISOString(),
      toState,
      toAt: now.toISOString(),
    };
  };
}
