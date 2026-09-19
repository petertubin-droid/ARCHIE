// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, SPEND MATH (shared, pure)
//
// Deterministic sums over the project's REAL rows. No value is
// ever invented: every figure traces to shopping items, saved
// calculations or progress stages (§3, §12).
// =========================================================

import type { ShoppingRow } from "./internal-types";
import type { PredictiveProjectSnapshot } from "./types";

/**
 * Deterministic progress fraction from recorded stage completion.
 * 0 when there are no stages, the caller decides whether that
 * means "no data" (it usually does). Never invented (§4).
 */
export function recordedStageProgress(
  stages: PredictiveProjectSnapshot["stages"],
): number | null {
  if (stages.length === 0) return null;
  const completed = stages.filter((s) => s.isCompleted).length;
  return completed / stages.length;
}

/** Lines with a recorded actual price, the only true "recorded" cost rows. */
export function recordedActualLines(items: ShoppingRow[]): ShoppingRow[] {
  return items.filter(
    (i) => i.actual_price !== null && Number.isFinite(i.actual_price),
  );
}

/** Purchased lines, actual price if recorded, otherwise the recorded
 *  estimated line total (explicitly a lower-bound proxy, disclosed
 *  as an assumption by the caller). */
export function purchasedLines(items: ShoppingRow[]): ShoppingRow[] {
  return items.filter((i) => i.is_purchased);
}

export function lineEstimatedTotal(item: ShoppingRow): number {
  const t = Number(item.total_price);
  if (Number.isFinite(t) && t > 0) return t;
  const q = Number(item.quantity);
  const e = Number(item.estimated_price);
  return Number.isFinite(q) && Number.isFinite(e) ? q * e : 0;
}

export function lineActualTotal(item: ShoppingRow): number {
  const actual = Number(item.actual_price);
  const q = Number(item.quantity);
  if (Number.isFinite(actual) && item.actual_price !== null) {
    return Number.isFinite(q) ? actual * q : 0;
  }
  return lineEstimatedTotal(item); // proxy, caller must disclose
}

/** Sum of estimated line totals (the current material budget). */
export function estimatedShoppingTotal(items: ShoppingRow[]): number {
  return items.reduce((sum, i) => sum + lineEstimatedTotal(i), 0);
}

/** Recorded spend = purchased lines at actual price (proxy where
 *  the actual price was not recorded). */
export function recordedSpend(items: ShoppingRow[]): number {
  return purchasedLines(items).reduce((sum, i) => sum + lineActualTotal(i), 0);
}

/** Spend recorded with an explicit actual price, no proxy lines. */
export function strictlyRecordedSpend(items: ShoppingRow[]): number {
  return purchasedLines(items)
    .filter((i) => i.actual_price !== null && Number.isFinite(i.actual_price))
    .reduce((sum, i) => sum + Number(i.actual_price) * Number(i.quantity), 0);
}

/** Estimated cost of the still-unpurchased lines (upcoming requirement). */
export function unpurchasedEstimatedTotal(items: ShoppingRow[]): number {
  return items
    .filter((i) => !i.is_purchased)
    .reduce((sum, i) => sum + lineEstimatedTotal(i), 0);
}

/**
 * The estimate series from saved calculations (chronological).
 * Each entry carries its recorded total. Null totals are skipped :
 * a calculation without a recorded total is not an estimate point.
 */
export function estimateTimeline(
  calculations: PredictiveProjectSnapshot["calculations"],
): Array<{ id: string; title: string; total: number; createdAt: string }> {
  return calculations
    .filter(
      (c) =>
        c.estimatedTotal !== null &&
        Number.isFinite(c.estimatedTotal) &&
        c.estimatedTotal > 0,
    )
    .map((c) => ({
      id: c.id,
      title: c.title,
      total: c.estimatedTotal as number,
      createdAt: c.createdAt,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Original estimate = earliest recorded estimate point. */
export function originalEstimate(
  calculations: PredictiveProjectSnapshot["calculations"],
): number | null {
  const timeline = estimateTimeline(calculations);
  return timeline.length > 0 ? timeline[0].total : null;
}

/** Current estimate = latest recorded estimate point. */
export function currentEstimate(
  calculations: PredictiveProjectSnapshot["calculations"],
  shoppingFallback: ShoppingRow[],
): number | null {
  const timeline = estimateTimeline(calculations);
  if (timeline.length > 0) return timeline[timeline.length - 1].total;
  // Honest fallback: the current shopping-list budget IS a current
  // estimate the user recorded. Original estimate is then unknown.
  const shopping = estimatedShoppingTotal(shoppingFallback);
  return shopping > 0 ? shopping : null;
}

/** Lines whose recorded actual price exceeds the recorded estimate. */
export function linesWithRecordedPriceIncrease(
  items: ShoppingRow[],
): Array<{
  item: ShoppingRow;
  estimated: number;
  actual: number;
  increasePct: number;
}> {
  return items
    .filter(
      (i) =>
        i.actual_price !== null &&
        Number.isFinite(i.actual_price) &&
        i.estimated_price > 0,
    )
    .map((i) => ({
      item: i,
      estimated: Number(i.estimated_price),
      actual: Number(i.actual_price as number),
      increasePct:
        (Number(i.actual_price as number) - Number(i.estimated_price)) /
        Number(i.estimated_price),
    }))
    .filter((l) => l.increasePct > 0)
    .sort((a, b) => b.increasePct - a.increasePct);
}
