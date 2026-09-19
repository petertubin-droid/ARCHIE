// =========================================================
// FRELUX PHASE 6.5 ALPHA, PRICE INTELLIGENCE (pure stats)
//
// Statistics over APPEND-ONLY price observations. Observed
// market price is always distinguished from FRELUX configured
// price and verified actual project price. Never mutates
// history; never touches calculator prices.
// =========================================================

export interface Observation {
  price: number;
  currency: string;
  country: string;
  region: string | null;
  retrieved_at: string;
  source_reliability: string;
}

export interface PriceStats {
  count: number;
  min: number | null;
  max: number | null;
  median: number | null;
  /** reliability-weighted typical observed price */
  typical: number | null;
  currency: string | null;
  /** days since the most recent observation */
  priceAgeDays: number | null;
  oldestDays: number | null;
  /** simple per-day trend slope across sorted history (needs >= 3 obs) */
  trendPerDay: number | null;
}

const WEIGHTS: Record<string, number> = {
  AUTHORITATIVE: 1.0,
  HIGH: 0.8,
  MEDIUM: 0.5,
  LOW: 0.3,
  UNVERIFIED: 0.15,
};

export function computePriceStats(
  observations: Array<Observation & { product_name?: string }>,
  now: Date = new Date(),
): PriceStats {
  if (observations.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      median: null,
      typical: null,
      currency: null,
      priceAgeDays: null,
      oldestDays: null,
      trendPerDay: null,
    };
  }
  const sorted = [...observations].sort((a, b) =>
    a.retrieved_at.localeCompare(b.retrieved_at),
  );
  const prices = sorted.map((o) => o.price).sort((a, b) => a - b);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  let wSum = 0,
    wPrice = 0;
  for (const o of sorted) {
    const w = WEIGHTS[o.source_reliability] ?? 0.15;
    wSum += w;
    wPrice += w * o.price;
  }
  const typical = wSum > 0 ? wPrice / wSum : null;
  const newest = new Date(sorted[sorted.length - 1].retrieved_at).getTime();
  const oldest = new Date(sorted[0].retrieved_at).getTime();
  const priceAgeDays = Math.max(
    0,
    Math.round((now.getTime() - newest) / 86_400_000),
  );
  const oldestDays = Math.max(
    0,
    Math.round((now.getTime() - oldest) / 86_400_000),
  );
  let trendPerDay: number | null = null;
  if (sorted.length >= 3 && newest !== oldest) {
    const span = (newest - oldest) / 86_400_000;
    const first = sorted.slice(0, Math.ceil(sorted.length / 2));
    const second = sorted.slice(Math.ceil(sorted.length / 2));
    const avg = (xs: Observation[]) =>
      xs.reduce((a, x) => a + x.price, 0) / xs.length;
    trendPerDay =
      span > 0 ? Number(((avg(second) - avg(first)) / span).toFixed(2)) : null;
  }
  const currencies = new Set(sorted.map((o) => o.currency));
  return {
    count: sorted.length,
    min,
    max,
    median,
    typical,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    priceAgeDays,
    oldestDays,
    trendPerDay,
  };
}

/** Regional comparison, regions never bleed into each other. */
export function regionalPriceComparison(
  observations: Observation[],
): Array<{ region: string; stats: PriceStats }> {
  const groups = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = (o.region ?? o.country).toUpperCase();
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.entries()]
    .map(([region, obs]) => ({ region, stats: computePriceStats(obs) }))
    .sort((a, b) => a.region.localeCompare(b.region));
}
