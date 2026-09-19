// =========================================================
// ARCHIE COGNITIVE ENGINE — CREATION ENGINE
// supabase/functions/_shared/archie-ai/cognitive/creation.ts
//
// Produces permitted outputs: real code scaffolds (unit-test
// scaffolds from static analysis — deterministic), structured
// documents composed from VERIFIED/KNOWN knowledge only,
// calculations via the exact arithmetic tool, and task plans.
// Open-ended generative creation is NOT_IMPLEMENTED and is
// reported honestly — nothing here fakes generation.
// =========================================================

import {
  analyzeSource,
  generateUnitTestScaffold,
} from "../native-engine/coding.ts";
import { redactSecrets } from "./security-integrity.ts";
import type { ImprovementProposal } from "./types.ts";

export type CreationKind =
  "unit-test-scaffold" | "document" | "calculation" | "plan";

export interface CreationRequest {
  kind: CreationKind;
  label: string;
  /** For unit-test-scaffold: path + source. */
  source?: string;
  path?: string;
  /** For document: verified lines to compose from. */
  verifiedLines?: string[];
  /** For calculation: expression (executed by the caller's
   *  arithmetic tool; the creation step formats the result). */
  expression?: string;
  computedValue?: string;
  /** For plan: step list already produced by the Planner. */
  planSteps?: string[];
}

export interface CreationResult {
  kind: CreationKind;
  ok: boolean;
  artifact: string;
  isCode: boolean;
  /** Honest failure/gap note — never a fake artifact. */
  note: string;
}

export class CreationEngine {
  private created = 0;
  private refused = 0;

  create(req: CreationRequest): CreationResult {
    this.created += 1;
    switch (req.kind) {
      case "unit-test-scaffold": {
        if (!req.source || !req.path) {
          this.refused += 1;
          return {
            kind: req.kind,
            ok: false,
            artifact: "",
            isCode: true,
            note: "no source provided — I will not invent code I cannot ground in the real file",
          };
        }
        const analysis = analyzeSource(req.path, req.source);
        const scaffold = generateUnitTestScaffold(req.path, analysis);
        return {
          kind: req.kind,
          ok: true,
          artifact: redactSecrets(scaffold).redacted,
          isCode: true,
          note: "deterministic scaffold derived from static analysis of the real source",
        };
      }
      case "document": {
        const lines = (req.verifiedLines ?? []).filter(Boolean);
        if (lines.length === 0) {
          this.refused += 1;
          return {
            kind: req.kind,
            ok: false,
            artifact: "",
            isCode: false,
            note: "no verified knowledge to compose from — I will not write a document from nothing",
          };
        }
        const body = lines.map((l) => `- ${l}`).join("\n");
        return {
          kind: req.kind,
          ok: true,
          artifact: `# ${req.label}\n\nComposed from validated ARCHIE knowledge:\n\n${body}\n`,
          isCode: false,
          note: `structured document composed from ${lines.length} validated knowledge line(s)`,
        };
      }
      case "calculation": {
        if (req.computedValue === undefined) {
          this.refused += 1;
          return {
            kind: req.kind,
            ok: false,
            artifact: "",
            isCode: false,
            note: "calculation result missing — the deterministic tool must run first",
          };
        }
        return {
          kind: req.kind,
          ok: true,
          artifact: `${req.expression} = ${req.computedValue}`,
          isCode: false,
          note: "exact deterministic computation",
        };
      }
      case "plan": {
        const steps = (req.planSteps ?? []).filter(Boolean);
        if (steps.length === 0) {
          this.refused += 1;
          return {
            kind: req.kind,
            ok: false,
            artifact: "",
            isCode: false,
            note: "no plan steps — the Planner produced nothing executable",
          };
        }
        return {
          kind: req.kind,
          ok: true,
          artifact:
            `Plan for: ${req.label}\n` +
            steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
          isCode: false,
          note: "structured plan from the native planner",
        };
      }
      default: {
        this.refused += 1;
        return {
          kind: req.kind,
          ok: false,
          artifact: "",
          isCode: false,
          note: "creation kind not implemented — reported honestly, never faked",
        };
      }
    }
  }

  /** Honest capability statement for diagnostics. */
  static capability(): {
    implemented: CreationKind[];
    notImplemented: string[];
  } {
    return {
      implemented: ["unit-test-scaffold", "document", "calculation", "plan"],
      notImplemented: [
        "open-ended generative code authoring (full applications from prose) — requires owner-gated evolution of the coding engine",
        "image/design generation — no visual synthesis component exists",
      ],
    };
  }

  stats(): { created: number; refused: number } {
    return { created: this.created, refused: this.refused };
  }
}

/** Improvement proposals are generated by the kernel from
 *  observed weaknesses — proposals ONLY, never auto-applied. */
export function makeProposal(
  weakness: string,
  proposal: string,
  expectedGain: string,
): ImprovementProposal {
  return {
    id: `proposal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    weakness,
    proposal,
    expectedGain,
    status: "proposed",
    createdAt: new Date().toISOString(),
  };
}
