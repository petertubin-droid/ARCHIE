// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — INTENT CLASSIFIER
// supabase/functions/_shared/archie-ai/semantic-engine/intent-classifier.ts
//
// Identifies user operational intent across 9 categories.
// =========================================================

import type { IntentClassification, IntentCategory, SecurityActionClassification } from "./types.ts";

interface PatternRule {
  category: IntentCategory;
  patterns: RegExp[];
  confidence: number;
  isActionable: boolean;
}

const INTENT_RULES: PatternRule[] = [
  {
    category: "CORRECTION",
    patterns: [
      /\b(actually|wait\s+no|i\s+meant|change\s+(it|that|the\s+dimension|the\s+room|the\s+length|the\s+width|to))\b/i,
      /\b(not\s+\d+|mistake|correction|instead\s+of\s+\d+)\b/i,
      /^no,\s+/i,
    ],
    confidence: 0.90,
    isActionable: true,
  },
  {
    category: "REVISION_OR_CANCELLATION",
    patterns: [
      /\b(cancel|clear|reset|start\s+over|discard|delete\s+calculation|abort)\b/i,
      /\b(undo|remove\s+that)\b/i,
    ],
    confidence: 0.95,
    isActionable: true,
  },
  {
    category: "CALCULATION_REQUEST",
    patterns: [
      /\b(calculate|estimate|compute|quantify|measure|size|how\s+many|how\s+much|tonnage|volume|area)\b/i,
      /\b(calcular|combien\s+coute|combien|berechne|calcola|custe)\b/i,
      /\b(takeoff|boq\s+estimate|material\s+list)\b/i,
    ],
    confidence: 0.95,
    isActionable: true,
  },
  {
    category: "COMPARISON",
    patterns: [
      /\b(compare|versus|vs\.?|difference\s+between|which\s+is\s+(better|cheaper|stronger|more\s+durable))\b/i,
      /\b(pros?\s+and\s+cons?|alternative\s+to)\b/i,
    ],
    confidence: 0.92,
    isActionable: false,
  },
  {
    category: "VALIDATION_AUDIT",
    patterns: [
      /\b(verify|audit|check\s+(my|the)?\s+(code|standard|compliance|design|calculation))\b/i,
      /\b(is\s+this\s+safe|meets?\s+code|eurocode|bs\s*8110|aci\s*318)\b/i,
    ],
    confidence: 0.88,
    isActionable: false,
  },
  {
    category: "TROUBLESHOOTING",
    patterns: [
      /\b(why\s+is\s+(it|the)\s+(failing|cracking|leaking|deflecting))\b/i,
      /\b(honeycombing|settlement|crack|dampness|failure\s+mode)\b/i,
    ],
    confidence: 0.88,
    isActionable: false,
  },
  {
    category: "EXPLANATION",
    patterns: [
      /\b(explain|why\s+do\s+we|how\s+does|walk\s+me\s+through|clarify|what\s+is\s+the\s+reason)\b/i,
      /\b(meaning\s+of|background\s+on)\b/i,
    ],
    confidence: 0.85,
    isActionable: false,
  },
  {
    category: "INFORMATION_QUERY",
    patterns: [
      /\b(what\s+is|what\s+are|tell\s+me\s+about|describe|where\s+is|who\s+is)\b/i,
      /\b(specs?|specifications?|density\s+of|weight\s+of)\b/i,
    ],
    confidence: 0.85,
    isActionable: false,
  },
];

export function classifyIntent(
  text: string,
  securityAction: SecurityActionClassification = "READ_ONLY_INFORMATIONAL"
): IntentClassification {
  if (securityAction === "UNTRUSTED_INJECTION_RISK") {
    return {
      primary: "SECURITY_STOP",
      confidence: 1.0,
      communicativeGoal: text,
      isActionable: false,
      actionRisk: securityAction,
      explanation: "Adversarial pattern or injection attempt intercepted",
      secondary: [],
    };
  }

  // Check matching rules in order of precedence
  for (const rule of INTENT_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(text)) {
        return {
          primary: rule.category,
          confidence: rule.confidence,
          communicativeGoal: text,
          isActionable: rule.isActionable,
          actionRisk: securityAction,
          explanation: `Matched ${rule.category} intent heuristic`,
          secondary: [],
        };
      }
    }
  }

  // Fallback
  return {
    primary: "INFORMATION_QUERY",
    confidence: 0.60,
    communicativeGoal: text,
    isActionable: false,
    actionRisk: securityAction,
    explanation: "General informational inquiry",
    secondary: [],
  };
}
