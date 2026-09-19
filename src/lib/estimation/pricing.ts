import type { PriceSnapshot } from '@/types/estimation';

/**
 * Creates a PriceSnapshot object for storing on estimate line items.
 */
export function createPriceSnapshot(
  price: number,
  productName: string,
  packSize?: number | null,
  packUnit?: string | null,
  options?: {
    priceType?: 'product' | 'quality' | 'material';
    refId?: string;
    currency?: string;
    priceId?: string;
    effectiveDate?: string;
  }
): PriceSnapshot {
  return {
    price_type: options?.priceType ?? 'product',
    ref_id: options?.refId ?? '',
    ref_name: productName ?? 'Unknown Product',
    unit_price: Math.max(0, isNaN(price) ? 0 : price),
    currency: options?.currency ?? 'NGN',
    pack_size: packSize ?? null,
    pack_unit: packUnit ?? null,
    effective_date: options?.effectiveDate ?? new Date().toISOString().split('T')[0],
    price_id: options?.priceId ?? '',
  };
}

/**
 * Calculates total price for a line item: unitPrice * practicalQty.
 */
export function calculateLineTotal(unitPrice: number, practicalQty: number): number {
  const price = Math.max(0, isNaN(unitPrice) ? 0 : unitPrice);
  const qty = Math.max(0, isNaN(practicalQty) ? 0 : practicalQty);
  return Math.round(price * qty * 100) / 100;
}

/**
 * Sums all line item totals for an estimate.
 */
export function calculateEstimateTotal(
  items: Array<Record<string, unknown> | { total_price?: number; total?: number; lineTotal?: number }>
): number {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const sum = items.reduce((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const itemRecord = item as Record<string, unknown>;
    const lineTotal =
      (itemRecord.total_price as number) ??
      (itemRecord.total as number) ??
      (itemRecord.lineTotal as number) ??
      0;

    const validTotal = typeof lineTotal === 'number' && !isNaN(lineTotal) ? lineTotal : 0;
    return acc + validTotal;
  }, 0);

  return Math.round(sum * 100) / 100;
}

/**
 * Formats a numeric amount with currency code or symbol.
 */
export function formatCurrency(amount: number, currency = 'NGN'): string {
  const safeAmount = isNaN(amount) ? 0 : amount;
  const symbolMap: Record<string, string> = {
    NGN: '₦',
    USD: '$',
    EUR: '€',
    GBP: '£',
  };

  const upperCurrency = (currency || 'NGN').toUpperCase();
  const symbol = symbolMap[upperCurrency] || currency;

  const formatted = safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  if (symbol === '₦' || symbol.length === 1) {
    return `${symbol}${formatted}`;
  }

  return `${symbol} ${formatted}`;
}

/**
 * Checks if a price is validly configured (exists, non-null/undefined, number >= 0).
 */
export function isPriceConfigured(price: unknown): boolean {
  if (price === null || price === undefined) return false;
  if (typeof price !== 'number' || isNaN(price) || !isFinite(price)) return false;
  return price >= 0;
}
