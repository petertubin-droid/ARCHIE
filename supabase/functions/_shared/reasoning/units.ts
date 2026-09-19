// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE — UNITS
//
// Unit and dimension awareness (spec §15). Deterministic,
// table-driven, zero language-model intuition:
//   * parse quantities with units from text
//   * dimension classification (length/area/volume/mass/time/
//     currency/quantity/rate/percentage/angle/temperature)
//   * conversion INSIDE a dimension only
//   * compatibility checks that prevent invalid operations
//     (10 m is never 10 m²)
//
// Currency is NEVER auto-converted (exchange rates are external
// market facts the engine does not invent). Temperature needs
// offset conversion (handled explicitly).
// =========================================================

import type { Dimension, Quantity } from "./types.ts";

interface UnitSpec {
  dimension: Dimension;
  /** Factor to the dimension's canonical unit (1 except
   *  temperature, which converts by formula). */
  factor: number;
  aliases?: string[];
}

// Canonical units: LENGTH m, AREA m², VOLUME m³, MASS kg,
// TIME s, CURRENCY unitless-labeled, QUANTITY count.
const UNIT_TABLE: Record<string, UnitSpec> = {
  // length
  m: { dimension: "LENGTH", factor: 1 },
  meter: { dimension: "LENGTH", factor: 1 },
  meters: { dimension: "LENGTH", factor: 1 },
  metre: { dimension: "LENGTH", factor: 1 },
  metres: { dimension: "LENGTH", factor: 1 },
  cm: { dimension: "LENGTH", factor: 0.01 },
  centimeter: { dimension: "LENGTH", factor: 0.01 },
  centimeters: { dimension: "LENGTH", factor: 0.01 },
  mm: { dimension: "LENGTH", factor: 0.001 },
  km: { dimension: "LENGTH", factor: 1000 },
  ft: { dimension: "LENGTH", factor: 0.3048 },
  foot: { dimension: "LENGTH", factor: 0.3048 },
  feet: { dimension: "LENGTH", factor: 0.3048 },
  in: { dimension: "LENGTH", factor: 0.0254 },
  inch: { dimension: "LENGTH", factor: 0.0254 },
  inches: { dimension: "LENGTH", factor: 0.0254 },
  yd: { dimension: "LENGTH", factor: 0.9144 },
  yard: { dimension: "LENGTH", factor: 0.9144 },
  yards: { dimension: "LENGTH", factor: 0.9144 },
  // area
  "m2": { dimension: "AREA", factor: 1 },
  "m²": { dimension: "AREA", factor: 1 },
  "sqm": { dimension: "AREA", factor: 1 },
  "sq m": { dimension: "AREA", factor: 1 },
  "square meter": { dimension: "AREA", factor: 1 },
  "square meters": { dimension: "AREA", factor: 1 },
  "sqft": { dimension: "AREA", factor: 0.09290304 },
  "sq ft": { dimension: "AREA", factor: 0.09290304 },
  "ft2": { dimension: "AREA", factor: 0.09290304 },
  "ft²": { dimension: "AREA", factor: 0.09290304 },
  "hectare": { dimension: "AREA", factor: 10000 },
  "hectares": { dimension: "AREA", factor: 10000 },
  // volume
  "m3": { dimension: "VOLUME", factor: 1 },
  "m³": { dimension: "VOLUME", factor: 1 },
  "l": { dimension: "VOLUME", factor: 0.001 },
  "liter": { dimension: "VOLUME", factor: 0.001 },
  "liters": { dimension: "VOLUME", factor: 0.001 },
  "litre": { dimension: "VOLUME", factor: 0.001 },
  "litres": { dimension: "VOLUME", factor: 0.001 },
  "ml": { dimension: "VOLUME", factor: 0.000001 },
  "gallon": { dimension: "VOLUME", factor: 0.003785411784 },
  "gallons": { dimension: "VOLUME", factor: 0.003785411784 },
  // mass
  kg: { dimension: "MASS", factor: 1 },
  kilogram: { dimension: "MASS", factor: 1 },
  kilograms: { dimension: "MASS", factor: 1 },
  g: { dimension: "MASS", factor: 0.001 },
  gram: { dimension: "MASS", factor: 0.001 },
  grams: { dimension: "MASS", factor: 0.001 },
  tonne: { dimension: "MASS", factor: 1000 },
  tonnes: { dimension: "MASS", factor: 1000 },
  lb: { dimension: "MASS", factor: 0.45359237 },
  pound: { dimension: "MASS", factor: 0.45359237 },
  pounds: { dimension: "MASS", factor: 0.45359237 },
  // time
  s: { dimension: "TIME", factor: 1 },
  sec: { dimension: "TIME", factor: 1 },
  second: { dimension: "TIME", factor: 1 },
  seconds: { dimension: "TIME", factor: 1 },
  min: { dimension: "TIME", factor: 60 },
  minute: { dimension: "TIME", factor: 60 },
  minutes: { dimension: "TIME", factor: 60 },
  h: { dimension: "TIME", factor: 3600 },
  hr: { dimension: "TIME", factor: 3600 },
  hour: { dimension: "TIME", factor: 3600 },
  hours: { dimension: "TIME", factor: 3600 },
  day: { dimension: "TIME", factor: 86400 },
  days: { dimension: "TIME", factor: 86400 },
  week: { dimension: "TIME", factor: 604800 },
  weeks: { dimension: "TIME", factor: 604800 },
  month: { dimension: "TIME", factor: 2629800 },
  months: { dimension: "TIME", factor: 2629800 },
  year: { dimension: "TIME", factor: 31557600 },
  years: { dimension: "TIME", factor: 31557600 },
  // angle
  "deg": { dimension: "ANGLE", factor: 1 },
  "degree": { dimension: "ANGLE", factor: 1 },
  "degrees": { dimension: "ANGLE", factor: 1 },
  "°": { dimension: "ANGLE", factor: 1 },
  "rad": { dimension: "ANGLE", factor: 57.29577951308232 },
  "radian": { dimension: "ANGLE", factor: 57.29577951308232 },
  "radians": { dimension: "ANGLE", factor: 57.29577951308232 },
  // quantity
  "pieces": { dimension: "QUANTITY", factor: 1 },
  "piece": { dimension: "QUANTITY", factor: 1 },
  "pcs": { dimension: "QUANTITY", factor: 1 },
  "bags": { dimension: "QUANTITY", factor: 1 },
  "bag": { dimension: "QUANTITY", factor: 1 },
  "blocks": { dimension: "QUANTITY", factor: 1 },
  "block": { dimension: "QUANTITY", factor: 1 },
  "units": { dimension: "QUANTITY", factor: 1 },
  "trips": { dimension: "QUANTITY", factor: 1 },
  "trip": { dimension: "QUANTITY", factor: 1 },
  "sheets": { dimension: "QUANTITY", factor: 1 },
  "sheet": { dimension: "QUANTITY", factor: 1 },
  "lengths": { dimension: "QUANTITY", factor: 1 },
  // percentage
  "%": { dimension: "PERCENTAGE", factor: 1 },
  "percent": { dimension: "PERCENTAGE", factor: 1 },
};

// Temperature converts by offset, never by factor.
const TEMPERATURE_UNITS = new Set(["c", "celsius", "f", "fahrenheit", "k", "kelvin"]);

function temperatureDimension(): "TEMPERATURE" {
  return "TEMPERATURE";
}

export function isKnownUnit(unit: string): boolean {
  const key = unit.toLowerCase().trim();
  return key in UNIT_TABLE || TEMPERATURE_UNITS.has(key);
}

/** Classify a unit string to its dimension. Unknown units are
 *  DIMENSIONLESS-labeled as UNKNOWN? NO — honest: they get
 *  "QUANTITY" only when clearly countable; otherwise the
 *  caller must treat the unit as unverified. Here we return
 *  null for unknown units so callers flag them honestly. */
export function dimensionOfUnit(unit: string): Dimension | null {
  const key = unit.toLowerCase().trim();
  if (TEMPERATURE_UNITS.has(key)) return temperatureDimension();
  const spec = UNIT_TABLE[key];
  return spec ? spec.dimension : null;
}

export function dimensionOfQuantity(q: Quantity): Dimension {
  return q.dimension;
}

/** Are two units dimension-compatible? (10 m + 10 ft: yes.
 *  10 m + 10 m²: NEVER — spec §15.) */
export function unitsCompatible(a: string, b: string): boolean {
  const da = dimensionOfUnit(a);
  const db = dimensionOfUnit(b);
  if (da === null || db === null) return false;
  return da === db;
}

/** Convert a value between units of the SAME dimension.
 *  Throws on cross-dimension conversion (invalid operation). */
export function convertQuantity(
  value: number,
  from: string,
  to: string,
): { ok: true; value: number; dimension: Dimension } | { ok: false; error: string } {
  const f = from.toLowerCase().trim();
  const t = to.toLowerCase().trim();
  const df = dimensionOfUnit(f);
  const dt = dimensionOfUnit(t);
  if (df === null || dt === null) {
    return { ok: false, error: `unknown unit "${df === null ? from : to}"` };
  }
  if (df !== dt) {
    return {
      ok: false,
      error: `incompatible units: cannot convert ${from} (${df}) to ${to} (${dt})`,
    };
  }
  if (df === "TEMPERATURE") {
    const celsius = f.startsWith("c")
      ? value
      : f.startsWith("f")
        ? ((value - 32) * 5) / 9
        : value - 273.15;
    const out = t.startsWith("c")
      ? celsius
      : t.startsWith("f")
        ? (celsius * 9) / 5 + 32
        : celsius + 273.15;
    return { ok: true, value: out, dimension: df };
  }
  if (df === "CURRENCY") {
    return {
      ok: false,
      error:
        "currency conversion needs live exchange rates — ARCHIE does not invent them",
    };
  }
  const sf = UNIT_TABLE[f];
  const st = UNIT_TABLE[t];
  if (!sf || !st) return { ok: false, error: `unknown unit ${!sf ? from : to}` };
  const canonical = value * sf.factor;
  return { ok: true, value: canonical / st.factor, dimension: df };
}

/** Extract a quantity (number + unit) from a text fragment.
 *  Deterministic regex; returns null when nothing parseable. */
export function parseQuantity(text: string): Quantity | null {
  const m = text.match(
    /^(-?\d+(?:\.\d+)?)\s*(m²|m³|m2|m3|sqft|sq ft|ft²|ft2|°|%)|[A-Za-z°%²³]{1,12}/,
  );
  if (!m) return null;
  const value = Number(m[1]);
  const unitRaw = m[2] ?? m[3];
  if (!unitRaw) {
    // Bare number — dimensionless quantity (flagged as such).
    return { value, unit: "", dimension: "DIMENSIONLESS" };
  }
  const dimension = dimensionOfUnit(unitRaw);
  if (dimension === null) {
    return { value, unit: unitRaw.toLowerCase(), dimension: "DIMENSIONLESS" };
  }
  return { value, unit: unitRaw.toLowerCase(), dimension };
}

/** Find ALL quantities in a message, with their matched spans.
 *  Used by the math layer to attach units to operands. */
export function findQuantities(text: string): Array<{
  value: number;
  unit: string;
  dimension: Dimension | null;
  index: number;
}> {
  const out: Array<{ value: number; unit: string; dimension: Dimension | null; index: number }> = [];
  const re = /(-?\d+(?:\.\d+)?)\s*(m²|m³|°|%|[A-Za-z][A-Za-z²³°]{0,11})?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const unit = match[2];
    if (!match[1]) continue;
    out.push({
      value: Number(match[1]),
      unit: unit ? unit.toLowerCase() : "",
      dimension: unit ? dimensionOfUnit(unit) : "DIMENSIONLESS",
      index: match.index,
    });
  }
  return out;
}

/** Dimensional analysis for derived operations:
 *  LENGTH × LENGTH → AREA, AREA × LENGTH → VOLUME,
 *  QUANTITY / TIME → RATE, etc. Returns null for
 *  dimensionally invalid combinations. */
export function derivedDimension(
  a: Dimension,
  op: "*" | "/",
  b: Dimension,
): Dimension | null {
  if (a === "DIMENSIONLESS") return op === "/" && b === "DIMENSIONLESS" ? "DIMENSIONLESS" : b;
  if (b === "DIMENSIONLESS") return a;
  if (op === "*") {
    if (a === "LENGTH" && b === "LENGTH") return "AREA";
    if (a === "AREA" && b === "LENGTH") return "VOLUME";
    if (a === "LENGTH" && b === "AREA") return "VOLUME";
    return null;
  }
  if (a === b) return "DIMENSIONLESS";
  if (a === "QUANTITY" && b === "TIME") return "RATE";
  if (a === "LENGTH" && b === "TIME") return "RATE";
  if (a === "AREA" && b === "TIME") return "RATE";
  if (a === "VOLUME" && b === "TIME") return "RATE";
  if (a === "CURRENCY" && b === "QUANTITY") return "CURRENCY";
  return null;
}

/** Can two quantities be added/subtracted? Same dimension
 *  only. Percentages add to percentages, never to raw values. */
export function canOperate(
  a: Quantity,
  op: "+" | "-" | "*" | "/" | "^",
  b: Quantity,
): boolean {
  if (op === "^") return b.dimension === "DIMENSIONLESS";
  if (op === "*" || op === "/") {
    if (a.dimension === "DIMENSIONLESS" || b.dimension === "DIMENSIONLESS") return true;
    if (op === "/" && a.dimension === b.dimension) return true;
    return derivedDimension(a.dimension, op, b.dimension) !== null;
  }
  // + and -: same dimension (unit-compatible), or one side
  // dimensionless percentage applied via explicit "of".
  return a.dimension === b.dimension;
}
