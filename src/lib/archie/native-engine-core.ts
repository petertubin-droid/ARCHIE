// =========================================================
// ARCHIE NATIVE INTELLIGENCE ENGINE — APP-SIDE CORE MODULE
// src/lib/archie/native-engine-core.ts
//
// ARCHIE's own native independent intelligence engine is a
// FOUNDATIONAL CORE COMPONENT (owner directive, permanent
// from birth). The engine core lives in the shared runtime
// (supabase/functions/_shared/archie-ai/native-engine/) so
// ARCHIE Core, archie-chat, Coding Studio and the app all run
// THE SAME engine through the provider-agnostic registry —
// one implementation, zero duplication, zero external AI.
//
// This module is the app-side binding: capability catalog
// registration, health-check integration, and direct access
// for app surfaces (PWA, knowledge system, learning UI).
// =========================================================

export {
  ArchieNativeEngine,
  configureNativeEnginePersistence,
  getNativeEngine,
  type ConverseResult,
} from "@studio-shared/archie-ai/native-engine/engine.ts";
export {
  NATIVE_ENGINE_ID,
  manifestSummary,
  nativeEngineCapabilityManifest,
} from "@studio-shared/archie-ai/native-engine/capabilities.ts";
export {
  understand,
  INTENTS,
  type Intent,
} from "@studio-shared/archie-ai/native-engine/nlu.ts";
export {
  FACTS_TABLE,
  OUTCOMES_TABLE,
  SupabasePersistence,
  type SupabaseLike,
} from "@studio-shared/archie-ai/native-engine/persistence.ts";
export {
  analyzeSource,
  generateUnitTestScaffold,
} from "@studio-shared/archie-ai/native-engine/coding.ts";
export { evaluateExpression } from "@studio-shared/archie-ai/native-engine/tools.ts";

import {
  nativeEngineCapabilityManifest,
  manifestSummary,
} from "@studio-shared/archie-ai/native-engine/capabilities.ts";

/** The honest capability summary used by the health check,
 *  diagnostics UI and the owner's system status surface. */
export function nativeEngineStatusSummary(): {
  engineId: string;
  operational: number;
  developing: number;
  notImplemented: number;
  honesty: string;
} {
  const manifest = nativeEngineCapabilityManifest();
  const summary = manifestSummary(manifest);
  return {
    engineId: "archie-native-engine",
    operational: summary.operational,
    developing: summary.developing,
    notImplemented: summary.notImplemented,
    honesty:
      "Real executable architecture with measurable capabilities. " +
      "Not-implemented capabilities are reported, never faked.",
  };
}
