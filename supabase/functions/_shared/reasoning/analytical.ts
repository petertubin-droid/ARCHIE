// =========================================================
// ARCHIE ADVANCED UNIFIED REASONING ENGINE — ANALYTICAL REASONING
// Spec §3.A: Analytical Reasoning
//
// Enables ARCHIE to examine complex problems systematically:
//   - Problem identification & objective clarification
//   - Constraint & variable extraction
//   - Variable dependency analysis
//   - Root-cause vs symptom investigation
//   - Correlation vs causation discrimination
//   - Multi-variable dependency synthesis
// =========================================================

import type {
  AnalyticalResult,
  ProblemVariable,
  Quantity,
  ReasoningPremise,
  RootCauseFactor,
} from "./types.ts";

/** Extract variables from problem statement and quantitative inputs */
export function extractProblemVariables(
  message: string,
  quantities: Quantity[],
): ProblemVariable[] {
  const vars: ProblemVariable[] = [];
  const seen = new Set<string>();

  // 1. Quantitative variables from parsed quantities
  for (const q of quantities) {
    const name = q.unit ? `${q.dimension.toLowerCase()}_${q.unit}` : `numeric_${q.value}`;
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({
        name,
        type: "QUANTITATIVE",
        currentValue: q.value,
        domain: q.dimension,
        dependencies: [],
      });
    }
  }

  // 2. Named state / categorical / boolean variables via keyword patterns
  const patterns: Array<{ regex: RegExp; name: string; type: ProblemVariable["type"] }> = [
    { regex: /\b(?:cost|budget|price|expense|fee)\b/i, name: "financial_budget", type: "QUANTITATIVE" },
    { regex: /\b(?:time|schedule|deadline|duration|delay)\b/i, name: "temporal_schedule", type: "QUANTITATIVE" },
    { regex: /\b(?:quality|standard|specification|tolerance)\b/i, name: "quality_specification", type: "QUALITATIVE" },
    { regex: /\b(?:risk|hazard|safety|failure)\b/i, name: "risk_profile", type: "CATEGORICAL" },
    { regex: /\b(?:weather|rain|temperature|wind)\b/i, name: "environmental_condition", type: "CATEGORICAL" },
    { regex: /\b(?:material|supply|inventory|stock)\b/i, name: "resource_availability", type: "QUALITATIVE" },
  ];

  for (const p of patterns) {
    if (p.regex.test(message) && !seen.has(p.name)) {
      seen.add(p.name);
      vars.push({
        name: p.name,
        type: p.type,
        dependencies: [],
      });
    }
  }

  return vars;
}

/** Analyze dependencies among variables */
export function analyzeVariableDependencies(
  variables: ProblemVariable[],
  message: string,
): Array<{ from: string; to: string; relation: string }> {
  const deps: Array<{ from: string; to: string; relation: string }> = [];
  const lower = message.toLowerCase();

  const varNames = variables.map((v) => v.name);

  // Cost depends on material and schedule
  if (varNames.includes("financial_budget") && varNames.includes("resource_availability")) {
    deps.push({ from: "resource_availability", to: "financial_budget", relation: "MATERIAL_DRIVES_COST" });
  }
  if (varNames.includes("financial_budget") && varNames.includes("temporal_schedule")) {
    deps.push({ from: "temporal_schedule", to: "financial_budget", relation: "SCHEDULE_DRIVES_COST" });
  }
  // Schedule depends on weather/environment
  if (varNames.includes("environmental_condition") && varNames.includes("temporal_schedule")) {
    deps.push({ from: "environmental_condition", to: "temporal_schedule", relation: "WEATHER_AFFECTS_SCHEDULE" });
  }
  // Risk depends on quality and schedule
  if (varNames.includes("quality_specification") && varNames.includes("risk_profile")) {
    deps.push({ from: "quality_specification", to: "risk_profile", relation: "QUALITY_IMPACTS_RISK" });
  }

  // Explicit dependency cues in text: "X depends on Y", "X caused by Y"
  const depMatches = lower.matchAll(/(\w+)\s+(?:depends on|is determined by|relies on|driven by)\s+(\w+)/gi);
  for (const m of depMatches) {
    deps.push({ from: m[2], to: m[1], relation: "EXPLICIT_TEXT_DEPENDENCY" });
  }

  return deps;
}

/** Investigate root causes vs symptoms */
export function investigateRootCauses(
  message: string,
  facts: ReasoningPremise[],
): { rootCauses: RootCauseFactor[]; symptoms: string[]; notes: string[] } {
  const rootCauses: RootCauseFactor[] = [];
  const symptoms: string[] = [];
  const notes: string[] = [];
  const lower = message.toLowerCase();

  // Symptom indicators: what is observed/reported as malfunctioning or lagging
  const symptomKeywords = [
    { word: "leak", desc: "Water leakage or seepage observed" },
    { word: "crack", desc: "Surface cracking or fissure observed" },
    { word: "delay", desc: "Project delay or schedule slippage" },
    { word: "overrun", desc: "Cost overrun above baseline" },
    { word: "error", desc: "System error or defect recorded" },
    { word: "hot", desc: "Excessive temperature observed" },
    { word: "noise", desc: "Unusual acoustic noise or vibration" },
  ];

  for (const s of symptomKeywords) {
    if (lower.includes(s.word)) {
      symptoms.push(s.desc);
    }
  }

  // Root cause candidate investigation
  if (lower.includes("crack") || lower.includes("leak")) {
    const hasFoundation = /foundation|settlement|soil/i.test(lower);
    const hasMix = /mix ratio|curing|cement|water/i.test(lower);
    const hasDrainage = /drainage|slope|water table/i.test(lower);

    if (hasFoundation) {
      rootCauses.push({
        factor: "Differential foundation settlement or poor soil bearing capacity",
        isRootCause: true,
        confidence: 0.85,
        evidence: facts.filter((f) => /foundation|soil|settle/i.test(f.statement)).map((f) => f.statement),
        symptoms: ["Surface cracking or fissure observed"],
      });
    }
    if (hasMix) {
      rootCauses.push({
        factor: "Suboptimal water-cement ratio or inadequate concrete curing",
        isRootCause: true,
        confidence: 0.8,
        evidence: facts.filter((f) => /curing|cement|mix/i.test(f.statement)).map((f) => f.statement),
        symptoms: ["Surface cracking or fissure observed"],
      });
    }
    if (hasDrainage) {
      rootCauses.push({
        factor: "Improper drainage slope or failing damp-proof membrane",
        isRootCause: true,
        confidence: 0.82,
        evidence: facts.filter((f) => /drainage|dpc|membrane/i.test(f.statement)).map((f) => f.statement),
        symptoms: ["Water leakage or seepage observed"],
      });
    }
  }

  // Check correlation vs causation warnings
  if (/both .* happened|at the same time|coincid/i.test(lower)) {
    notes.push(
      "Warning: Co-occurrence in time detected; verify independent causal mechanism before inferring causation.",
    );
  }

  return { rootCauses, symptoms, notes };
}

/** Perform full analytical reasoning over a problem */
export function performAnalyticalReasoning(
  message: string,
  arg2?: any[],
  arg3?: any[],
): AnalyticalResult & { synthesizedConclusion: string; identifiedProblem: string } {
  let quantities: Quantity[] = [];
  let facts: ReasoningPremise[] = [];

  const a2 = arg2 || [];
  const a3 = arg3 || [];

  if (a2.length > 0 && (a2[0].statement !== undefined || a2[0].epistemicStatus !== undefined || a2[0].state !== undefined)) {
    facts = a2 as ReasoningPremise[];
    quantities = [];
  } else {
    quantities = a2 as Quantity[];
    facts = a3 as ReasoningPremise[];
  }

  const variables = extractProblemVariables(message, quantities);
  const dependencies = analyzeVariableDependencies(variables, message);
  const { rootCauses, symptoms, notes } = investigateRootCauses(message, facts);

  let conclusion = `Analytical examination identified ${variables.length} active variable(s) and ${dependencies.length} dependency relation(s).`;
  if (symptoms.length > 0) {
    conclusion += ` Observed symptom(s): ${symptoms.join("; ")}.`;
  }
  if (rootCauses.length > 0) {
    conclusion += ` Primary root-cause hypothesis: ${rootCauses.map((r) => r.factor).join("; ")}.`;
  } else if (symptoms.length > 0) {
    conclusion += " Root cause requires deeper diagnostic verification to isolate from secondary symptoms.";
  }

  return {
    problemSummary: message.slice(0, 200),
    identifiedProblem: message.slice(0, 200),
    variables,
    dependencies,
    rootCauses,
    symptoms,
    correlationVsCausationNotes: notes,
    conclusion,
    synthesizedConclusion: conclusion,
  };
}

export function performSystematicAnalysis(
  input: {
    problemStatement: string;
    knownVariables?: any[];
    constraints?: any[];
  } | string,
  quantitiesArg?: any[],
  factsArg?: any[],
): any {
  if (typeof input === "string") {
    return performAnalyticalReasoning(input, quantitiesArg || [], factsArg || []);
  }

  const message = input.problemStatement;
  const quantities: any[] = [];
  const facts: any[] = (input.knownVariables || []).map((v: any, idx: number) => ({
    id: `var-${idx + 1}`,
    statement: typeof v === "string" ? v : JSON.stringify(v),
    type: "ESTABLISHED_FACT",
    epistemicStatus: "ESTABLISHED_FACT",
  }));

  const res = performAnalyticalReasoning(message, quantities, facts);

  return {
    ...res,
    identifiedProblem: res.problemSummary,
    componentAnalysis: res.variables.length > 0 ? res.variables : [{ name: "primary_variable", type: "QUALITATIVE" }],
    synthesizedConclusion: res.conclusion,
  };
}
