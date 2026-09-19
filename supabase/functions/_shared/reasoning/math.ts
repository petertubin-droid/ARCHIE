// =========================================================
// ARCHIE ADVANCED REASONING & PROBLEM-SOLVING ENGINE — MATH
//
// Deterministic mathematical reasoning (spec §14).
// A REAL tokenizer → shunting-yard → AST evaluator:
//   * NO eval(), no Function constructor, no language-model
//     intuition anywhere in the numeric path
//   * arithmetic, percentages, ratios, powers, parentheses
//   * unit-aware operands (spec §15): results carry a
//     dimension derived by dimensional analysis; invalid
//     unit combinations are REJECTED, not guessed
//   * fully reproducible: same input, same output, every time
// =========================================================

import {
  canOperate,
  convertQuantity,
  derivedDimension,
  dimensionOfUnit,
} from "./units.ts";
import type { Dimension, Quantity } from "./types.ts";

type Token =
  | { type: "number"; value: number; unit: string; dimension: Dimension | null }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" };

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "%": 2,
  "^": 3,
};

/** Tokenize an arithmetic expression with optional unit tokens,
 *  e.g. "12 m * 3 m", "(5000 + 200) / 2", "20% of 5000". */
function tokenize(input: string): { tokens: Token[]; error: string | null } {
  const text = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, "");
  const tokens: Token[] = [];
  let i = 0;
  // "X% of Y" → "X% * Y" (percentage applied to a base)
  const normalized = text.replace(
    /(-?\d+(?:\.\d+)?)\s*%\s*of\s*/gi,
    "($1 / 100) * ",
  );
  const src = normalized;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " ") {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const num = /^-?\d+(?:\.\d+)?/.exec(src.slice(i));
      // numbers never start with a minus here; minus is an operator
      const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
      if (!m) return { tokens: [], error: `bad number at ${i}` };
      i += m[0].length;
      // optional unit follows (letters/symbols), e.g. 12 m, 5 kg
      const um = /^(m²|m³|°|[A-Za-z][A-Za-z²³°]{0,11})\b/.exec(src.slice(i));
      let unit = "";
      if (um && !/^[a-wyz]/.test(um[1].toLowerCase()) !== false) {
        // Accept the unit only if it is a known unit — unknown
        // trailing words are ignored (they may be prose).
        if (dimensionOfUnit(um[1]) !== null || /^(m|kg|s|h)$/i.test(um[1])) {
          unit = um[1].toLowerCase();
          i += um[0].length;
        }
      }
      tokens.push({ type: "number", value: Number(m[0]), unit, dimension: unit ? dimensionOfUnit(unit) : "DIMENSIONLESS" });
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "%") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    return { tokens: [], error: `unexpected character "${ch}" at ${i}` };
  }
  return { tokens, error: null };
}

interface ValueNode {
  value: number;
  unit: string;
  dimension: Dimension | null;
}

function applyOperator(op: string, a: ValueNode, b: ValueNode): { ok: true; out: ValueNode } | { ok: false; error: string } {
  const qa: Quantity = { value: a.value, unit: a.unit, dimension: (a.dimension ?? "DIMENSIONLESS") as Dimension };
  const qb: Quantity = { value: b.value, unit: b.unit, dimension: (b.dimension ?? "DIMENSIONLESS") as Dimension };

  if (op === "+" || op === "-" || op === "*") {
    if (!canOperate(qa, op as "+" | "-" | "*", qb)) {
      return {
        ok: false,
        error: `unit mismatch: ${a.value}${a.unit || ""} ${op} ${b.value}${b.unit || ""} combines ${qa.dimension} and ${qb.dimension}`,
      };
    }
  }
  switch (op) {
    case "+": {
      // convert b to a's unit when both have units
      if (a.unit && b.unit && a.unit !== b.unit) {
        const conv = convertQuantity(b.value, b.unit, a.unit);
        if (!conv.ok) return { ok: false, error: conv.error };
        return { ok: true, out: { value: a.value + conv.value, unit: a.unit, dimension: a.dimension } };
      }
      const dim = (a.dimension ?? b.dimension) as Dimension;
      return { ok: true, out: { value: a.value + b.value, unit: a.unit || b.unit, dimension: dim } };
    }
    case "-": {
      if (a.unit && b.unit && a.unit !== b.unit) {
        const conv = convertQuantity(b.value, b.unit, a.unit);
        if (!conv.ok) return { ok: false, error: conv.error };
        return { ok: true, out: { value: a.value - conv.value, unit: a.unit, dimension: a.dimension } };
      }
      const dim = (a.dimension ?? b.dimension) as Dimension;
      return { ok: true, out: { value: a.value - b.value, unit: a.unit || b.unit, dimension: dim } };
    }
    case "*": {
      const dim =
        a.dimension === "DIMENSIONLESS" || a.dimension === null
          ? b.dimension
          : b.dimension === "DIMENSIONLESS"
            ? a.dimension
            : derivedDimension(a.dimension, "*", b.dimension);
      if (dim === null) {
        return {
          ok: false,
          error: `dimensional error: ${a.dimension} × ${b.dimension} is not a supported derived dimension`,
        };
      }
      // PERCENTAGE behaves as a scalar in multiplication
      const av = a.dimension === "PERCENTAGE" ? a.value / 100 : a.value;
      const bv = b.dimension === "PERCENTAGE" ? b.value / 100 : b.value;
      const unit =
        a.unit && b.unit && a.dimension !== "PERCENTAGE" && b.dimension !== "PERCENTAGE"
          ? `${a.unit}·${b.unit}`
          : a.dimension === "PERCENTAGE"
            ? b.unit
            : a.unit;
      return { ok: true, out: { value: av * bv, unit, dimension: dim } };
    }
    case "%":
    case "/": {
      if (b.value === 0) {
        return { ok: false, error: "mathematical impossibility: division by zero" };
      }
      if (a.dimension === b.dimension && a.dimension !== "DIMENSIONLESS" && a.unit && b.unit && a.unit !== b.unit) {
        const conv = convertQuantity(b.value, b.unit, a.unit);
        if (!conv.ok) return { ok: false, error: conv.error };
        return { ok: true, out: { value: a.value / conv.value, unit: "", dimension: "DIMENSIONLESS" } };
      }
      const dim =
        a.dimension === b.dimension
          ? "DIMENSIONLESS"
          : derivedDimension((a.dimension ?? "DIMENSIONLESS") as Dimension, "/", (b.dimension ?? "DIMENSIONLESS") as Dimension);
      if (dim === null) {
        return {
          ok: false,
          error: `dimensional error: ${a.dimension} / ${b.dimension} is not a supported derived dimension`,
        };
      }
      return { ok: true, out: { value: a.value / b.value, unit: a.unit && !b.unit ? `${a.unit}` : "", dimension: dim } };
    }
    case "^": {
      if (b.dimension !== "DIMENSIONLESS") {
        return { ok: false, error: "exponent must be dimensionless" };
      }
      return { ok: true, out: { value: Math.pow(a.value, b.value), unit: a.unit, dimension: a.dimension } };
    }
    default:
      return { ok: false, error: `unsupported operator ${op}` };
  }
}

/** Evaluate an arithmetic expression deterministically.
 *  Returns the numeric result with unit/dimension, or an
 *  honest error. NEVER guesses through model intuition. */
export function evaluateExpression(
  expr: string,
): { ok: true; value: number; unit: string; dimension: Dimension | null; steps: string[] } | { ok: false; error: string } {
  const { tokens, error } = tokenize(expr);
  if (error) return { ok: false, error };
  if (tokens.length === 0) return { ok: false, error: "empty expression" };

  // shunting-yard to RPN
  const output: Token[] = [];
  const stack: Token[] = [];
  let prev: Token | null = null;
  for (const tok of tokens) {
    if (tok.type === "number") {
      output.push(tok);
    } else if (tok.type === "op") {
      // unary minus/plus: when no operand precedes
      if (
        (tok.value === "-" || tok.value === "+") &&
        (prev === null || prev.type === "op" || prev.type === "lparen")
      ) {
        output.push({ type: "number", value: 0, unit: "", dimension: "DIMENSIONLESS" });
      }
      while (
        stack.length > 0 &&
        stack[stack.length - 1].type === "op" &&
        PRECEDENCE[(stack[stack.length - 1] as { value: string }).value] >=
          PRECEDENCE[tok.value]
      ) {
        output.push(stack.pop()!);
      }
      stack.push(tok);
    } else if (tok.type === "lparen") {
      stack.push(tok);
    } else {
      // rparen
      let found = false;
      while (stack.length > 0) {
        const top = stack.pop()!;
        if (top.type === "lparen") {
          found = true;
          break;
        }
        output.push(top);
      }
      if (!found) return { ok: false, error: "unbalanced parentheses" };
    }
    prev = tok;
  }
  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.type === "lparen") return { ok: false, error: "unbalanced parentheses" };
    output.push(top);
  }

  // RPN evaluation with provenance steps
  const evalStack: ValueNode[] = [];
  const steps: string[] = [];
  for (const tok of output) {
    if (tok.type === "number") {
      evalStack.push({ value: tok.value, unit: tok.unit, dimension: tok.dimension });
    } else if (tok.type === "op") {
      const b = evalStack.pop();
      const a = evalStack.pop();
      if (a === undefined || b === undefined) {
        return { ok: false, error: `malformed expression near "${tok.value}"` };
      }
      const res = applyOperator(tok.value, a, b);
      if (!res.ok) return { ok: false, error: res.error };
      steps.push(
        `${fmt(a)} ${tok.value} ${fmt(b)} = ${fmt(res.out)}`,
      );
      evalStack.push(res.out);
    }
  }
  if (evalStack.length !== 1) {
    return { ok: false, error: "malformed expression (leftover operands)" };
  }
  const result = evalStack[0];
  return {
    ok: true,
    value: result.value,
    unit: result.unit,
    dimension: result.dimension,
    steps,
  };
}

function fmt(n: ValueNode): string {
  const v = Number.isInteger(n.value) ? n.value.toString() : Number(n.value.toFixed(6)).toString();
  return `${v}${n.unit ? " " + n.unit : ""}`;
}

/** Detect whether a message contains a deterministic math
 *  expression worth evaluating (heuristic, bounded). */
export function containsMathExpression(text: string): string | null {
  // explicit arithmetic between numbers/units
  const m = text.match(
    /(-?\d+(?:\.\d+)?\s*(?:m²|m³|°|%|[A-Za-z]{1,12})?\s*(?:[-+*/^×÷]\s*\(?\s*-?\d+(?:\.\d+)?[^)\s]*\)?)+)/,
  );
  if (m && /[-+*/^×÷]/.test(m[1])) return m[1].trim();
  // percentage-of form
  const p = text.match(
    /(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s*of\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (p) return `${p[1]}% of ${p[2]}`;
  return null;
}

/** Unit conversion request detection ("convert 5 m to ft"). */
export function detectConversion(
  text: string,
): { value: number; from: string; to: string } | null {
  const m = text.match(
    /convert\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z°²³]+)\s+(?:to|into|in)\s+([A-Za-z°²³]+)/i,
  );
  if (!m) return null;
  return { value: Number(m[1]), from: m[2], to: m[3] };
}

/** Deterministic ratio/percentage helpers (spec §14) — used by
 *  the constraint and sensitivity layers. */
export function percentOf(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return (part / whole) * 100;
}

export function applyPercent(base: number, percent: number): number {
  return (base * percent) / 100;
}

/** Round-half-up to a fixed number of decimals — keeps results
 *  reproducible across platforms. */
export function roundTo(value: number, decimals = 4): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f + Number.EPSILON * Math.sign(value)) / f;
}
