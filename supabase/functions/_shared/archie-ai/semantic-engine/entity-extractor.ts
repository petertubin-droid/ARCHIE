// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — ENTITY EXTRACTOR
// supabase/functions/_shared/archie-ai/semantic-engine/entity-extractor.ts
//
// Extracts dimensions, technical construction materials,
// financial quantities, dates, counts, and spatial locations.
// =========================================================

import type { SemanticEntity, EntityCategory } from "./types.ts";

const MATERIAL_KNOWLEDGE_BASE: Array<{
  id: string;
  names: string[];
  category: string;
  defaultUnit: string;
}> = [
  { id: "mat_portland_cement", names: ["portland cement", "cement", "ordinary portland cement", "opc"], category: "BINDER", defaultUnit: "bags" },
  { id: "mat_sharp_sand", names: ["sharp sand", "sand", "river sand"], category: "FINE_AGGREGATE", defaultUnit: "tons" },
  { id: "mat_granite_gravel", names: ["granite", "gravel", "crushed stone", "coarse aggregate"], category: "COARSE_AGGREGATE", defaultUnit: "tons" },
  { id: "mat_sandcrete_block", names: ["sandcrete block", "sandcrete", "cinder block", "concrete block", "hollow block"], category: "MASONRY", defaultUnit: "units" },
  { id: "mat_rebar", names: ["rebar", "reinforcement", "reinforcing bar", "steel rod", "tmt bar"], category: "STEEL", defaultUnit: "tons" },
  { id: "mat_emulsion_paint", names: ["emulsion paint", "paint", "gloss paint", "primer"], category: "FINISH", defaultUnit: "liters" },
  { id: "mat_ceramic_tile", names: ["ceramic tile", "floor tile", "wall tile", "porcelain tile", "vitrified tile"], category: "FINISH", defaultUnit: "sqm" },
  { id: "mat_floor_screed", names: ["floor screed", "screed", "cement screed"], category: "FINISH", defaultUnit: "sqm" },
];

export function extractEntities(text: string): SemanticEntity[] {
  const entities: SemanticEntity[] = [];
  let match: RegExpExecArray | null;

  // 1. Dimensions (e.g. 12x10, 12 by 10 feet, 8ft height, 4m width, 150mm thickness)
  const compoundDimPattern = /\b(\d+(?:\.\d+)?)\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)(?:\s*(?:by|x|×)\s*(\d+(?:\.\d+)?))?\s*(feet|foot|ft|m|meters?|inches?|in|mm|cm)?\b/gi;
  while ((match = compoundDimPattern.exec(text)) !== null) {
    const raw = match[0];
    const len = parseFloat(match[1]);
    const wid = parseFloat(match[2]);
    const hgt = match[3] ? parseFloat(match[3]) : undefined;
    const unit = match[4] ? match[4].toLowerCase().replace("feet", "ft").replace("foot", "ft").replace("meters", "m").replace("meter", "m") : undefined;

    entities.push({
      category: "DIMENSION",
      rawText: raw,
      normalizedValue: { amount: len * wid, unit: unit ? `${unit}²` : undefined },
      attributes: {
        length: len,
        width: wid,
        height: hgt,
        unit: unit || "unspecified",
        isCompound: true,
      },
      confidence: unit ? 0.95 : 0.70,
      sourceSpan: { start: match.index, end: match.index + raw.length },
    });
  }

  // Single dimensions with explicit labels (e.g. 8 foot wall height, 150mm thickness, 10m length)
  const singleDimPattern = /\b(\d+(?:\.\d+)?)\s*(feet|foot|ft|m|meters?|inches?|in|mm|cm)\s+(?:wall\s+)?(height|length|width|thickness|depth)\b/gi;
  while ((match = singleDimPattern.exec(text)) !== null) {
    const raw = match[0];
    const amount = parseFloat(match[1]);
    const unit = match[2].toLowerCase().replace("feet", "ft").replace("foot", "ft").replace("meters", "m").replace("meter", "m");
    const dimType = match[3].toLowerCase();

    entities.push({
      category: "DIMENSION",
      rawText: raw,
      normalizedValue: { amount, unit, dimensionType: dimType as "length" | "width" | "height" | "thickness" | "depth" | "area" | "volume" },
      attributes: {
        amount,
        unit,
        dimensionType: dimType,
      },
      confidence: 0.95,
      sourceSpan: { start: match.index, end: match.index + raw.length },
    });
  }

  // 2. Technical Construction Materials (Knowledge-Graph Linked)
  for (const mat of MATERIAL_KNOWLEDGE_BASE) {
    for (const name of mat.names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matRegex = new RegExp(`\\b${escaped}\\b`, "gi");
      while ((match = matRegex.exec(text)) !== null) {
        entities.push({
          category: "MATERIAL",
          rawText: match[0],
          normalizedValue: { text: mat.names[0] },
          attributes: {
            materialCategory: mat.category,
            defaultUnit: mat.defaultUnit,
          },
          knowledgeGraphEntityId: mat.id,
          confidence: 0.98,
          sourceSpan: { start: match.index, end: match.index + match[0].length },
        });
      }
    }
  }

  // 3. Financial Quantities (e.g. ₦50,000, $1,200, 50000 NGN, 250 USD)
  const currencyPattern = /(?:(₦|\$|£|€|NGN|USD|GBP|EUR)\s*(\d+(?:,\d{3})*(?:\.\d+)?)|(\d+(?:,\d{3})*(?:\.\d+)?)\s*(₦|\$|£|€|NGN|USD|GBP|EUR))/gi;
  while ((match = currencyPattern.exec(text)) !== null) {
    const raw = match[0];
    const symbol = (match[1] || match[4]).toUpperCase();
    const amountStr = (match[2] || match[3]).replace(/,/g, "");
    const amount = parseFloat(amountStr);

    let standardCurrency = symbol;
    if (symbol === "₦") standardCurrency = "NGN";
    else if (symbol === "$") standardCurrency = "USD";
    else if (symbol === "£") standardCurrency = "GBP";
    else if (symbol === "€") standardCurrency = "EUR";

    entities.push({
      category: "FINANCIAL",
      rawText: raw,
      normalizedValue: { amount, unit: standardCurrency },
      attributes: { currency: standardCurrency, originalSymbol: symbol },
      confidence: 0.98,
      sourceSpan: { start: match.index, end: match.index + raw.length },
    });
  }

  // 4. Quantities / Counts (e.g. 500 blocks, 10 doors, 4 windows, 2 coats, 5 workers, 15 laborers, 10%, 15 percent)
  const countPattern = /\b(\d+)\s*(blocks?|doors?|windows?|coats?|rooms?|floors?|workers?|masons?|laborers?|labourers?|trips?|bags?|sheets?)\b/gi;
  while ((match = countPattern.exec(text)) !== null) {
    const raw = match[0];
    const amount = parseInt(match[1], 10);
    const item = match[2].toLowerCase();

    entities.push({
      category: "QUANTITY",
      rawText: raw,
      normalizedValue: { amount, unit: item },
      attributes: { count: amount, itemType: item },
      confidence: 0.95,
      sourceSpan: { start: match.index, end: match.index + raw.length },
    });
  }

  // 5. Percentages (e.g. 10% waste, 15 percent margin)
  const percentPattern = /\b(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
  while ((match = percentPattern.exec(text)) !== null) {
    const raw = match[0];
    const amount = parseFloat(match[1]);
    entities.push({
      category: "QUANTITY",
      rawText: raw,
      normalizedValue: { amount, unit: "%" },
      attributes: { percentage: amount },
      confidence: 0.98,
      sourceSpan: { start: match.index, end: match.index + raw.length },
    });
  }

  return entities;
}
