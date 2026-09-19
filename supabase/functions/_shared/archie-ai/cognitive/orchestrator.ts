// =========================================================
// ARCHIE COGNITIVE ENGINE — COGNITIVE ORCHESTRATION
// supabase/functions/_shared/archie-ai/cognitive/orchestrator.ts
//
// Coordinates every intelligence capability dynamically: for
// each task it decides which loop phases, reasoning modes,
// retrieval scopes, tools and verification level are
// required, and classifies authority (autonomous-safe vs
// owner-gated). One unified intelligence — this is a router
// inside ARCHIE's kernel, not a sub-agent.
//
// Routes are always emitted in the canonical order of the
// permanent cognitive loop (LOOP_PHASES).
// =========================================================

import { LOOP_PHASES, type CognitiveRoute, type LoopPhase } from "./types.ts";

/** Route a task through the loop. The route is derived from
 *  the understood intent — honest, deterministic routing. */
export function orchestrate(input: {
  intent: string;
  task: string;
  isComplex: boolean;
}): CognitiveRoute {
  const { intent, task, isComplex } = input;
  const lower = task.toLowerCase();
  const needed = new Set<LoopPhase>([
    "PERCEIVE",
    "UNDERSTAND",
    "RETRIEVE",
    "REASON",
    "EVALUATE",
    "REMEMBER",
    "IMPROVE",
  ]);
  let reasoningModes: CognitiveRoute["reasoningModes"] = ["logical"];
  let verificationLevel: CognitiveRoute["verificationLevel"] = "standard";
  let authority: CognitiveRoute["authority"] = "autonomous-safe";
  const rationaleParts: string[] = [];
  const tools: string[] = [];

  switch (intent) {
    case "math_question": {
      needed.add("MODEL");
      needed.add("PLAN");
      needed.add("CREATE");
      needed.add("VERIFY");
      needed.add("ACT");
      needed.add("OBSERVE");
      needed.add("LEARN");
      reasoningModes = ["mathematical", "constraint"];
      tools.push("arithmetic");
      verificationLevel = "strict";
      rationaleParts.push(
        "deterministic computation requires re-execution verification",
      );
      break;
    }
    case "knowledge_query":
    case "howto_guidance": {
      needed.add("MODEL");
      needed.add("VERIFY");
      needed.add("ACT");
      needed.add("OBSERVE");
      needed.add("LEARN");
      if (isComplex) {
        needed.add("PLAN");
        reasoningModes = ["logical", "causal", "comparative"];
        rationaleParts.push(
          "multi-step guidance needs a plan over retrieved knowledge",
        );
      } else {
        reasoningModes = ["logical", "analytical"];
      }
      rationaleParts.push(
        "knowledge answers are verified against the store before presentation",
      );
      break;
    }
    case "teaching": {
      needed.add("MODEL");
      needed.add("VERIFY");
      needed.add("ACT");
      needed.add("OBSERVE");
      needed.add("LEARN");
      rationaleParts.push(
        "owner-taught knowledge enters memory with provenance and conflict detection",
      );
      break;
    }
    case "memory_exclusion": {
      needed.add("MODEL");
      needed.add("VERIFY");
      needed.add("ACT");
      rationaleParts.push(
        "a negated memory directive is honored by storing nothing — refusal is the act",
      );
      break;
    }
    case "correction": {
      needed.add("MODEL");
      needed.add("VERIFY");
      needed.add("ACT");
      needed.add("OBSERVE");
      needed.add("LEARN");
      verificationLevel = "strict";
      rationaleParts.push(
        "a correction must reconcile against everything already stored",
      );
      break;
    }
    case "system_status":
    case "capability_query":
    case "identity_query": {
      needed.add("MODEL");
      reasoningModes = ["analytical"];
      rationaleParts.push(
        "self-reporting is grounded in the real engine state",
      );
      break;
    }
    default: {
      if (/\bcode\b|function|class|bug|error|test/.test(lower)) {
        needed.add("MODEL");
        needed.add("PLAN");
        needed.add("CREATE");
        needed.add("VERIFY");
        needed.add("ACT");
        needed.add("OBSERVE");
        needed.add("LEARN");
        reasoningModes = ["logical", "analytical", "constraint"];
        tools.push("static-analysis");
        verificationLevel = "strict";
        rationaleParts.push(
          "code work requires static analysis and a strict security check",
        );
      } else {
        needed.add("MODEL");
        needed.add("PLAN");
        needed.add("VERIFY");
        needed.add("ACT");
        needed.add("OBSERVE");
        needed.add("LEARN");
        if (isComplex) {
          reasoningModes = ["logical", "causal", "comparative"];
          rationaleParts.push(
            "complex task — full planning over knowledge and world model",
          );
        }
        rationaleParts.push(
          "general conversation still traverses retrieval, reasoning and verification",
        );
      }
    }
  }

  // Consequential markers force owner-gated authority.
  if (
    /\bdeploy|delete|drop|production\s+write|migration|self[- ]modif/.test(
      lower,
    )
  ) {
    authority = "owner-gated";
    rationaleParts.push(
      "task touches consequential operations — owner-gated, propose only",
    );
  }

  return {
    phases: LOOP_PHASES.filter((p) => needed.has(p)),
    reasoningModes,
    retrievalScope: {
      knowledge: true,
      memory: true,
      worldModel: needed.has("MODEL"),
    },
    tools,
    verificationLevel,
    authority,
    rationale: rationaleParts.join("; "),
  };
}
