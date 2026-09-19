// =========================================================
// ARCHIE NATIVE ENGINE — UNIFICATION (VARIABLE BINDING)
// supabase/functions/_shared/archie-ai/native-engine/unify.ts
//
// First-class unification over SPO fact patterns. Patterns may
// contain variables written as "?name" in subject, predicate or
// object positions. Matching a pattern against a fact either
// consumes or extends a binding. This is the single change that
// lets rules GENERALIZE: "if ?x is-a building then ?x needs-a
// foundation" becomes expressible.
//
// Numeric + structured-object unification (audit Phase 2 item
// 4, 2026-09-11): object variables bind not just strings but
// numbers directly, and "typed shape patterns" — plain objects
// whose leaf values are variables — bind against structured
// fact objects one level deep (e.g. { value: "?v", unit: "m" }
// against a fact object { value: 0.05, unit: "m" }). This is
// what unlocks REAL computed rule conclusions (screed volume =
// thickness × area) instead of static description strings.
//
// Classic logic-programming unification, deterministic, fully
// testable, no external model anywhere.
// =========================================================

import type { Fact, FactPattern } from "./types.ts";

/** A bound value: subject/predicate bindings are always
 *  strings (fact subjects/predicates are strings); object
 *  bindings may be a string or a number. */
export type BoundValue = string | number;
export type Binding = Map<string, BoundValue>;

export const VAR_PREFIX = "?";

const VAR_TOKEN_RE = /^\?[a-zA-Z][a-zA-Z0-9_-]*$/;
export function isVar(value: unknown): value is string {
  return typeof value === "string" && VAR_TOKEN_RE.test(value);
}

/** A plain JSON object (not null, not an array) — the only
 *  shape "typed patterns" match against. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extract the variables referenced by a pattern, including
 *  variables nested one level inside a structured object
 *  pattern (e.g. { value: "?v", unit: "m" } exposes "?v"). */
export function patternVars(pattern: FactPattern): string[] {
  const vars: string[] = [];
  if (isVar(pattern.subject)) vars.push(pattern.subject);
  if (isVar(pattern.predicate)) vars.push(pattern.predicate);
  if (isVar(pattern.object)) {
    vars.push(pattern.object);
  } else if (isPlainObject(pattern.object)) {
    for (const v of Object.values(pattern.object)) {
      if (isVar(v)) vars.push(v);
    }
  }
  return vars;
}

/** Does this pattern contain any variable? */
export function hasVars(pattern: FactPattern): boolean {
  return patternVars(pattern).length > 0;
}

/** Object-position pattern kind, resolved once per pattern. */
type ObjectKind = "var" | "shape" | "literal";

/**
 * A pattern pre-resolved to var/literal positions. Perf pass
 * 2026-09-11: matchUnder ran a VAR_TOKEN_RE regex on every
 * position of every candidate fact in the hot loop (~24k
 * regex execs per forward chain at 200 facts — the chain
 * profiled at 6.3ms while deriving NOTHING). Rule patterns
 * are fixed per rule, so each pattern is compiled once and
 * cached; the hot loop is then Map lookups + string equality.
 */
interface CompiledPattern {
  subjectVar: string | null;
  subjectLit: string | undefined;
  predicateVar: string | null;
  predicateLit: string | undefined;
  objectKind: ObjectKind;
  objectVar: string | null;
  objectShape: Record<string, unknown> | null;
  objectLit: unknown;
}

const compileCache = new WeakMap<FactPattern, CompiledPattern>();

function compile(pattern: FactPattern): CompiledPattern {
  const hit = compileCache.get(pattern);
  if (hit) return hit;
  const objectKind: ObjectKind = isVar(pattern.object)
    ? "var"
    : isPlainObject(pattern.object)
      ? "shape"
      : "literal";
  const c: CompiledPattern = {
    subjectVar: isVar(pattern.subject) ? pattern.subject : null,
    subjectLit: isVar(pattern.subject) ? undefined : pattern.subject,
    predicateVar: isVar(pattern.predicate) ? pattern.predicate : null,
    predicateLit: isVar(pattern.predicate) ? undefined : pattern.predicate,
    objectKind,
    objectVar: objectKind === "var" ? (pattern.object as string) : null,
    objectShape:
      objectKind === "shape"
        ? (pattern.object as Record<string, unknown>)
        : null,
    objectLit: objectKind === "literal" ? pattern.object : undefined,
  };
  compileCache.set(pattern, c);
  return c;
}

/** Bind a variable if free; require agreement (by value) if
 *  already bound. The one caller-facing binding primitive —
 *  used by both scalar and shape object matching so "?x bound
 *  to 5 elsewhere in this pattern must stay 5 here" is a single
 *  rule, not duplicated logic. */
function bindVar(binding: Binding, name: string, value: BoundValue): boolean {
  const existing = binding.get(name);
  if (existing === undefined) {
    binding.set(name, value);
    return true;
  }
  return existing === value;
}

/** Match a "shape" object pattern (plain object, some leaf
 *  values variables) against a fact's object one level deep.
 *  Literal keys must match exactly (JSON equality); variable
 *  keys bind to the fact's leaf value when it is a string or
 *  number (never to a nested object/array — one level only,
 *  honestly bounded, not silently deep-unifying). Unmentioned
 *  keys on the fact's object are allowed — the pattern
 *  constrains only what it names. Returns the extended binding
 *  or null on mismatch. */
function matchShape(
  shape: Record<string, unknown>,
  factObject: unknown,
  binding: Binding,
): Binding | null {
  if (!isPlainObject(factObject)) return null;
  const extended: Binding = new Map(binding);
  for (const [key, expected] of Object.entries(shape)) {
    const actual = (factObject as Record<string, unknown>)[key];
    if (isVar(expected)) {
      if (typeof actual !== "string" && typeof actual !== "number") {
        return null;
      }
      if (!bindVar(extended, expected, actual)) return null;
    } else if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      return null;
    }
  }
  return extended;
}

/**
 * Match one pattern against one fact under an existing binding.
 * - literal positions must be equal (subject/predicate: exact;
 *   object: JSON equality — the store's own semantics)
 * - variable positions bind if free, or must agree if already bound
 * - object variables bind to a string OR a number fact object
 * - object "shape" patterns (plain objects with variable leaves)
 *   bind against a structured fact object one level deep
 * Returns the extended binding, or null when the match fails.
 */
export function matchUnder(
  pattern: FactPattern,
  fact: Fact,
  binding: Binding,
): Binding | null {
  const c = compile(pattern);

  // Perf pass 2026-09-11: verify every position against the
  // binding BEFORE allocating the extended Map — the chain loop
  // previously allocated a fresh binding per candidate fact
  // and discarded it on the first mismatch.
  // subject
  if (c.subjectVar !== null) {
    const v = binding.get(c.subjectVar);
    if (v !== undefined && v !== fact.subject) return null;
  } else if (c.subjectLit !== undefined && c.subjectLit !== fact.subject) {
    return null;
  }

  // predicate
  if (c.predicateVar !== null) {
    const v = binding.get(c.predicateVar);
    if (v !== undefined && v !== fact.predicate) return null;
  } else if (
    c.predicateLit !== undefined &&
    c.predicateLit !== fact.predicate
  ) {
    return null;
  }

  // object: three kinds — var (string|number), shape (typed
  // structured pattern), or literal (JSON equality).
  if (c.objectKind === "var") {
    if (typeof fact.object !== "string" && typeof fact.object !== "number") {
      return null;
    }
    const v = binding.get(c.objectVar as string);
    if (v !== undefined && v !== fact.object) return null;
  } else if (c.objectKind === "shape") {
    const shaped = matchShape(
      c.objectShape as Record<string, unknown>,
      fact.object,
      binding,
    );
    if (!shaped) return null;
    // subject/predicate still need applying below; shape's
    // extended binding already carries the object-side vars.
    if (c.subjectVar !== null) shaped.set(c.subjectVar, fact.subject);
    if (c.predicateVar !== null) shaped.set(c.predicateVar, fact.predicate);
    return shaped;
  } else if (c.objectLit !== undefined) {
    if (JSON.stringify(c.objectLit) !== JSON.stringify(fact.object)) {
      return null;
    }
  }

  const extended: Binding = new Map(binding);
  if (c.subjectVar !== null) extended.set(c.subjectVar, fact.subject);
  if (c.predicateVar !== null) extended.set(c.predicateVar, fact.predicate);
  if (c.objectKind === "var") {
    extended.set(c.objectVar as string, fact.object as BoundValue);
  }
  return extended;
}

/** Substitute bound variables into a pattern. Unbound variables
 *  remain verbatim (callers must decide whether that is legal,
 *  e.g. a conclusion may not contain unbound variables). Shape
 *  objects are substituted key-by-key, one level deep. */
export function substitute<T extends FactPattern>(
  pattern: T,
  binding: Binding,
): T {
  const out: FactPattern = { ...pattern };
  // Subject/predicate positions only ever bind strings (fact
  // subjects/predicates are strings by construction); the cast
  // is safe and keeps the FactPattern types honest.
  if (isVar(out.subject) && binding.has(out.subject)) {
    out.subject = binding.get(out.subject) as string;
  }
  if (isVar(out.predicate) && binding.has(out.predicate)) {
    out.predicate = binding.get(out.predicate) as string;
  }
  if (isVar(out.object) && binding.has(out.object)) {
    out.object = binding.get(out.object);
  } else if (isPlainObject(out.object)) {
    const shape = out.object as Record<string, unknown>;
    const substituted: Record<string, unknown> = { ...shape };
    for (const [key, value] of Object.entries(shape)) {
      if (isVar(value) && binding.has(value)) {
        substituted[key] = binding.get(value);
      }
    }
    out.object = substituted;
  }
  return out as T;
}

/** All variables in a pattern that are still unbound (including
 *  variables nested one level inside a structured object). */
export function unboundVars(pattern: FactPattern, binding: Binding): string[] {
  return patternVars(pattern).filter((v) => !binding.has(v));
}

/**
 * Enumerate consistent bindings for a list of premise patterns
 * against a fact store's facts. Deterministic order, bounded so
 * a pathological rule cannot explode the inference budget.
 * Returns the substituted premise facts per binding (for
 * provenance) alongside each binding.
 */
export function enumerateBindings(
  conditions: FactPattern[],
  facts: Fact[],
  cap = 200,
  /** Perf pass 2026-09-11: optional per-condition candidate
   *  narrowing. A condition with a literal subject/predicate
   *  only needs the facts that carry it — the frontier join
   *  previously scanned EVERY fact for EVERY binding, so a
   *  two-condition rule over 200 facts cost up to 40,000
   *  candidate matches even when the second condition's
   *  literal predicate matched nothing. When no narrowing
   *  provider is given the behavior is identical to before. */
  narrow?: (condition: FactPattern) => Fact[],
): Array<{ binding: Binding; premiseFacts: Fact[] }> {
  let frontier: Array<{ binding: Binding; premiseFacts: Fact[] }> = [
    { binding: new Map(), premiseFacts: [] },
  ];
  for (const condition of conditions) {
    const pool = narrow ? narrow(condition) : facts;
    const next: Array<{ binding: Binding; premiseFacts: Fact[] }> = [];
    for (const { binding, premiseFacts } of frontier) {
      for (const fact of pool) {
        const extended = matchUnder(condition, fact, binding);
        if (extended) {
          next.push({
            binding: extended,
            premiseFacts: [...premiseFacts, fact],
          });
          if (next.length >= cap) break;
        }
      }
      if (next.length >= cap) break;
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  return frontier;
}
