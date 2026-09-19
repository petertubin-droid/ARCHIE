import type { PackRoundingResult } from '@/types/estimation';

/**
 * Calculates the leftover/unused quantity after practical purchase.
 * Leftover is practical_purchase_quantity - theoretical_quantity (minimum 0).
 */
export function calculateLeftover(theoreticalQty: number, practicalQty: number): number {
  const theoretical = Math.max(0, isNaN(theoreticalQty) ? 0 : theoreticalQty);
  const practical = Math.max(0, isNaN(practicalQty) ? 0 : practicalQty);
  const diff = practical - theoretical;
  if (diff <= 0) return 0;
  return Math.round(diff * 10000) / 10000;
}

/**
 * Takes theoretical requirement, pack size, and rounding rule ('ceil', 'floor', 'round', 'none', 'full_pack', 'partial_allowed').
 * Returns PackRoundingResult object.
 */
export function roundPackQuantity(
  theoreticalQty: number,
  packSize: number,
  rule: string = 'ceil'
): PackRoundingResult {
  const safeTheo = Math.max(0, isNaN(theoreticalQty) ? 0 : theoreticalQty);
  const safePack = Math.max(0, isNaN(packSize) ? 0 : packSize);

  if (safeTheo === 0 || safePack === 0) {
    return {
      theoretical_quantity: safeTheo,
      practical_purchase_quantity: safeTheo,
      pack_size: safePack,
      pack_count: 0,
      leftover_quantity: 0,
      rounding_rule: rule,
    };
  }

  let normalizedRule = rule.toLowerCase();
  if (normalizedRule === 'full_pack') {
    normalizedRule = 'ceil';
  } else if (normalizedRule === 'partial_allowed') {
    normalizedRule = 'none';
  }

  let packCount = 0;
  let practicalQty = safeTheo;

  switch (normalizedRule) {
    case 'ceil':
      packCount = Math.ceil(safeTheo / safePack);
      practicalQty = packCount * safePack;
      break;
    case 'floor':
      packCount = Math.floor(safeTheo / safePack);
      practicalQty = packCount * safePack;
      break;
    case 'round':
      packCount = Math.round(safeTheo / safePack);
      practicalQty = packCount * safePack;
      break;
    case 'none':
      packCount = Math.round((safeTheo / safePack) * 10000) / 10000;
      practicalQty = safeTheo;
      break;
    default:
      packCount = Math.ceil(safeTheo / safePack);
      practicalQty = packCount * safePack;
      break;
  }

  practicalQty = Math.round(practicalQty * 10000) / 10000;
  const leftoverQty = calculateLeftover(safeTheo, practicalQty);

  return {
    theoretical_quantity: Math.round(safeTheo * 10000) / 10000,
    practical_purchase_quantity: practicalQty,
    pack_size: safePack,
    pack_count: packCount,
    leftover_quantity: leftoverQty,
    rounding_rule: rule,
  };
}

/**
 * Rounds pack quantity while enforcing a minimum purchase quantity threshold.
 */
export function roundPackWithMin(
  theoreticalQty: number,
  packSize: number,
  minQty: number,
  rule: string = 'ceil'
): PackRoundingResult {
  const baseResult = roundPackQuantity(theoreticalQty, packSize, rule);
  const safeMin = Math.max(0, isNaN(minQty) ? 0 : minQty);

  if (baseResult.theoretical_quantity === 0 || safeMin === 0) {
    return baseResult;
  }

  if (baseResult.practical_purchase_quantity >= safeMin) {
    return baseResult;
  }

  let adjustedPracticalQty = safeMin;
  let packCount = baseResult.pack_count;

  if (baseResult.pack_size > 0) {
    let normalizedRule = rule.toLowerCase();
    if (normalizedRule === 'full_pack') normalizedRule = 'ceil';

    if (normalizedRule !== 'none') {
      packCount = Math.ceil(safeMin / baseResult.pack_size);
      adjustedPracticalQty = packCount * baseResult.pack_size;
    } else {
      packCount = Math.round((safeMin / baseResult.pack_size) * 10000) / 10000;
    }
  }

  adjustedPracticalQty = Math.round(adjustedPracticalQty * 10000) / 10000;
  const leftoverQty = calculateLeftover(baseResult.theoretical_quantity, adjustedPracticalQty);

  return {
    ...baseResult,
    practical_purchase_quantity: adjustedPracticalQty,
    pack_count: packCount,
    leftover_quantity: leftoverQty,
  };
}
