// supabase/functions/_shared/archie-ai/native-engine/domains/registry.ts
// =========================================================
// DOMAIN-SKILL REGISTRY (audit fix 2026-09-11, domain-capture
// removal): construction knowledge — the calculator, the
// construction reasoning rules and the construction planning
// operator — lived INSIDE the general engine, welded to the
// core. Skills are now pluggable: each domain contributes its
// rules, operators and deterministic handlers through this
// registry, and the core engine stays domain-neutral. A skill
// that is not registered yields an honest "capability not
// installed" answer — never a fabricated one.
// =========================================================

import type { Rule, Operator } from "../types.ts";
import type { Intent } from "../nlu.ts";
import type { SeedFact } from "../seed-corpus.ts";

/** Deterministic NLU cascade entry contributed by a skill —
 *  the engine composes these AFTER its own general rules. */
export interface DomainNluRule {
  intent: Intent;
  pattern: RegExp;
  confidence: number;
}

/** Deterministic result of a domain planning operator. */
export interface DomainOperatorExecution {
  status: "executed" | "blocked" | "awaiting-owner" | "proposed";
  result: string;
}

export interface DomainSkill {
  /** Stable skill identifier (e.g. "construction"). */
  id: string;
  /** NLU intents this skill serves. */
  intents: string[];
  /** Reasoning rules contributed to the engine's rule set. */
  rules?: Rule[];
  /** Planning operators contributed to the planner's library. */
  operators?: Operator[];
  /** Deterministic NLU rules for the intent cascade
   *  (domain-capture completion 2026-09-11: domain lexicons
   *  no longer live in the engine's own cascade). */
  nluRules?: DomainNluRule[];
  /** Foundational facts the skill seeds at engine boot
   *  (same corpus constraints as the engine's own seeds). */
  seedFacts?: SeedFact[];
  /** Planner hint: does this goal input carry quantities this
   *  domain plans around? The engine asks; the domain knows
   *  its own lexicon. */
  quantifies?: (input: string) => boolean;
  /** Deterministic execution of a planning operator this
   *  skill contributed. Returns null when the operator is not
   *  this skill's — the first non-null answer wins. */
  executeOperator?: (
    operatorId: string,
    input: string,
  ) => DomainOperatorExecution | null;
  /** Deterministic intent handler. Returns the complete
   *  answer text, or null when the skill declines (the engine
   *  answers honestly instead of guessing). May be async —
   *  skills that observe live external data (market feeds)
   *  resolve before the engine composes the answer. */
  handler(intent: string, input: string): string | Promise<string> | null;
}

export class DomainSkillRegistry {
  private skills = new Map<string, DomainSkill>();

  register(skill: DomainSkill): void {
    this.skills.set(skill.id, skill);
  }

  /** Composed rules of every registered skill. */
  rules(): Rule[] {
    const out: Rule[] = [];
    for (const s of this.skills.values()) out.push(...(s.rules ?? []));
    return out;
  }

  /** Composed operators of every registered skill. */
  operators(): Operator[] {
    const out: Operator[] = [];
    for (const s of this.skills.values()) out.push(...(s.operators ?? []));
    return out;
  }

  ids(): string[] {
    return [...this.skills.keys()];
  }

  /** True when any registered skill serves this intent. */
  serves(intent: string): boolean {
    for (const s of this.skills.values())
      if (s.intents.includes(intent)) return true;
    return false;
  }

  /** Composed NLU rules of every registered skill. */
  nluRules(): DomainNluRule[] {
    const out: DomainNluRule[] = [];
    for (const s of this.skills.values()) out.push(...(s.nluRules ?? []));
    return out;
  }

  /** Composed seed facts of every registered skill. */
  seedFacts(): SeedFact[] {
    const out: SeedFact[] = [];
    for (const s of this.skills.values()) out.push(...(s.seedFacts ?? []));
    return out;
  }

  /** Planner hint: does ANY registered domain see quantities
   *  in this goal input? */
  quantifies(input: string): boolean {
    for (const s of this.skills.values())
      if (s.quantifies?.(input)) return true;
    return false;
  }

  /** Resolve deterministic execution for a planning operator.
   *  First skill to claim it wins; null = no skill owns it. */
  executeOperator(
    operatorId: string,
    input: string,
  ): DomainOperatorExecution | null {
    for (const s of this.skills.values()) {
      const owns = (s.operators ?? []).some((op) => op.id === operatorId);
      if (!owns) continue;
      const out = s.executeOperator?.(operatorId, input);
      if (out) return out;
    }
    return null;
  }

  /** Resolve the deterministic handler for an intent, or null
   *  when no registered skill serves it.
   *
   *  FIX 48 (batch 15, Level 11 audit 2026-09-14) MERGED with
   *  the live-data async extension: the old wrapper collapsed
   *  a skill's decline (`handler` returning null — the
   *  documented "the engine answers honestly instead of
   *  guessing" contract) into an EMPTY STRING, and only the
   *  FIRST serving skill was ever asked. The resolved closure
   *  now asks EVERY serving skill in registration order,
   *  passes a live-data skill's Promise through (it owns its
   *  own honesty in the resolved text), returns the first
   *  non-empty answer — or null when all decline, so the
   *  engine's decline guard answers honestly. */
  handlerFor(
    intent: string,
  ): ((input: string) => string | Promise<string> | null) | null {
    const serving = [...this.skills.values()].filter((s) =>
      s.intents.includes(intent),
    );
    if (serving.length === 0) return null;
    return (input: string): string | Promise<string> | null => {
      for (const s of serving) {
        const answer = s.handler(intent, input);
        if (answer instanceof Promise) return answer;
        if (answer !== null && answer.trim().length > 0) return answer;
      }
      return null;
    };
  }
}
