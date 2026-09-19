// =========================================================
// ARCHIE NATIVE ENGINE — KNOWLEDGE (FACT STORE)
//
// Real knowledge acquisition + consolidation:
//   * SPO facts with calibrated confidence + provenance
//   * contradiction detection and confidence arbitration
//   * retrieval by pattern and by salience
//   * consolidation: duplicate merge, decay of stale
//     unvalidated knowledge, promotion of repeated positives
// Every fact states where it came from. Uncertain information
// is never stored as established fact (§3 of the permanent
// Native Intelligence Architecture).
// =========================================================

import type { Fact, FactConflict, FactPattern } from "./types.ts";
import { tokenize } from "./nlu.ts";

// Collision-proof fact ids (audit H3): the old Date.now() +
// per-isolate counter scheme could collide across concurrent
// edge-function isolates, causing PK conflicts and lost
// writes. crypto.randomUUID() is available in Deno, Node and
// the browser, and needs no module-scope runtime state.
function factId(): string {
  return `fact_${crypto.randomUUID()}`;
}

function matchesPattern(fact: Fact, pattern: FactPattern): boolean {
  if (pattern.subject !== undefined && pattern.subject !== fact.subject) {
    return false;
  }
  if (pattern.predicate !== undefined && pattern.predicate !== fact.predicate) {
    return false;
  }
  if (pattern.object !== undefined) {
    if (JSON.stringify(pattern.object) !== JSON.stringify(fact.object)) {
      return false;
    }
  }
  return true;
}

/** Persistent, incrementally-maintained TF-IDF ranking index
 *  over the fact store's textual surface (audit 4.2). The old
 *  `rankFacts` path rebuilt a full TF-IDF index — re-tokenizing
 *  EVERY fact and re-computing corpus doc-frequencies — on
 *  EVERY single retrieval call (measured 41ms/call at 10k facts;
 *  see docs/archie-performance-ledger.md). This index instead:
 *    * tokenizes each fact ONCE, when it is added (cached),
 *    * maintains corpus doc-frequency incrementally (add/remove),
 *    * narrows candidates via an inverted postings list so a
 *      query only scores facts that share at least one term
 *      (facts with zero shared terms always cosine to 0 anyway —
 *      identical result, far less work).
 *  Scoring formula (tf/doclen * idf, cosine) is unchanged from
 *  the original `rankFacts` — this is a scalability fix, not a
 *  ranking-behavior change. */
export class FactRankIndex {
  private docFreq = new Map<string, number>();
  private docs = 0;
  private entries = new Map<
    string,
    {
      fact: Fact;
      tokens: string[];
      tf: Map<string, number>;
      /** Cached ||fv|| under the CURRENT idf state. */
      norm: number;
      /** gen this norm was computed under; !== this.gen ⇒ stale. */
      normGen: number;
    }
  >();
  private postings = new Map<string, Set<string>>();
  /** Bumped on ANY corpus mutation — idf depends on docs/df,
   *  so every cached norm is wholesale suspect after a write.
   *  Norms are recomputed lazily, per doc, only for docs that
   *  actually become query candidates (perf-pass 2026-09-11). */
  private gen = 0;

  private static surfaceTokens(fact: Fact): string[] {
    const surface = `${fact.subject} ${fact.predicate} ${JSON.stringify(fact.object)}`;
    return tokenize(surface);
  }

  private static tfOf(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  }

  size(): number {
    return this.entries.size;
  }

  /** Add or refresh one fact's entry (idempotent). */
  add(fact: Fact): void {
    if (this.entries.has(fact.id)) this.remove(fact.id);
    const tokens = FactRankIndex.surfaceTokens(fact);
    this.entries.set(fact.id, {
      fact,
      tokens,
      tf: FactRankIndex.tfOf(tokens),
      norm: NaN,
      normGen: -1,
    });
    this.docs += 1;
    this.gen += 1;
    for (const term of new Set(tokens)) {
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      let bucket = this.postings.get(term);
      if (!bucket) {
        bucket = new Set();
        this.postings.set(term, bucket);
      }
      bucket.add(fact.id);
    }
  }

  remove(factId: string): void {
    const entry = this.entries.get(factId);
    if (!entry) return;
    this.docs = Math.max(0, this.docs - 1);
    this.gen += 1;
    for (const term of new Set(entry.tokens)) {
      const df = this.docFreq.get(term);
      if (df !== undefined) {
        if (df <= 1) this.docFreq.delete(term);
        else this.docFreq.set(term, df - 1);
      }
      const bucket = this.postings.get(term);
      if (bucket) {
        bucket.delete(factId);
        if (bucket.size === 0) this.postings.delete(term);
      }
    }
    this.entries.delete(factId);
  }

  /** Wholesale rebuild — used only at hydrate/consolidate (rare,
   *  batch operations), never on the per-query hot path. */
  rebuild(facts: Fact[]): void {
    this.docFreq = new Map();
    this.docs = 0;
    this.entries = new Map();
    this.postings = new Map();
    for (const f of facts) this.add(f);
  }

  private idf(term: string): number {
    return Math.log((1 + this.docs) / (1 + (this.docFreq.get(term) ?? 0))) + 1;
  }

  private vectorOf(
    tf: Map<string, number>,
    totalTokens: number,
  ): Map<string, number> {
    const v = new Map<string, number>();
    for (const [t, count] of tf) {
      v.set(t, (count / totalTokens || count) * this.idf(t));
    }
    return v;
  }

  /** Rank facts against a query. Only facts sharing at least one
   *  query term are ever scored (inverted-index candidate
   *  narrowing) — cost scales with query selectivity, not corpus
   *  size.
   *
   *  Perf-pass 2026-09-11 (fused scoring): the previous version
   *  allocated a fresh weight Map for EVERY candidate on EVERY
   *  query and re-computed Math.log idf for every one of the
   *  candidate's terms (measured p50 15.9ms at 10k facts). The
   *  fused path computes the identical cosine — weight(term) =
   *  tf/doclen · idf(term), same summation order as
   *  cosine(qv, vectorOf(tf)) so scores are bit-for-bit equal —
   *  with one query-side map per query, zero per-candidate
   *  allocations, and a per-query idf memo. Verified by the
   *  legacy-equivalence forensic test; see
   *  docs/archie-performance-ledger.md. */
  rank(query: string, k = NATIVE_CONFIG.rankK): Fact[] {
    return this.rankKept(query, k).map((s) => s.fact);
  }

  /** Scored ranking — identical pipeline to rank(), but the
   *  cosine score rides along so callers can apply an honest
   *  relevance floor (a weak TF-IDF top-k is NOT an answer).
   *  rank() output is unchanged (bit-for-bit same order). */
  rankScored(query: string, k = 6): Array<{ fact: Fact; score: number }> {
    return this.rankKept(query, k);
  }

  private rankKept(
    query: string,
    k: number,
  ): Array<{ fact: Fact; score: number }> {
    const qTokens = tokenize(query);
    if (qTokens.length === 0 || this.entries.size === 0) return [];
    const candidateIds = new Set<string>();
    for (const t of new Set(qTokens)) {
      const bucket = this.postings.get(t);
      if (bucket) for (const id of bucket) candidateIds.add(id);
    }
    if (candidateIds.size === 0) return [];

    // Per-query idf memo — Math.log per DISTINCT term, not per
    // (candidate × term) pair.
    const idfMemo = new Map<string, number>();
    const idfOf = (term: string): number => {
      let v = idfMemo.get(term);
      if (v === undefined) {
        v = this.idf(term);
        idfMemo.set(term, v);
      }
      return v;
    };
    // Query weights + norm — the "a" side of cosine().
    const qLen = qTokens.length;
    const qWeights = new Map<string, number>();
    let qNormSq = 0;
    for (const [t, c] of FactRankIndex.tfOf(qTokens)) {
      const w = (c / qLen || c) * idfOf(t);
      qWeights.set(t, w);
      qNormSq += w * w;
    }
    if (qNormSq === 0) return [];
    const qNorm = Math.sqrt(qNormSq);

    // Streaming top-k selection — provably identical output to
    // collect-all + stable-sort + slice(0,k): docs are seen in
    // the same candidate order, a doc enters only on a STRICTLY
    // greater score than the current k-th (stability among
    // exact ties therefore favors the earlier doc, exactly like
    // the stable sort), and the kept set is fully sorted by
    // descending score before return.
    const kept: { fact: Fact; score: number }[] = [];
    const insert = (fact: Fact, score: number) => {
      let j = kept.length;
      kept.push({ fact, score });
      const item = kept[j];
      while (j > 0 && kept[j - 1].score < item.score) {
        kept[j] = kept[j - 1];
        kept[j - 1] = item;
        j -= 1;
      }
      if (kept.length > k) kept.pop();
    };
    for (const id of candidateIds) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      const tf = entry.tf;
      const len = entry.tokens.length;
      // Cached doc norm — one pass over tf, ONLY when this
      // doc's norm is stale (first candidate query after a
      // corpus mutation). Weights are computed with the same
      // (tf/doclen · idf) arithmetic and tf iteration order as
      // the original vectorOf pass — bit-for-bit identical.
      if (entry.normGen !== this.gen) {
        let normSq = 0;
        for (const [t, c] of tf) {
          const w = (c / len || c) * idfOf(t);
          normSq += w * w;
        }
        entry.norm = Math.sqrt(normSq);
        entry.normGen = this.gen;
      }
      if (entry.norm === 0) continue;
      // Dot product in the SAME iteration order as cosine():
      // iterate the query-side map, look up the doc side.
      let dot = 0;
      for (const [t, qw] of qWeights) {
        const c = tf.get(t);
        if (c !== undefined) {
          dot += qw * ((c / len || c) * idfOf(t));
        }
      }
      const score = dot / (qNorm * entry.norm);
      if (score > 0 && (kept.length < k || score > kept[k - 1].score)) {
        insert(entry.fact, score);
      }
    }
    return kept;
  }
}

/** Stable per-instance holder id for consolidation claims. */
const CONSOLIDATION_HOLDER: string =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `fact-store-${crypto.randomUUID()}`
    : "fact-store-fallback";

const CONSOLIDATION_SCOPE = "fact-store-consolidation";

import { NATIVE_CONFIG } from "./config.ts";

/** Relevance floor for a ranked fact to count as an
 *  answer (measured 2026-09-16: token-prior noise <= ~0.097,
 *  genuine subject matches >= ~0.127 — the floor sits
 *  between). A weak TF-IDF top-k is NOT relevant long-term
 *  knowledge. One measured constant shared by every
 *  consumer: the engine's answer gate and ContextMemory's
 *  validated-fact salience (mr-3). */
export const FACT_RELEVANCE_FLOOR = 0.11;

export class FactStore {
  private facts: Fact[] = [];
  // Subject index (perf pass 2026-09-11): query() and about()
  // previously full-scanned every fact — baseline perf showed
  // subject-only and subject+predicate queries at identical
  // 0.27ms/10k-fact latency (pure O(n) scan, the pattern's
  // subject never narrowed candidates). The Map bucket makes
  // subject lookups O(bucket). Maintained at the three mutation
  // sites: push (assert), wholesale replaces (hydrate,
  // consolidate).
  private bySubject = new Map<string, Fact[]>();
  // Perf pass 2026-09-11, entry 5: predicate index for rule
  // condition narrowing (see candidatesFor below).
  private byPredicate = new Map<string, Fact[]>();
  private persistence: PersistenceLike | null = null;
  // HYDRATE CAP: last hydration's honest stats (null before
  // the first hydrate, or when hydration failed).
  private hydrationStats: HydrationStats | null = null;
  // Persistent TF-IDF rank index (audit 4.2) — maintained
  // incrementally alongside the subject/predicate indexes.
  private rankIndex = new FactRankIndex();

  /** Rebuild both indexes from the fact array. */
  private reindex(): void {
    this.bySubject = new Map();
    this.byPredicate = new Map();
    for (const f of this.facts) {
      const sb = this.bySubject.get(f.subject);
      if (sb) sb.push(f);
      else this.bySubject.set(f.subject, [f]);
      const pb = this.byPredicate.get(f.predicate);
      if (pb) pb.push(f);
      else this.byPredicate.set(f.predicate, [f]);
    }
  }

  /** Candidate facts for a rule condition: the most selective
   *  literal index bucket, or every fact when the condition is
   *  fully variable. Used by the forward chainer to avoid the
   *  frontier × all-facts join blowup. */
  candidatesFor(condition: FactPattern): Fact[] {
    if (
      typeof condition.subject === "string" &&
      !condition.subject.startsWith("?")
    ) {
      return this.bySubject.get(condition.subject) ?? [];
    }
    if (
      typeof condition.predicate === "string" &&
      !condition.predicate.startsWith("?")
    ) {
      return this.byPredicate.get(condition.predicate) ?? [];
    }
    return this.list();
  }

  constructor(persistence?: PersistenceLike) {
    this.persistence = persistence ?? null;
  }

  /** Hydrate persisted facts (durable knowledge from previous
   *  sessions). Called at engine construction. */
  async hydrate(): Promise<number> {
    if (!this.persistence) return 0;
    const rows = await this.persistence.loadFacts();
    this.hydrationStats = this.persistence.lastHydrationStats ?? null;
    this.facts = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      qualifiers: (r.qualifiers as Record<string, unknown> | null) ?? undefined,
      confidence: r.confidence,
      provenance: r.provenance,
      status: r.status as Fact["status"],
      validatedCount: r.validated_count ?? 0,
      verifiedBy: (r.verified_by as string[] | null) ?? [],
      createdAt: r.created_at,
    }));
    this.reindex();
    this.rankIndex.rebuild(this.facts);
    return this.facts.length;
  }

  count(): number {
    return this.facts.length;
  }

  /** Honest hydration account — the engine surfaces this in
   *  diagnostics; a truncated hydration is never silent. */
  hydrationAccount(): HydrationStats | null {
    return this.hydrationStats;
  }

  validatedCount(): number {
    return this.facts.filter((f) => f.status === "validated").length;
  }

  list(): Fact[] {
    return [...this.facts];
  }

  /** Rank facts by relevance to a text query via the persistent
   *  incremental TF-IDF index (audit 4.2). Replaces the old
   *  per-query `rankFacts(query, this.facts.list())` rebuild at
   *  every engine call site — see docs/archie-performance-ledger.md
   *  for the measured gain. */
  rank(query: string, k = NATIVE_CONFIG.rankK): Fact[] {
    return this.rankIndex.rank(query, k);
  }

  /** Scored ranking with cosine scores (see FactRankIndex). */
  rankScored(query: string, k = 6): Array<{ fact: Fact; score: number }> {
    return this.rankIndex.rankScored(query, k);
  }

  get(id: string): Fact | undefined {
    return this.facts.find((f) => f.id === id);
  }

  /** Scan-only insert: adds a fact WITHOUT arbitration and
   *  WITHOUT persistence. Used by the verification engine's
   *  contradiction scan — the verifier's job is to DETECT
   *  conflicts between cited facts, not to arbitrate owner
   *  authority. The 2026-09-14 owner-authority learning change
   *  (latest owner teaching wins) made the regular assert()
   *  demote the first cited fact before the scan could see the
   *  contradiction — the scratch store must never arbitrate.
   *  Regression fix 2026-09-14. */
  assertForScan(fact: Omit<Fact, "id" | "validatedCount" | "createdAt">): void {
    const full: Fact = {
      ...fact,
      id: factId(),
      validatedCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.facts.push(full);
    const bucket = this.bySubject.get(full.subject);
    if (bucket) bucket.push(full);
    else this.bySubject.set(full.subject, [full]);
    const pbucket = this.byPredicate.get(full.predicate);
    if (pbucket) pbucket.push(full);
    else this.byPredicate.set(full.predicate, [full]);
    this.rankIndex.add(full);
  }

  /** Assert a fact. Detects contradictions instead of
   *  silently overwriting — knowledge never silently flips. */
  async assert(
    fact: Omit<Fact, "id" | "validatedCount" | "createdAt">,
  ): Promise<{ fact: Fact; conflict?: FactConflict }> {
    const conflict = this.detectConflict(fact);
    const confidence = fact.confidence;
    const status = fact.status;
    // Reinforce agreement instead of duplicating.
    const twin = this.facts.find(
      (f) =>
        f.subject === fact.subject &&
        f.predicate === fact.predicate &&
        JSON.stringify(f.object) === JSON.stringify(fact.object),
    );
    if (twin) {
      // Provenance-differentiated reinforcement (audit H2):
      // agreement from a DIFFERENT source is real corroboration
      // (+0.05); repetition of the SAME source is weak (+0.02)
      // and never establishes knowledge on its own.
      const corroborated = fact.provenance.source !== twin.provenance.source;
      twin.confidence = Math.min(
        1,
        twin.confidence + (corroborated ? 0.05 : 0.02),
      );
      twin.validatedCount += 1;
      if (
        corroborated &&
        !(twin.verifiedBy ?? []).includes(fact.provenance.source)
      ) {
        twin.verifiedBy = [...(twin.verifiedBy ?? []), fact.provenance.source];
      }
      // Promotion gate (audit H1/H2): repetition is not
      // validation — at least one REAL verification event is
      // required before a candidate becomes validated.
      // H-1 (audit fix 2026-09-11): an owner-asserted fact is
      // promoted only by INDEPENDENT corroboration (a second
      // distinct verification source — a different-source
      // agreement, an owner-confirm outcome stamp or an
      // owner-correction stamp) — never by the owner repeating
      // their own assertion.
      const distinctVerificationSources = new Set(twin.verifiedBy ?? []).size;
      const independentlyCorroborated =
        twin.validatedCount >= 2 &&
        twin.confidence >= 0.6 &&
        (twin.verifiedBy ?? []).length > 0 &&
        (twin.status !== "owner-asserted" || distinctVerificationSources >= 2);
      if (independentlyCorroborated) {
        twin.status = "validated";
      }
      await this.persistFact(twin);
      return { fact: twin, conflict };
    }
    // Owner authority and first-party seeds ARE verification
    // events by design (audit H1/H2); research and inference
    // are not — they must earn a verification event.
    const verifiedBy: string[] =
      fact.provenance.source === "owner-taught" ||
      fact.provenance.source === "seed"
        ? [fact.provenance.source]
        : [];
    const full: Fact = {
      ...fact,
      confidence,
      status,
      id: factId(),
      validatedCount: 0,
      verifiedBy,
      createdAt: new Date().toISOString(),
      // Valid-time keys always present so temporal queries can
      // reason about them (tr-2); undefined = no interval.
      validFrom: fact.validFrom,
      validUntil: fact.validUntil,
    };
    if (conflict) {
      // Contradiction handling (P8 owner-wins arbitration):
      // when an OWNER-TAUGHT/SEED fact contradicts facts that
      // are purely DERIVED, the derived ones are parked —
      // the owner's word outranks a rule chain. Only when the
      // conflict reaches non-derived stored knowledge does the
      // newcomer get parked (knowledge never silently flips).
      const incomingAuthoritative =
        fact.provenance.source === "owner-taught" ||
        fact.provenance.source === "seed";
      const conflictingFacts = this.facts.filter((f) =>
        conflict.conflictingFactIds.includes(f.id),
      );
      const conflictsAreAllDerived = conflictingFacts.every(
        (f) => f.status === "derived" || f.provenance.source === "inferred",
      );
      // Forensic fix 2026-09-11 (batch 3, self-model integrity):
      // the seed corpus is the VERSIONED baseline of the
      // currently deployed engine — it re-asserts at every
      // boot, so a stale or adulterated PERSISTED fact (e.g. a
      // poisoned identity row) used to win by insertion order:
      // the seed newcomer parked itself and the persisted fact
      // silently became the standing answer. The seed now
      // outranks stored facts at boot EXCEPT owner corrections
      // (the correction route's deliberate validated
      // replacements, marked provenance note "owner
      // correction: ...") — the owner's explicit current word
      // outranks the corpus, and survives reboots.
      const conflictsContainOwnerCorrection = conflictingFacts.some(
        (f) =>
          typeof f.provenance.note === "string" &&
          f.provenance.note.startsWith("owner correction"),
      );
      if (incomingAuthoritative && conflictsAreAllDerived) {
        for (const cf of conflictingFacts) {
          cf.status = "uncertain";
          await this.persistFact(cf);
        }
        // The authoritative fact is stored live; the derived
        // contradictions were demoted above.
      } else if (
        fact.provenance.source === "seed" &&
        !conflictsContainOwnerCorrection
      ) {
        // The deployment baseline stands; the conflicting
        // stored facts are demoted (history kept, audible).
        for (const cf of conflictingFacts) {
          cf.status = "uncertain";
          await this.persistFact(cf);
        }
      } else if (fact.provenance.source === "owner-taught") {
        // OWNER AUTHORITY (owner directive 2026-09-14): knowledge
        // learning requires NO approval — the owner's LATEST taught
        // fact outranks every standing record, stored or derived.
        // The conflicts are demoted (history kept, audible); the
        // newcomer is stored live. Owner-taught ONLY — the boot
        // seed must never beat a deliberate owner correction
        // (regression fix 2026-09-14: the seed re-asserting at
        // boot was demoting persisted owner corrections here).
        for (const cf of conflictingFacts) {
          cf.status = "uncertain";
          await this.persistFact(cf);
        }
      } else {
        // Park the newcomer as uncertain — never store as established fact.
        full.status = "uncertain";
      }
    }
    this.facts.push(full);
    const bucket = this.bySubject.get(full.subject);
    if (bucket) bucket.push(full);
    else this.bySubject.set(full.subject, [full]);
    const pbucket = this.byPredicate.get(full.predicate);
    if (pbucket) pbucket.push(full);
    else this.byPredicate.set(full.predicate, [full]);
    this.rankIndex.add(full);
    await this.persistFact(full);
    return { fact: full, conflict };
  }

  /** Same SPO, different object value = contradiction. */
  detectConflict(
    fact: Pick<Fact, "subject" | "predicate" | "object">,
  ): FactConflict | undefined {
    const conflicting = this.facts.filter(
      (f) =>
        f.subject === fact.subject &&
        f.predicate === fact.predicate &&
        JSON.stringify(f.object) !== JSON.stringify(fact.object),
    );
    if (conflicting.length === 0) return undefined;
    return {
      kind: "contradiction",
      subject: fact.subject,
      predicate: fact.predicate,
      conflictingFactIds: conflicting.map((f) => f.id),
    };
  }

  query(pattern: FactPattern): Fact[] {
    // Indexed fast path: a literal subject narrows to its bucket
    // (O(bucket) instead of O(facts)). Variable subjects
    // ("?x" — unification path) and subject-less patterns keep
    // the full scan.
    if (
      typeof pattern.subject === "string" &&
      !pattern.subject.startsWith("?")
    ) {
      const bucket = this.bySubject.get(pattern.subject);
      if (!bucket) return [];
      return bucket.filter((f) => matchesPattern(f, pattern));
    }
    return this.facts.filter((f) => matchesPattern(f, pattern));
  }

  /** Subject lookup used for knowledge question answering. */
  about(subject: string): Fact[] {
    const bucket = this.bySubject.get(subject);
    return bucket ? [...bucket] : [];
  }

  /** Consolidation pass (real): merge exact duplicates, decay
   *  stale unvalidated knowledge, promote well-validated
   *  candidates. Returns honest counts. */
  async consolidate(): Promise<{
    merged: number;
    decayed: number;
    promoted: number;
    dropped: number;
    /** REMEDIATION batch 4 (2026-09-13): true when another
     *  writer holds the consolidation claim — this instance
     *  honestly skipped instead of racing it. */
    skipped?: boolean;
  }> {
    // Single-writer gate (remediation batch 4): claim-based
    // mutual exclusion. If another isolate is mid-pass, we
    // skip rather than interleave blind last-writer-wins
    // updates — the next consolidation cycle picks it up.
    let lockHeld = false;
    if (this.persistence?.tryLock) {
      lockHeld = await this.persistence.tryLock(
        CONSOLIDATION_SCOPE,
        CONSOLIDATION_HOLDER,
        120,
      );
      if (!lockHeld) {
        return {
          merged: 0,
          decayed: 0,
          promoted: 0,
          dropped: 0,
          skipped: true,
        };
      }
    }
    try {
      return await this.consolidateInner();
    } finally {
      if (lockHeld && this.persistence?.releaseLock) {
        await this.persistence.releaseLock(
          CONSOLIDATION_SCOPE,
          CONSOLIDATION_HOLDER,
        );
      }
    }
  }

  private async consolidateInner(): Promise<{
    merged: number;
    decayed: number;
    promoted: number;
    dropped: number;
  }> {
    let merged = 0;
    let decayed = 0;
    let promoted = 0;
    let dropped = 0;
    // Valid-time expiry (tr-2): a fact whose validUntil has
    // passed is no longer current knowledge — demote honestly
    // instead of silently retaining it as established.
    const now = new Date();
    for (const fact of this.facts) {
      if (
        fact.validUntil &&
        new Date(fact.validUntil) < now &&
        fact.status !== "uncertain"
      ) {
        fact.status = "uncertain";
        decayed += 1;
      }
    }
    const seen = new Map<string, Fact>();
    const survivors: Fact[] = [];
    for (const fact of this.facts) {
      const key = `${fact.subject}|${fact.predicate}|${JSON.stringify(fact.object)}`;
      const existing = seen.get(key);
      if (existing) {
        existing.confidence = Math.min(
          1,
          existing.confidence + fact.confidence * 0.5,
        );
        existing.validatedCount += fact.validatedCount;
        merged += 1;
        continue;
      }
      seen.set(key, fact);
      survivors.push(fact);
    }
    const finalFacts: Fact[] = [];
    for (const fact of survivors) {
      if (
        fact.status === "candidate" &&
        fact.confidence < 0.15 &&
        fact.validatedCount === 0
      ) {
        dropped += 1;
        continue;
      }
      if (fact.status === "candidate" && fact.confidence > 0.35) {
        fact.confidence = Math.max(0.15, fact.confidence - 0.03);
        decayed += 1;
      }
      if (
        fact.status === "candidate" &&
        fact.validatedCount >= 2 &&
        fact.confidence >= 0.6 &&
        // Verification-event gate (audit H1/H2): never promote
        // on repetition alone.
        (fact.verifiedBy ?? []).length > 0
      ) {
        fact.status = "validated";
        promoted += 1;
      }
      finalFacts.push(fact);
    }
    this.facts = finalFacts;
    this.reindex();
    this.rankIndex.rebuild(this.facts);
    await this.persistAll();
    return { merged, decayed, promoted, dropped };
  }

  private async persistFact(fact: Fact): Promise<void> {
    if (!this.persistence) return;
    await this.persistence.saveFact(fact);
  }

  private async persistAll(): Promise<void> {
    if (!this.persistence) return;
    await this.persistence.saveFacts(this.facts);
  }
}

/** Persistence adapter — implemented by the Supabase-backed
 *  adapter (edge/app) or an in-memory double in tests. */
export interface PersistedFactRow {
  id: string;
  subject: string;
  predicate: string;
  object: unknown;
  qualifiers?: unknown;
  confidence: number;
  provenance: Fact["provenance"];
  status: string;
  validated_count?: number;
  verified_by?: string[] | null;
  created_at: string;
}

/** HYDRATE CAP (owner upgrade 2026-09-16): honest account of
 *  what a hydration loaded — a capped hydration is REPORTED,
 *  never silent. Null = hydration did not complete. */
export interface HydrationStats {
  totalFacts: number;
  loadedFacts: number;
  cap: number;
  truncated: boolean;
}

export interface PersistenceLike {
  loadFacts(): Promise<PersistedFactRow[]>;
  /** Set by implementations that track it (Supabase-backed);
   *  in-memory test fakes omit it. */
  lastHydrationStats?: HydrationStats | null;
  saveFact(fact: Fact): Promise<void>;
  saveFacts(facts: Fact[]): Promise<void>;
  /** REMEDIATION batch 4 (2026-09-13): optional single-writer
   *  claim around consolidation. Implementations backed by a
   *  shared store should provide both; in-memory ones skip. */
  tryLock?(scope: string, holder: string, ttlSeconds: number): Promise<boolean>;
  releaseLock?(scope: string, holder: string): Promise<void>;
}
