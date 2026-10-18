// =========================================================
// ARCHIE-NATIVE COPILOT INTERPRETER (owner directive
// 2026-10-18: ARCHIE powers FRELUX)
//
// Gemini is the FRELUX Copilot's primary interpreter, but the
// Copilot must not die when Gemini is unreachable or
// unconfigured: ARCHIE's native interpretation takes over —
// the same honest rules the Gemini prompt enforces, executed
// by rules, not by a model:
//
// 1. NEVER calculate, estimate or invent quantities. Only
//    facts the user explicitly stated are extracted.
// 2. Explicitly stated feet are converted to meters and the
//    conversion is noted in evidence.
// 3. One short follow-up question when key facts are missing.
// 4. "unsupported" for anything the deterministic engines
//    cannot do.
//
// The deterministic engines stay the ONLY calculators: this
// module interprets, it never computes.
// =========================================================

export interface CopilotFact {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  evidence: string;
}

export interface CopilotInterpretation {
  taskType: string;
  facts: CopilotFact[];
  followUpQuestion?: string;
}

const FEET_TO_M = 0.3048;

const TASK_RULES: Array<{ type: string; patterns: RegExp[] }> = [
  // Comparison intent is more specific than a bare material
  // mention — it classifies first.
  {
    type: "finish_compare",
    patterns: [
      /compare.{0,60}(finish|paint|tyrolene|pop|screed)/i,
      /(finish|paint|tyrolene|pop|screed).{0,60}vs\.?\b/i,
    ],
  },
  {
    type: "scenario_compare",
    patterns: [/\bscenarios?\b/i, /\bcompare\b.{0,40}\boptions?\b/i],
  },
  {
    type: "roof_estimate",
    patterns: [/\broof\b/i],
  },
  {
    type: "tyrolene_estimate",
    patterns: [/\btyrolene\b/i],
  },
  {
    type: "pop_estimate",
    patterns: [/\bpop\b/i, /plaster\s+of\s+paris/i],
  },
  {
    type: "screeding_estimate",
    patterns: [/\bscreed(ing|ed)?\b/i],
  },
  {
    type: "tile_estimate",
    patterns: [/\btiles?\b/i, /\btiling\b/i],
  },
  {
    type: "painting_materials",
    patterns: [
      /how (much|many).{0,40}(paint|primer|coat)/i,
      /(paint|primer)s?\s+(needed|required|do i need)/i,
    ],
  },
  {
    type: "painting_estimate",
    patterns: [/\bpaint(ing)?\b/i],
  },
  {
    type: "building_estimate",
    patterns: [
      /\b(build|construct)(ing)?\s+(a|an|my|the|this)\b/i,
      /\b(building|house|bungalow|duplex|storey|story|terrace|detached|semi-?detached)\b/i,
    ],
  },
];

const QUESTION_RULES: RegExp[] = [
  /\?\s*$/,
  /\b(what|how|why|when|which|is|are|does|do|should|can)\b/i,
];

const UNIT_RULES: Array<{
  unit: string;
  label: string;
  pattern: RegExp;
  convert?: (n: number) => number;
}> = [
  {
    unit: "m",
    label: "Length",
    pattern: /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)\b/i,
  },
  {
    unit: "m",
    label: "Length",
    pattern: /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|')\b/i,
    convert: (n) => Math.round(n * FEET_TO_M * 1000) / 1000,
  },
];

const BUILDING_TYPES = [
  "bungalow",
  "duplex",
  "storey",
  "story",
  "terrace",
  "detached",
  "semi-detached",
];

function extractStatedFacts(text: string): CopilotFact[] {
  const facts: CopilotFact[] = [];

  // Bedroom count — only explicitly stated numbers.
  const beds = /\b(\d+)\s*(?:bedroom|bedrooms|bed\s?room)\b/i.exec(text);
  if (beds) {
    facts.push({
      key: "bedrooms",
      label: "Bedrooms",
      value: Number(beds[1]),
      evidence: beds[0],
    });
  }

  // Floor count — "2 storey", "single storey", "two storey".
  const floorWords: Record<string, number> = {
    single: 1,
    double: 2,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
  };
  const floorsWord = /\b(single|double|one|two|three|four)\s*(?:-?\s*)?(?:storey|story|storeys|stories|floor|floors)\b/i.exec(
    text,
  );
  if (floorsWord) {
    facts.push({
      key: "number_of_floors",
      label: "Floors",
      value: floorWords[floorsWord[1].toLowerCase()] ?? 1,
      evidence: floorsWord[0],
    });
  } else {
    const floorsNum = /\b(\d+)\s*(?:storey|story|storeys|stories|floor|floors)\b/i.exec(text);
    if (floorsNum) {
      facts.push({
        key: "number_of_floors",
        label: "Floors",
        value: Number(floorsNum[1]),
        evidence: floorsNum[1] + " floors",
      });
    }
  }

  // Building type.
  for (const t of BUILDING_TYPES) {
    const re = new RegExp(`\\b${t}\\b`, "i");
    const m = re.exec(text);
    if (m) {
      facts.push({
        key: "building_type",
        label: "Building type",
        value: t,
        evidence: m[0],
      });
      break;
    }
  }

  // Length/width/height — only explicitly stated dimensions,
  // with the feet→meter conversion recorded in evidence. The
  // dimension that appears FIRST in the user's text is the
  // primary one; rule order must not decide.
  let best: { rule: (typeof UNIT_RULES)[number]; m: RegExpExecArray } | null =
    null;
  for (const rule of UNIT_RULES) {
    const m = rule.pattern.exec(text);
    if (m && (best === null || m.index < best.m.index)) {
      best = { rule, m };
    }
  }
  if (best) {
    const raw = Number(best.m[1]);
    const value = best.rule.convert ? best.rule.convert(raw) : raw;
    const wasConverted = best.rule.convert !== undefined;
    facts.push({
      key: "length",
      label: best.rule.label,
      value,
      unit: best.rule.unit,
      evidence: wasConverted
        ? `${best.m[0]} (converted: ${raw} ft = ${value} m, stated by user)`
        : best.m[0],
    });
  }

  return facts;
}

function classify(text: string): string {
  for (const rule of TASK_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return rule.type;
    }
  }
  if (QUESTION_RULES.some((p) => p.test(text))) {
    return "project_question";
  }
  return "unsupported";
}

function followUpFor(taskType: string, facts: CopilotFact[]): string | undefined {
  const has = (k: string) => facts.some((f) => f.key === k);
  switch (taskType) {
    case "building_estimate":
      if (!has("building_length") && !has("length")) {
        return "What are the building's length and width in meters?";
      }
      return undefined;
    case "painting_estimate":
    case "painting_materials":
      if (!has("length")) {
        return "What are the wall dimensions (length x width x height) in meters?";
      }
      return undefined;
    case "roof_estimate":
      if (!has("length")) {
        return "What is the roof length and width in meters?";
      }
      return undefined;
    default:
      return undefined;
  }
}

/** Honest native interpretation — extract only stated facts,
 * classify by rules, never calculate. */
export function nativeInterpret(text: string): CopilotInterpretation {
  const clean = text.trim().slice(0, 2000);
  const taskType = classify(clean);
  const facts = extractStatedFacts(clean);
  const interpretation: CopilotInterpretation = { taskType, facts };
  const followUp = followUpFor(taskType, facts);
  if (followUp) interpretation.followUpQuestion = followUp;
  return interpretation;
}
