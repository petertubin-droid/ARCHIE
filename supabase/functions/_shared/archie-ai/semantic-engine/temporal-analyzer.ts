// =========================================================
// ARCHIE SEMANTIC UNDERSTANDING — TEMPORAL ANALYZER
// supabase/functions/_shared/archie-ai/semantic-engine/temporal-analyzer.ts
//
// Extracts relative time expressions, event ordering (preconditions),
// durations, and deadlines without inventing timezones or dates.
// =========================================================

import type { TemporalContext } from "./types.ts";

export function analyzeTemporal(text: string): TemporalContext {
  const expressions: Array<{ type: string; text: string }> = [];
  const eventOrder: TemporalContext["eventOrder"] = [];
  const order: TemporalContext["order"] = [];
  const durations: TemporalContext["durations"] = [];
  let deadline: string | undefined;
  let tense: TemporalContext["tense"] = "UNSPECIFIED";

  const lower = text.toLowerCase();

  // 1. Durations: e.g. "for 2 weeks", "28 days", "3 months", "48 hours"
  const durationRegex = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = durationRegex.exec(text)) !== null) {
    const raw = match[0];
    durations.push({
      value: parseFloat(match[1]),
      unit: match[2].toLowerCase(),
      rawText: raw,
      text: raw,
    });
    expressions.push({ type: "DURATION", text: raw });
  }

  // 2. Deadlines: e.g. "by Friday", "before October 25", "deadline is next week"
  const deadlineRegex = /\b(?:by|before|due(?:\s+on)?|deadline(?:\s+is)?)\s+([A-Z][a-z]+(?:\s+\d{1,2})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+|tomorrow|next\s+week|friday|monday)\b/gi;
  if ((match = deadlineRegex.exec(text)) !== null) {
    deadline = match[0];
    expressions.push({ type: "DEADLINE", text: match[0] });
  }

  // 3. Relative Dates: "tomorrow", "yesterday", "next week", "next month", "today"
  const relDateRegex = /\b(today|tomorrow|yesterday|next\s+week|next\s+month|last\s+week|last\s+month)\b/gi;
  while ((match = relDateRegex.exec(text)) !== null) {
    expressions.push({ type: "RELATIVE_DATE", text: match[0] });
  }

  // 4. Precedence / Event Order: "before X", "after Y", "prior to"
  const orderRegex = /\b(.+?)\s+(?:before|prior\s+to)\s+(.+?)(?:[.,;]|$)/i;
  const orderMatch = orderRegex.exec(text);
  if (orderMatch) {
    const prior = orderMatch[1].trim();
    const subsequent = orderMatch[2].trim();
    eventOrder.push({
      prior,
      subsequent,
      relation: "BEFORE",
    });
    order.push({
      prior,
      subsequent,
      relationship: "PRECEDES",
    });
  }

  // Determine dominant tense
  if (/\b(did|was|completed|finished|yesterday|earlier|previous)\b/i.test(text)) {
    tense = "PAST";
  } else if (/\b(will|shall|plan\s+to|going\s+to|tomorrow|next\s+week|future)\b/i.test(text)) {
    tense = "FUTURE";
  } else if (/\b(is|currently|now|today|present)\b/i.test(text)) {
    tense = "PRESENT";
  }

  return {
    hasTemporal: expressions.length > 0 || durations.length > 0 || order.length > 0 || Boolean(deadline),
    expressions,
    order,
    eventOrder,
    durations,
    deadline,
    tense,
  };
}
