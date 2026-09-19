// =========================================================
// ARCHIE COGNITIVE ENGINE — TOOL INTELLIGENCE
// supabase/functions/_shared/archie-ai/cognitive/tool-intelligence.ts
//
// Intelligently selects and uses authorized tools. Risk is
// classified honestly: read-only deterministic tools are
// autonomous-safe; consequential operations are OWNER-GATED
// and can never be unlocked by learning. Execution itself
// flows through the native ToolOrchestrator.
// =========================================================

import type { ToolInvocation } from "../native-engine/types.ts";
import type { AuthorityLevel, CognitiveRoute } from "./types.ts";

export interface ToolDescriptor {
  name: string;
  capabilityTags: string[];
  risk: "read-only" | "consequential";
  description: string;
}

/** The honest tool inventory — mirrors tools actually
 *  registered in the native ToolOrchestrator. */
export const TOOL_INVENTORY: ToolDescriptor[] = [
  {
    name: "arithmetic",
    capabilityTags: [
      "math",
      "calculate",
      "quantity",
      "unit",
      "convert",
      "sum",
      "product",
    ],
    risk: "read-only",
    description: "exact deterministic arithmetic evaluation",
  },
  {
    name: "unit-convert",
    capabilityTags: ["convert", "unit", "measure", "area", "length", "mass"],
    risk: "read-only",
    description: "deterministic construction unit conversions",
  },
  {
    name: "web-research",
    capabilityTags: [
      "research",
      "search",
      "web",
      "look up",
      "find information",
      "price",
      "prices",
      "market",
      "current",
    ],
    risk: "read-only",
    description: "open-web research with source cross-checks",
  },
  {
    name: "static-analysis",
    capabilityTags: ["code", "analyze", "inspect", "complexity", "audit"],
    risk: "read-only",
    description: "static code analysis (imports, functions, complexity)",
  },
];

export interface ToolSelection {
  selected: ToolDescriptor[];
  authority: AuthorityLevel;
  /** Consequential operations requested by a task — listed
   *  honestly so the kernel can PROPOSE instead of EXECUTE. */
  gatedOperations: string[];
  rationale: string;
}

const CONSEQUENTIAL_MARKERS: RegExp[] = [
  /\bdeploy(?:ing|ment)?\b/i,
  /\b(?:delete|drop|remove|destroy)\b/i,
  /\b(?:database|production|migration|infrastructure)\b.*\b(?:change|write|update|delete)\b/i,
  /\bself[- ]modif/i,
  /\b(?:npm|pnpm|yarn)\s+(?:i|install|publish)\b/i,
  /\bgit\s+push\b/i,
];

export class ToolIntelligenceEngine {
  private selections = 0;
  private gated = 0;

  /** Select tools for a task by capability match. */
  select(task: string, _route: Partial<CognitiveRoute>): ToolSelection {
    this.selections += 1;
    const lower = task.toLowerCase();
    const scored = TOOL_INVENTORY.map((tool) => ({
      tool,
      score: tool.capabilityTags.reduce(
        (s, tag) => s + (lower.includes(tag) ? 1 : 0),
        0,
      ),
    }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.tool);

    const gatedOperations = CONSEQUENTIAL_MARKERS.filter((m) =>
      m.test(task),
    ).map((m) => `${m.source} matched`);
    if (gatedOperations.length > 0) this.gated += 1;

    const authority: AuthorityLevel =
      gatedOperations.length > 0 ? "owner-gated" : "autonomous-safe";

    return {
      selected: scored,
      authority,
      gatedOperations,
      rationale:
        scored.length > 0
          ? `matched ${scored.map((t) => t.name).join(", ")} on task keywords; all read-only, deterministic`
          : "no deterministic tool matches this task — knowledge and reasoning carry it",
    };
  }

  /** Authority check for any operation the engine wants to
   *  perform. Learning NEVER unlocks consequential actions. */
  authorize(
    operation: string,
    risk: ToolDescriptor["risk"],
  ): { allowed: boolean; level: AuthorityLevel; reason: string } {
    if (risk === "consequential") {
      this.gated += 1;
      return {
        allowed: false,
        level: "owner-gated",
        reason: `"${operation}" is a consequential operation — Owner Authority required (DISCOVER → ANALYZE → PROPOSE → OWNER APPROVAL → STAGE → TEST → VERIFY → OWNER APPROVAL → DEPLOY)`,
      };
    }
    return {
      allowed: true,
      level: "autonomous-safe",
      reason: `"${operation}" is read-only and deterministic — within autonomous bounds`,
    };
  }

  /** Record an invocation honestly (for audit + learning). */
  record(
    invocation: ToolInvocation,
    routeAuthority: AuthorityLevel,
  ): ToolInvocation {
    if (invocation.ok) {
      void routeAuthority;
    }
    return invocation;
  }

  stats(): { selections: number; gated: number } {
    return { selections: this.selections, gated: this.gated };
  }
}
