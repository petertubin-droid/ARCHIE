// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — REFERENCE RESOLVER
// supabase/functions/_shared/archie-ai/semantic-engine/reference-resolver.ts
//
// Resolves cross-turn anaphora ("it", "that one", "previous estimate"),
// ordinals ("the second option"), and dimensional carry-forwards.
// =========================================================

import type { ResolvedReference, ConversationHistoryTurn, SemanticEntity } from "./types.ts";

export function resolveReferences(
  text: string,
  history: ConversationHistoryTurn[] = []
): ResolvedReference[] {
  const references: ResolvedReference[] = [];
  const lower = text.toLowerCase();

  // 1. Pronoun anaphora: "it", "that one", "the same one"
  if (/\b(it|that\s+one|the\s+same)\b/i.test(text)) {
    // Look backward in history for the most recent entity/subject
    let resolvedTarget: string | undefined;
    let turnIdx: number | undefined;

    for (let i = history.length - 1; i >= 0; i--) {
      const turn = history[i];
      if (turn.semanticEntities && turn.semanticEntities.length > 0) {
        resolvedTarget = turn.semanticEntities[0].rawText;
        turnIdx = i;
        break;
      }
      // Fallback: check text for key material or project
      const m = turn.content.match(/\b(room|slab|wall|paint|tiles?|screed|estimate)\b/i);
      if (m) {
        resolvedTarget = m[0];
        turnIdx = i;
        break;
      }
    }

    references.push({
      rawExpression: "it",
      referenceType: "PRONOUN",
      resolvedObjectId: resolvedTarget,
      resolvedValue: resolvedTarget,
      resolutionConfidence: resolvedTarget ? 0.85 : 0.40,
      sourceTurnIndex: turnIdx,
      status: resolvedTarget ? "RESOLVED" : "AMBIGUOUS",
      disambiguationOptions: resolvedTarget ? undefined : ["room", "previous calculation", "selected material"],
    });
  }

  // 2. Ordinal references: "the second option", "the first one", "option 2"
  const ordinalMatch = text.match(/\b(the\s+)?(first|second|third|fourth|1st|2nd|3rd|4th|option\s+[1-4])\b/i);
  if (ordinalMatch) {
    const raw = ordinalMatch[0];
    let index = 0;
    if (/first|1st|option\s+1/i.test(raw)) index = 1;
    else if (/second|2nd|option\s+2/i.test(raw)) index = 2;
    else if (/third|3rd|option\s+3/i.test(raw)) index = 3;
    else if (/fourth|4th|option\s+4/i.test(raw)) index = 4;

    references.push({
      rawExpression: raw,
      referenceType: "ORDINAL",
      resolvedObjectId: `option_${index}`,
      resolvedValue: index,
      resolutionConfidence: 0.90,
      status: "RESOLVED",
    });
  }

  // 3. Dimensional carry-forward: "use the same measurements / dimensions / size"
  if (/\b(same\s+measurements?|same\s+dimensions?|same\s+size|same\s+area)\b/i.test(text)) {
    let priorDimensions: unknown = undefined;
    let turnIdx: number | undefined;

    for (let i = history.length - 1; i >= 0; i--) {
      const turn = history[i];
      const dimMatch = turn.content.match(/\b(\d+(?:\.\d+)?\s*(?:by|x|×)\s*\d+(?:\.\d+)?(?:\s*(?:by|x|×)\s*\d+(?:\.\d+)?)?\s*(?:feet|foot|ft|m|meters?|inches?|in))\b/i);
      if (dimMatch) {
        priorDimensions = dimMatch[0];
        turnIdx = i;
        break;
      }
    }

    references.push({
      rawExpression: "same measurements",
      referenceType: "DIMENSIONAL_ANAPHORA",
      resolvedObjectId: priorDimensions ? "prior_dimensions" : undefined,
      resolvedValue: priorDimensions,
      resolutionConfidence: priorDimensions ? 0.92 : 0.40,
      sourceTurnIndex: turnIdx,
      status: priorDimensions ? "RESOLVED" : "UNRESOLVED",
      disambiguationOptions: priorDimensions ? undefined : ["Please specify room dimensions"],
    });
  }

  return references;
}
