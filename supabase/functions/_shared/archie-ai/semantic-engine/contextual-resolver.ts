// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — CONTEXTUAL RESOLVER
// supabase/functions/_shared/archie-ai/semantic-engine/contextual-resolver.ts
//
// Resolves words according to technical, financial, legal,
// everyday, or regional context. Disambiguates polysemous terms.
// =========================================================

import type { SemanticAmbiguity } from "./types.ts";
import { stem } from "../../lexicon/retrieval.ts";

export interface WordSense {
  senseId: string;
  domain: "ENGINEERING" | "FINANCIAL" | "LEGAL" | "GENERAL" | "PHYSICAL";
  meaning: string;
  contextTriggers: RegExp[];
  priority: number;
}

const POLYSEMOUS_DICTIONARY: Record<string, WordSense[]> = {
  charge: [
    {
      senseId: "charge_electrical",
      domain: "PHYSICAL",
      meaning: "Electric charge / battery state of charge (Coulombs or %)",
      contextTriggers: [/\b(battery|electric|voltage|current|power|kwh|amps?|inverter|solar|circuit)\b/i],
      priority: 1,
    },
    {
      senseId: "charge_financial",
      domain: "FINANCIAL",
      meaning: "Fee, cost, or billing expense for goods/services",
      contextTriggers: [/\b(fee|cost|price|bill|rate|invoice|amount|naira|usd|payment|contractor)\b/i],
      priority: 1,
    },
    {
      senseId: "charge_legal",
      domain: "LEGAL",
      meaning: "Formal accusation or legal indictment",
      contextTriggers: [/\b(court|law|police|crime|accusation|trial|guilty|judge|lawyer)\b/i],
      priority: 1,
    },
    {
      senseId: "charge_instruction",
      domain: "GENERAL",
      meaning: "Command, mandate, or instruction to take action",
      contextTriggers: [/\b(duty|mission|task|instruct|advance|lead|order)\b/i],
      priority: 2,
    },
  ],
  beam: [
    {
      senseId: "beam_structural",
      domain: "ENGINEERING",
      meaning: "Horizontal structural member supporting vertical loads",
      contextTriggers: [/\b(column|slab|concrete|reinforcement|rebar|span|load|lintel|foundation|structure|steel)\b/i],
      priority: 1,
    },
    {
      senseId: "beam_light",
      domain: "PHYSICAL",
      meaning: "Ray of light, illumination or laser projection",
      contextTriggers: [/\b(light|laser|sun|optics|lamp|photon|shine|bright)\b/i],
      priority: 1,
    },
  ],
  cure: [
    {
      senseId: "cure_concrete",
      domain: "ENGINEERING",
      meaning: "Hydration process and moisture maintenance of fresh concrete",
      contextTriggers: [/\b(concrete|mortar|cement|slab|water|days?|strength|hydration|screed)\b/i],
      priority: 1,
    },
    {
      senseId: "cure_medical",
      domain: "GENERAL",
      meaning: "Medical healing or recovery from disease",
      contextTriggers: [/\b(disease|patient|medicine|doctor|health|illness|treatment)\b/i],
      priority: 1,
    },
  ],
  footing: [
    {
      senseId: "footing_foundation",
      domain: "ENGINEERING",
      meaning: "Foundation pad or strip distributing structural load to soil",
      contextTriggers: [/\b(foundation|concrete|trench|pad|soil|depth|bearing|rebar|excavation)\b/i],
      priority: 1,
    },
    {
      senseId: "footing_stance",
      domain: "GENERAL",
      meaning: "Physical balance, stance, or social standing",
      contextTriggers: [/\b(equal|social|step|stand|balance|ground|sure)\b/i],
      priority: 2,
    },
  ],
};

const ABBREVIATIONS: Record<string, { expansion: string; domain: string }> = {
  dpc: { expansion: "Damp Proof Course", domain: "CONSTRUCTION" },
  dpm: { expansion: "Damp Proof Membrane", domain: "CONSTRUCTION" },
  rcc: { expansion: "Reinforced Cement Concrete", domain: "CONSTRUCTION" },
  boq: { expansion: "Bill of Quantities", domain: "CONSTRUCTION_COMMERCE" },
  gfa: { expansion: "Gross Floor Area", domain: "ARCHITECTURE" },
  cad: { expansion: "Computer-Aided Design", domain: "ENGINEERING" },
  bim: { expansion: "Building Information Modeling", domain: "CONSTRUCTION" },
  mep: { expansion: "Mechanical, Electrical, and Plumbing", domain: "ENGINEERING" },
  hvac: { expansion: "Heating, Ventilation, and Air Conditioning", domain: "ENGINEERING" },
  psf: { expansion: "Pounds per Square Foot", domain: "UNITS" },
  psi: { expansion: "Pounds per Square Inch", domain: "UNITS" },
  kn: { expansion: "Kilonewtons", domain: "UNITS" },
};

const REGIONAL_TERMINOLOGY: Record<string, { canonical: string; region: string; description: string }> = {
  sandcrete: { canonical: "sandcrete masonry block", region: "Nigeria / West Africa", description: "Hollow building block made of Portland cement and sand" },
  "sharp sand": { canonical: "sharp sand (coarse aggregate for mortar/concrete)", region: "Nigeria / UK", description: "Coarse sand used in plaster, screed, and concrete" },
  "iron rod": { canonical: "rebar / steel reinforcement bar", region: "Nigeria / West Africa", description: "High-yield deformed steel bar for reinforced concrete" },
  "iron rods": { canonical: "rebar / steel reinforcement bars", region: "Nigeria / West Africa", description: "High-yield deformed steel bars for reinforced concrete" },
  overite: { canonical: "site overseer / foreman", region: "Nigeria", description: "Construction site supervisor" },
  parapet: { canonical: "concrete fascia / parapet wall", region: "Nigeria / West Africa", description: "Continuous concrete roof gutter upstand or wall" },
  hardcore: { canonical: "compacted stone fill", region: "Nigeria / UK", description: "Coarse broken stone compacted under ground slab" },
  "german floor": { canonical: "oversite concrete slab / DPC ground slab", region: "Nigeria", description: "Ground level concrete slab before superstructure blockwork" },
};

export interface ResolvedContextualWord {
  word: string;
  selectedSenseId: string;
  selectedSense: { domain: string; meaning: string; senseId: string };
  domain: string;
  meaning: string;
  confidence: number;
  isAmbiguous: boolean;
  alternativeSenses: string[];
}

export function resolveContextualMeanings(text: string): {
  resolvedWords: ResolvedContextualWord[];
  ambiguities: SemanticAmbiguity[];
  expandedTerms: Array<{ original: string; expanded: string; domain: string }>;
  abbreviations: Array<{ abbreviation: string; expansion: string; expanded?: string; domain: string }>;
  regionalTerms: Array<{ term: string; canonical: string; region: string }>;
} {
  const resolvedWords: ResolvedContextualWord[] = [];
  const ambiguities: SemanticAmbiguity[] = [];
  const expandedTerms: Array<{ original: string; expanded: string; domain: string }> = [];
  const abbreviations: Array<{ abbreviation: string; expansion: string; expanded?: string; domain: string }> = [];
  const regionalTerms: Array<{ term: string; canonical: string; region: string }> = [];

  const lower = text.toLowerCase();
  const tokens = text.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];

  // 1. Abbreviations
  for (const token of tokens) {
    if (ABBREVIATIONS[token]) {
      const match = ABBREVIATIONS[token];
      abbreviations.push({
        abbreviation: token.toUpperCase(),
        expansion: match.expansion,
        expanded: match.expansion,
        domain: match.domain,
      });
      expandedTerms.push({
        original: token,
        expanded: match.expansion,
        domain: match.domain,
      });
    }
  }

  // 2. Regional Terminology
  for (const [term, meta] of Object.entries(REGIONAL_TERMINOLOGY)) {
    if (lower.includes(term)) {
      regionalTerms.push({
        term,
        canonical: meta.canonical,
        region: meta.region,
      });
      expandedTerms.push({
        original: term,
        expanded: meta.canonical,
        domain: meta.region,
      });
    }
  }

  // 3. Polysemy Resolution
  for (const [word, senses] of Object.entries(POLYSEMOUS_DICTIONARY)) {
    const wordPattern = new RegExp(`\\b${word}\\b`, "i");
    if (!wordPattern.test(text)) continue;

    // Check triggers across senses
    const scores = senses.map((s) => {
      let score = 0;
      for (const pat of s.contextTriggers) {
        if (pat.test(text)) score += 2.0;
      }
      return { sense: s, score };
    });

    scores.sort((a, b) => b.score - a.score || a.sense.priority - b.sense.priority);

    const best = scores[0];
    const runnerUp = scores[1];
    const isAmbiguous = best.score === 0 || (runnerUp && best.score === runnerUp.score);

    resolvedWords.push({
      word,
      selectedSenseId: best.sense.senseId,
      selectedSense: {
        domain: best.sense.domain,
        meaning: best.sense.meaning,
        senseId: best.sense.senseId,
      },
      domain: best.sense.domain,
      meaning: best.sense.meaning,
      confidence: isAmbiguous ? 0.50 : 0.90,
      isAmbiguous,
      alternativeSenses: senses.map((s) => s.meaning),
    });

    if (isAmbiguous) {
      ambiguities.push({
        type: "LEXICAL_POLYSEMY",
        ambiguousPhrase: word,
        candidateInterpretations: senses.map((s) => ({
          interpretation: s.meaning,
          confidence: 1 / senses.length,
          implication: `Interpreting as ${s.domain}`,
        })),
        clarificationQuestion: `Did you mean '${word}' in the context of ${senses.map((s) => s.meaning).join(" or ")}?`,
        impactsCorrectness: true,
      });
    }
  }

  return {
    resolvedWords,
    ambiguities,
    expandedTerms,
    abbreviations,
    regionalTerms,
  };
}
