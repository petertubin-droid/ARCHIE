// =========================================================
// ARCHIE NATIVE ENGINE — LANGUAGE-MODEL ROUTER (draft
// scaffold, owner directive 2026-09-16).
//
// OWNER CONSTRAINT (directive): draft the router WITHOUT
// adding any external AI model into ARCHIE. Complementary to
// the owner-gated LOCAL model gateway (generative.ts, gap
// A-1): that path calls the owner's OWN model server behind
// the authority gate; this router is the future plug seam for
// providers, shipping with ZERO configured. The router below
// is the PLUGGABLE SEAM a future model plugs into — and the
// DEFAULT ROUTER SHIPS WITH ZERO PROVIDERS. Every composition
// through a real provider would still be:
//   1. LABELED — the result carries provider provenance; it
//      is drafted content, never silent native knowledge.
//   2. INERT — router output is TEXT. It is never executed,
//      never auto-promoted, never authority-bearing; the
//      engine's AUTHORITY CHECK runs in front of execution
//      exactly as it does today (knowledge never escalates
//      action authority — owner directive 2026-09-12).
//   3. BUDGETED — a hard per-router composition budget;
//      over-budget requests refuse honestly.
//   4. HONEST — no provider configured means the router says
//      so, and the native deterministic path answers. It
//      never fakes a model, never claims a composition that
//      did not happen.
// =========================================================

/** A language-model provider — the future plug point. The
 *  default ARCHIE engine registers ZERO of these. */
export interface ModelProvider {
  /** Stable provider id, e.g. "future-owner-model". */
  readonly id: string;
  /** What this provider is — surfaced in diagnostics. */
  readonly description: string;
  /** Real availability check — never claim a working
   *  model you cannot reach. */
  available(): Promise<boolean>;
  /** Generate draft text for an input. Return null on any
   *  failure or refusal — failures fall through honestly. */
  generate(input: string): Promise<string | null>;
}

export interface ModelCompositionRequest {
  /** What the draft is for — surfaced in provenance. */
  task: string;
  /** The input the model should draft from. */
  input: string;
}

export interface ModelComposition {
  /** Did a model actually compose this? Never claimed
   *  otherwise. */
  used: boolean;
  /** Which provider composed (null = none). */
  providerId: string | null;
  /** The drafted text ("" when unused). */
  text: string;
  /** Honest outcome note. */
  note: string;
  /** Budget state — compositions consumed / limit. */
  compositionsUsed: number;
  compositionLimit: number;
}

export interface LLMRouterOptions {
  /** Providers in priority order — tried first to last. */
  providers?: ModelProvider[];
  /** Hard composition budget for this router instance
   *  (default 32 — generous for a session, never unbounded). */
  compositionLimit?: number;
}

/** The model router. Default construction = zero providers =
 * a router that honestly declines every composition. */
export class LLMRouter {
  private readonly providers: ModelProvider[];
  private readonly compositionLimit: number;
  private used = 0;

  constructor(opts: LLMRouterOptions = {}) {
    this.providers = opts.providers ?? [];
    this.compositionLimit = opts.compositionLimit ?? 32;
  }

  /** Registered provider ids — honest diagnostics. */
  providerIds(): string[] {
    return this.providers.map((p) => p.id);
  }

  /** Compose draft text. With no provider configured or none
   *  available this returns used=false and the caller
   *  proceeds on the native deterministic path — behavior is
   *  IDENTICAL to a router-less engine. */
  async compose(
    request: ModelCompositionRequest,
  ): Promise<ModelComposition> {
    const base = {
      used: false,
      providerId: null as string | null,
      text: "",
      compositionsUsed: this.used,
      compositionLimit: this.compositionLimit,
    };
    if (this.providers.length === 0) {
      return {
        ...base,
        note: "no language model configured — ARCHIE remains 100% native; the deterministic composer answered this turn",
      };
    }
    if (this.used >= this.compositionLimit) {
      return {
        ...base,
        note: `model composition budget exhausted (${this.compositionLimit}) — refusing honestly, the native path answers`,
      };
    }
    const attempts: string[] = [];
    for (const provider of this.providers) {
      let ok = false;
      try {
        ok = await provider.available();
      } catch {
        attempts.push(`${provider.id}: availability check failed`);
        continue;
      }
      if (!ok) {
        attempts.push(`${provider.id}: not available`);
        continue;
      }
      let text: string | null = null;
      try {
        text = await provider.generate(request.input);
      } catch (err) {
        attempts.push(
          `${provider.id}: generate failed (${err instanceof Error ? err.message.slice(0, 80) : String(err)})`,
        );
        continue;
      }
      if (text !== null && text.trim().length > 0) {
        this.used += 1;
        return {
          used: true,
          providerId: provider.id,
          text,
          // LABELED + INERT: composed content, subject to the
          // same honesty pipeline and the authority check as
          // every other text ARCHIE handles.
          note: `drafted by "${provider.id}" (${request.task}) — model output is labeled draft content, verified separately, and never authority-bearing`,
          compositionsUsed: this.used,
          compositionLimit: this.compositionLimit,
        };
      }
      attempts.push(`${provider.id}: returned no text`);
    }
    return {
      ...base,
      note: `no language model produced a draft — ${attempts.join("; ")}`,
    };
  }
}

/** The router ARCHIE constructs by default: zero providers.
 *  This is the owner constraint made structural — wiring a
 *  model in requires an explicit engine option with a real
 *  ModelProvider, which no call site passes today. */
export function createDefaultModelRouter(): LLMRouter {
  return new LLMRouter({ providers: [] });
}
