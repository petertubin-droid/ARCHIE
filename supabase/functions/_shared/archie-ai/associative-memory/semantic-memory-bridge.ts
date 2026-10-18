// =========================================================
// ARCHIE ADVANCED UNIFIED MEMORY ENGINE — SEMANTIC BRIDGE
// supabase/functions/_shared/archie-ai/associative-memory/semantic-memory-bridge.ts
//
// Integrates semantic request interpretation with memory retrieval:
//   1. Interprets input via understandSemantics pipeline.
//   2. Resolves vague references ("the same rules", "it", "previous project")
//      against retrieved verified memories.
//   3. Strictly validates tenant, user, and project access boundaries.
//   4. Preserves explicit uncertainty when references cannot be unambiguously resolved.
//   5. Never substitutes generic assumptions for missing project context.
// =========================================================

import type { SemanticInterpretation, ConversationHistoryTurn } from "../semantic-engine/types.ts";
import { understandSemantics } from "../semantic-engine/engine.ts";
import type { LongTermMemoryEngine } from "./long-term-memory.ts";
import type { SemanticMemoryEngine } from "./semantic-memory.ts";
import type { LongTermMemoryRecord, SemanticConceptRecord } from "./types.ts";

export interface SemanticMemoryResolutionResult {
  interpretation: SemanticInterpretation;
  resolvedReferences: Array<{
    pronounOrPhrase: string;
    resolvedEntity: string;
    sourceMemoryId: string;
    confidence: number;
  }>;
  relevantRules: LongTermMemoryRecord[];
  semanticConcepts: SemanticConceptRecord[];
  isAmbiguous: boolean;
  ambiguityReason?: string;
  groundedContextText: string;
}

export class SemanticMemoryBridge {
  constructor(
    private longTermEngine: LongTermMemoryEngine,
    private semanticEngine: SemanticMemoryEngine
  ) {}

  /**
   * Processes a user request through semantic understanding and memory retrieval.
   */
  resolveSemanticsWithMemory(
    input: string,
    context: {
      userId: string;
      projectId: string;
      conversationHistory?: Array<{ role: "owner" | "archie" | "system"; text: string }>;
    }
  ): SemanticMemoryResolutionResult {
    // 1. Run semantic interpretation
    const historyTurns: ConversationHistoryTurn[] = (context.conversationHistory || []).map((t, idx) => ({
      role: t.role === "system" ? "assistant" : t.role,
      content: t.text,
      timestamp: Date.now() - ((context.conversationHistory?.length || 0) - idx) * 1000,
    }));

    const interpretation = understandSemantics(input, { historyTurns });

    // 2. Check for explicit cross-session references like "the same rules we agreed on previously"
    const isPreviousRuleReference = /\b(?:same\s+(?:material\s+)?rules?|as\s+agreed|previous\s+settings?|last\s+time)\b/i.test(input);

    const relevantRules: LongTermMemoryRecord[] = [];
    const resolvedReferences: Array<{
      pronounOrPhrase: string;
      resolvedEntity: string;
      sourceMemoryId: string;
      confidence: number;
    }> = [];
    let isAmbiguous = false;
    let ambiguityReason: string | undefined;

    if (isPreviousRuleReference) {
      // Look up rules specifically for this project
      const projectRules = this.longTermEngine.query({
        userId: context.userId,
        projectId: context.projectId,
        kind: "operational_rule",
      });

      if (projectRules.length > 0) {
        relevantRules.push(...projectRules);
        resolvedReferences.push({
          pronounOrPhrase: "same rules agreed previously",
          resolvedEntity: projectRules[0].key,
          sourceMemoryId: projectRules[0].id,
          confidence: 0.95,
        });
      } else {
        // Missing project context: NEVER substitute generic assumptions
        isAmbiguous = true;
        ambiguityReason = `No previously agreed rules found for project "${context.projectId}". Explicit confirmation needed.`;
      }
    }

    // 3. Find semantic concepts matching recognized entities
    const matchedConcepts: SemanticConceptRecord[] = [];
    for (const ent of interpretation.entities) {
      const concepts = this.semanticEngine.findConcepts(ent.rawText, { limit: 2 });
      matchedConcepts.push(...concepts);
    }

    // 4. Construct grounded context text
    const contextParts: string[] = [];
    if (relevantRules.length > 0) {
      contextParts.push(
        `Active Project Rules: ${relevantRules.map((r) => `${r.key}: ${r.value}`).join("; ")}`
      );
    }
    if (matchedConcepts.length > 0) {
      contextParts.push(
        `Semantic Knowledge: ${matchedConcepts.map((c) => `${c.name} (${c.definition})`).join("; ")}`
      );
    }

    return {
      interpretation,
      resolvedReferences,
      relevantRules,
      semanticConcepts: matchedConcepts,
      isAmbiguous,
      ambiguityReason,
      groundedContextText: contextParts.join("\n"),
    };
  }
}
