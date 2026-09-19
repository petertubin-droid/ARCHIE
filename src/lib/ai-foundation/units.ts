// =========================================================
// FRELUX AI FOUNDATION, Unit Conversion (AI → engine boundary)
//
// Point 6 of the Phase-2 contract: Copilot inputs must be
// converted into the engine's expected internal units BEFORE the
// calculator runs, and the ENGINE'S OWN conversion conventions
// remain untouched. Some engines (painting, tile, POP) accept a
// `unit` parameter and convert internally per their established
// methodology; for those we pass `unit` through unchanged. For
// engines that only accept metres (roof, build-to-roof), we convert
// feet → metres HERE, at the boundary, and record the conversion as
// provenance on the fact.
//
// Constants match the authoritative engines exactly:
//   - calc.ts / pop-tile-calc.ts use FT_TO_M = 0.3048
// =========================================================

export const FT_TO_M = 0.3048;

/** Canonical unit tokens the Copilot understands. */
export type CopilotLengthUnit = 'm' | 'ft';

/** Normalize common unit spellings to canonical tokens. null = unknown. */
export function normalizeLengthUnit(raw: string | null | undefined): CopilotLengthUnit | null {
  if (!raw) return null;
  const u = raw.trim().toLowerCase();
  if (['m', 'meter', 'meters', 'metre', 'metres'].includes(u)) return 'm';
  if (['ft', 'foot', 'feet', "'"].includes(u)) return 'ft';
  return null;
}

export interface UnitConversionResult {
  value: number;
  /** True when a conversion was applied (provenance is added upstream). */
  converted: boolean;
  /** Human-readable conversion note for the fact's evidence field. */
  evidence?: string;
}

/**
 * Convert a length value from its stated unit into the engine's
 * required unit. Only ft→m is needed (engines work in metres).
 * m→m is a no-op. m→ft is NOT offered, no FRELUX engine needs it
 * at the boundary (engines that support feet convert internally).
 */
export function convertToEngineUnit(
  value: number,
  fromUnit: CopilotLengthUnit | null,
  toUnit: CopilotLengthUnit,
): UnitConversionResult {
  if (!Number.isFinite(value)) {
    return { value, converted: false };
  }
  if (fromUnit === toUnit || fromUnit === null) {
    return { value, converted: false };
  }
  if (fromUnit === 'ft' && toUnit === 'm') {
    const metres = value * FT_TO_M;
    return {
      value: metres,
      converted: true,
      evidence: `Converted ${value} ft → ${metres.toFixed(4)} m (1 ft = ${FT_TO_M} m)`,
    };
  }
  // Unsupported conversion (e.g. m → ft at boundary): refuse loudly,
  // never silently pass mismatched units into an engine.
  return {
    value,
    converted: false,
    evidence: `Unit "${fromUnit}" is not convertible to "${toUnit}" at the engine boundary`,
  };
}
