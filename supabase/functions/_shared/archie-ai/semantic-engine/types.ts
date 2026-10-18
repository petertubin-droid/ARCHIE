// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING & LANGUAGE REASONING ENGINE
// supabase/functions/_shared/archie-ai/semantic-engine/types.ts
//
// Typed contract representing user intent, entities, contextual
// meanings, constraints, ambiguities, and authority classifications.
// =========================================================

/** Primary recognized communicative intents */
export type UserIntentType =
  | "INFORMATION_QUERY"       // User is asking a question or seeking knowledge
  | "EXPLANATION"             // User wants reasoning, steps, or explanation
  | "CALCULATION_REQUEST"     // User requests a quantitative/material calculation
  | "ACTION_REQUEST"          // User requests execution of an operational tool/command
  | "INSTRUCTION"             // User provides procedural rules, constraints, or directives
  | "CORRECTION"              // User corrects earlier information or assumption
  | "PREFERENCE_EXPRESSION"   // User expresses a choice, style, or personal rule
  | "COMPARISON"              // User asks to compare alternatives or trade-offs
  | "PREDICTION"              // User asks for outcome forecast, timeline, or projection
  | "CLARIFICATION_REQUEST"   // User asks ARCHIE to explain an ambiguity or question
  | "REVISION_OR_CANCELLATION"// User modifies or cancels a previous request
  | "VALIDATION_AUDIT"        // User requests compliance, verification or audit check
  | "TROUBLESHOOTING"         // User reports or analyzes defects, leaks, cracks, failures
  | "SECURITY_STOP"           // Adversarial injection or security stop
  | "UNKNOWN";                // Undetermined or gibberish intent

/** Action risk & authorization classification */
export type SecurityActionClassification =
  | "READ_ONLY_INFORMATIONAL"  // Safe, no persistent changes or sensitive access
  | "MUTATING_OPERATION"       // Modifies project, estimate, or database state
  | "PRIVILEGED_OPERATION"     // Requires explicit Owner Authority (deployment, billing, keys)
  | "UNTRUSTED_INJECTION_RISK";// Flagged as potential jailbreak, prompt injection, or evasion

export interface SecurityClassification {
  actionType: SecurityActionClassification;
  requiresOwnerAuthority: boolean;
  isInjectionAttempt: boolean;
  injectionConfidence: number;
  flaggedPatterns: string[];
  explanation: string;
}

/** Semantic intent details with secondary possibilities */
export interface SemanticIntent {
  primary: UserIntentType;
  confidence: number;
  secondary?: Array<{ intent: UserIntentType; confidence: number }>;
  communicativeGoal: string;
  isActionable: boolean;
  actionRisk: SecurityActionClassification;
  explanation: string;
}

/** Recognized entity types in technical and architectural reasoning */
export type EntityCategory =
  | "DIMENSION"        // Length, width, height, thickness, radius, depth
  | "MATERIAL"         // Cement, sand, gravel, rebar, paint, tiles, screed, wood
  | "MATERIAL_ROLE"    // Concrete grade, mortar mix, binder, reinforcement
  | "LOCATION"         // Room, floor, grid line, city, regional market code
  | "TEMPORAL"         // Dates, durations, milestones, deadlines, recurrence
  | "FINANCIAL"        // Currency, cost, budget, tax rate, discount, rate
  | "QUANTITY"         // Unitless counts, pack sizes, area, volume
  | "TECHNICAL_CONCEPT"// Structural element, building standard, geotechnical condition
  | "PERSON_OR_ROLE"   // Owner, architect, structural engineer, contractor, mason
  | "DOCUMENT_OR_TOOL" // BOQ, drawings, schedule, CAD, calculation sheet
  | "UNKNOWN";

/** Extracted and resolved entity */
export interface SemanticEntity {
  id?: string;
  category: EntityCategory;
  rawText: string;
  normalizedValue: {
    amount?: number;
    unit?: string;
    text?: string;
    dimensionType?: "length" | "width" | "height" | "thickness" | "depth" | "area" | "volume";
  };
  attributes: Record<string, unknown>;
  lexiconResolvedId?: string;
  knowledgeGraphEntityId?: string;
  confidence: number;
  sourceSpan: { start: number; end: number };
}

/** Reference to prior conversation turns or objects */
export interface ResolvedReference {
  rawExpression: string;       // "it", "that one", "the earlier estimate", "the same dimensions"
  referenceType: "PRONOUN" | "ORDINAL" | "DIMENSIONAL_ANAPHORA" | "PREVIOUS_OUTPUT" | "OBJECT_POINTER";
  resolvedObjectId?: string;
  resolvedValue?: unknown;
  resolutionConfidence: number;
  sourceTurnIndex?: number;
  status: "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED";
  disambiguationOptions?: string[];
}

/** Constraints, negations, and conditions */
export interface SemanticConstraint {
  type: "EXCLUSION" | "CONDITION" | "MINIMUM_BOUND" | "MAXIMUM_BOUND" | "EQUALITY" | "SEQUENCE_ORDER";
  field?: string;
  operator: "NOT" | "UNLESS" | "EXCEPT" | "ONLY_IF" | "AT_LEAST" | "AT_MOST" | "EQUAL" | "BEFORE" | "AFTER";
  targetValue?: unknown;
  unit?: string;
  rawExpression: string;
  polarity: "NEGATIVE" | "AFFIRMATIVE" | "CONDITIONAL";
}

/** Temporal context representation. */
export interface TemporalContext {
  hasTemporal: boolean;
  expressions: Array<{ type: string; text: string }>;
  order: Array<{
    prior: string;
    subsequent: string;
    relationship: "PRECEDES" | "SUCCEEDS" | "SIMULTANEOUS";
  }>;
  eventOrder: Array<{
    prior: string;
    subsequent: string;
    relation: "BEFORE" | "AFTER" | "DURING";
  }>;
  durations: Array<{
    value: number;
    unit: string;
    rawText: string;
    text?: string;
  }>;
  deadline?: string;
  recurrence?: string;
  relativeAnchor?: string;
  tense: "PAST" | "PRESENT" | "FUTURE" | "UNSPECIFIED";
}

/** Detected ambiguity requiring user clarification */
export interface SemanticAmbiguity {
  type: "LEXICAL_POLYSEMY" | "SCOPING_AMBIGUITY" | "UNIT_ABSENCE" | "ANAPHORA_TARGET" | "MISSING_MANDATORY_PARAMETER";
  ambiguousPhrase: string;
  candidateInterpretations: Array<{
    interpretation: string;
    confidence: number;
    implication: string;
  }>;
  clarificationQuestion: string;
  impactsCorrectness: boolean;
}

/** Semantic relationship between two entities or concepts */
export interface SemanticRelationship {
  sourceEntityText: string;
  targetEntityText: string;
  relationshipType: "PART_OF" | "MODIFIES" | "CONSTRAINED_BY" | "LOCATED_IN" | "INPUT_FOR" | "EQUIVALENT_TO";
  confidence: number;
}

/** Downstream routing recommendation for ARCHIE reasoning loop */
export interface DownstreamRoutingRecommendation {
  recommendedModule: "DETERMINISTIC_ENGINE" | "REASONING_LOOP" | "DIRECT_EXPLANATION" | "CLARIFICATION_PROMPT" | "SECURITY_STOP";
  targetEngineId?: string;
  requiredParametersProvided: boolean;
  missingParameters: string[];
  suggestedActionPayload?: Record<string, unknown>;
}

/** Comprehensive, structured semantic interpretation */
export interface SemanticInterpretation {
  originalInput: string;
  normalizedInput: string;
  detectedLanguage: {
    code: string;
    name: string;
    confidence: number;
    isSupported: boolean;
  };
  intent: SemanticIntent;
  security: SecurityClassification;
  confidence: {
    overall: number;
    intentConfidence: number;
    entityConfidence: number;
    referenceConfidence: number;
    isCalibrated: boolean;
  };
  entities: SemanticEntity[];
  references: ResolvedReference[];
  relationships: SemanticRelationship[];
  constraints: SemanticConstraint[];
  temporal: TemporalContext;
  ambiguities: SemanticAmbiguity[];
  missingInformation: {
    requiredParameters: string[];
    taskTarget?: string;
    explanation?: string;
  };
  downstreamRecommendation: DownstreamRoutingRecommendation;
  evidence: {
    lexiconMatches: string[];
    knowledgeGraphLinks: string[];
    contextTraces: string[];
  };
  processingDurationMs: number;
}

/** Contextual turn used for multi-turn reference resolution */
export interface ConversationHistoryTurn {
  role: "user" | "assistant" | "owner" | "archie";
  content: string;
  timestamp?: number;
  semanticEntities?: SemanticEntity[];
  semanticInterpretation?: Partial<SemanticInterpretation>;
}

// Compatibility aliases
export type IntentClassification = SemanticIntent;
export type IntentCategory = UserIntentType;
