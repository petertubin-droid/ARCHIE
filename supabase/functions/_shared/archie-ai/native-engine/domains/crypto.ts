// supabase/functions/_shared/archie-ai/native-engine/domains/crypto.ts
// =========================================================
// CRYPTO DOMAIN SKILL (audit L-1 fix, 2026-09-13)
//
// The forensic audit found crypto market intelligence welded
// into the "domain-neutral" core engine — aliases, price and
// trade routes hardcoded in engine.ts. This moves ALL of it
// behind the pluggable domain-skill registry: the core engine
// now contains zero crypto vocabulary or logic, and the
// skill contributes its own NLU rule (composed into the
// cascade like construction's) plus the live-data handler.
//
// Behavior is UNCHANGED: live multi-venue price cross-checks
// and evidence-gated trade evaluations — every number is
// observed from a real venue or the failure is reported
// honestly. No simulated prices, ever. The handler is async
// (registry-supported): market data is observed live.
// =========================================================

import {
  crossCheckTicker,
  defaultFetcher,
  fetchCandles,
  type Fetcher,
} from "../crypto/market-data.ts";
import {
  buildPrediction,
  walkForwardValidate,
  type DataQuality,
} from "../crypto/probability.ts";
import {
  evaluateTradeGate,
  renderGateDecision,
  type TradingLimits,
  DEFAULT_TRADING_LIMITS,
  type TradeRequest,
} from "../crypto/trade-gate.ts";
import type { DomainSkill } from "./registry.ts";

export interface CryptoSkillOptions {
  /** Injected market-data fetcher. null/undefined = the real
   *  global fetch (venues live; unreachable venues reported
   *  honestly, never simulated). */
  fetcher?: Fetcher | null;
  /** Owner trading limits for the trade gate. */
  tradingLimits?: TradingLimits;
}

/** Longest-alias-first registry — multi-word aliases must win
 *  over their substrings ("binance coin" over "bnb" is fine by
 *  order below; both map to BNB-USD anyway). */
const CRYPTO_ALIASES: Array<[string, string]> = [
  ["binance coin", "BNB-USD"],
  ["bitcoin", "BTC-USD"],
  ["btc", "BTC-USD"],
  ["ethereum", "ETH-USD"],
  ["eth", "ETH-USD"],
  ["solana", "SOL-USD"],
  ["sol", "SOL-USD"],
  ["ripple", "XRP-USD"],
  ["xrp", "XRP-USD"],
  ["dogecoin", "DOGE-USD"],
  ["doge", "DOGE-USD"],
  ["bnb", "BNB-USD"],
  ["cardano", "ADA-USD"],
  ["ada", "ADA-USD"],
  ["chainlink", "LINK-USD"],
  ["link", "LINK-USD"],
  ["litecoin", "LTC-USD"],
  ["ltc", "LTC-USD"],
];

function cryptoSymbolOf(lower: string): string | null {
  for (const [alias, sym] of CRYPTO_ALIASES) {
    if (new RegExp(`\\b${alias}\\b`).test(lower)) return sym;
  }
  return null;
}

async function handleCryptoMarketQuery(
  input: string,
  opts: Required<Pick<CryptoSkillOptions, "fetcher">> & {
    tradingLimits: TradingLimits;
  },
): Promise<string> {
  const lower = input.toLowerCase();
  const symbol = cryptoSymbolOf(lower);

  // Trade evaluation: a direction word AND trade-plan
  // vocabulary. Price snapshots need only the symbol.
  const direction: "long" | "short" | null = /\b(?:buy|long|bullish)\b/.test(
    lower,
  )
    ? "long"
    : /\b(?:sell|short|bearish)\b/.test(lower)
      ? "short"
      : null;
  const wantsTradeEval =
    direction !== null &&
    /\b(?:entry|enter(?:ing)?|stop|target|take[-\s]?profit|position|portfolio|evaluate)\b/i.test(
      input,
    );

  if (!symbol) {
    return (
      "Ask me for a live crypto price — for example 'what is the price of bitcoin' — or give me a trade to evaluate ('should i buy eth, entry 3000, stop 2800, target 3300, size 500, portfolio 25000'). " +
      "I answer from real multi-venue market data, never from a guess."
    );
  }

  const fetcher = opts.fetcher ?? defaultFetcher;
  const cc = await crossCheckTicker(symbol, fetcher);

  if (cc.venuesReporting.length === 0) {
    const failures = cc.venuesUnavailable
      .map((v) => `${v.venue}: ${v.reason}`)
      .join("; ");
    return `I could not get a live ${symbol} price — every venue I query reported unavailable or refused (${failures}). I will not fabricate a market price. Try again later.`;
  }

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  if (!wantsTradeEval) {
    // PRICE SNAPSHOT — consensus across the venues that
    // really answered.
    const withChange = cc.snapshots.find((x) => x.changePct24h !== null);
    const parts = [
      `${symbol} consensus $${fmt(cc.consensusPrice ?? 0)} across ${cc.venuesReporting.length} live venues (${cc.venuesReporting.join(", ")})`,
    ];
    if (cc.venuesUnavailable.length > 0) {
      parts.push(
        `${cc.venuesUnavailable.length} venue(s) unavailable, reported honestly (${cc.venuesUnavailable.map((v) => v.venue).join(", ")})`,
      );
    }
    const ch = withChange?.changePct24h ?? null;
    if (ch !== null) {
      parts.push(
        `24h change ${ch >= 0 ? "+" : ""}${ch.toFixed(2)}% (${withChange!.venue})`,
      );
    }
    if (cc.maxDeviationPct !== null) {
      parts.push(
        `max cross-venue deviation ${cc.maxDeviationPct.toFixed(2)}%` +
          (cc.anomaly
            ? " — ANOMALY: venues disagree beyond the 1% threshold, treat this snapshot with suspicion"
            : ""),
      );
    }
    parts.push("observed live market data — not financial advice");
    return parts.join(". ") + ".";
  }

  // TRADE EVALUATION — the full evidence pipeline:
  // cross-check + candle history + walk-forward-validated
  // prediction + the 11-check gate. Missing parameters are
  // asked for, never guessed.
  const num = (re: RegExp): number | null => {
    const m = re.exec(input);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ""));
    return Number.isFinite(v) ? v : null;
  };
  const entry =
    num(
      /(?:entry|enter(?:ing)?|buy(?:ing)?|sell(?:ing)?|short(?:ing)?)\s+(?:at\s+)?\$?([\d,.]+)/i,
    ) ?? cc.consensusPrice!; // market order: entry = live consensus (venues reported)
  const stop = num(
    /(?:stop(?:[-\s]?loss)?|invalidation)\s*[:=]?\s*\$?([\d,.]+)/i,
  );
  const target = num(/(?:target|take[-\s]?profit)\s*[:=]?\s*\$?([\d,.]+)/i);
  const size = num(
    /(?:position\s*)?(?:size|amount)\s*[:=]?\s*(?:of\s+)?\$?([\d,.]+)/i,
  );
  const portfolio = num(
    /(?:portfolio|account)\s*(?:value|balance)?\s*[:=]?\s*(?:of\s+)?\$?([\d,.]+)/i,
  );
  if (stop === null || target === null || size === null || portfolio === null) {
    const missing = [
      stop === null ? "stop-loss" : null,
      target === null ? "take-profit target" : null,
      size === null ? "position size" : null,
      portfolio === null ? "portfolio value" : null,
    ].filter(Boolean);
    return `To evaluate a ${symbol} trade honestly I need the full plan — ${missing.join(", ")} — plus your direction. Example: "should i ${direction ?? "buy"} ${symbol.replace("-USD", "").toLowerCase()}, entry 3000, stop 2800, target 3300, size 500, portfolio 25000". I will not evaluate a trade with guessed parameters.`;
  }

  const INTERVAL = 60; // 60-minute candles
  const HORIZON = 4; // 4-candle (4h) prediction horizon
  const candlesRes = await fetchCandles(
    "coinbase",
    symbol,
    INTERVAL,
    400,
    fetcher,
  );
  if (candlesRes.kind !== "ok") {
    return `I have a live ${symbol} price, but the candle history I need for trade evidence is unavailable right now (${candlesRes.reason}) — I will not evaluate a trade without real evidence. Try again later.`;
  }
  const candles = candlesRes.data.candles;
  const validation = walkForwardValidate(symbol, candles, INTERVAL, HORIZON);

  // Honest data quality from the live series + cross-check.
  const analysisAnomalies: string[] = [];
  if (candles.length >= 2) {
    const expectedSpan = (candles.length - 1) * INTERVAL * 60;
    const actualSpan = candles[candles.length - 1].ts - candles[0].ts;
    if (actualSpan < expectedSpan * 0.9) {
      analysisAnomalies.push("gapped candle series");
    }
  }
  const dataQuality: DataQuality = {
    crossVenueAnomaly: cc.anomaly,
    venuesReporting: cc.venuesReporting.length,
    analysisAnomalies,
    dataAgeMs:
      candles.length > 0
        ? Date.now() - candles[candles.length - 1].ts * 1000
        : null,
  };

  const prediction = buildPrediction(
    symbol,
    direction,
    candles,
    INTERVAL,
    HORIZON,
    validation,
    dataQuality,
  );
  if (!prediction) {
    return `I could not build honest prediction evidence for ${symbol} from the live candle history — the series is too thin or too gapped for my feature extraction, and I will not evaluate a trade on insufficient data.`;
  }

  const request: TradeRequest = {
    symbol,
    direction,
    entryPrice: entry,
    stopPrice: stop,
    targetPrice: target,
    positionSizeQuote: size,
    portfolioValueQuote: portfolio,
  };
  const decision = evaluateTradeGate(
    request,
    prediction,
    opts.tradingLimits,
    Date.now(),
  );
  return (
    renderGateDecision(decision) +
    ` Calibrated probability for a ${direction} ${symbol.replace("-USD", "")} position: ${(prediction.calibratedProbability * 100).toFixed(1)}% ` +
    `(60m candles, 4h horizon, walk-forward validated on ${validation.samples} samples, Brier ${validation.brier !== null ? validation.brier.toFixed(3) : "n/a"}). ` +
    `This is a mechanical evaluation of YOUR trade parameters against real market evidence — not financial advice.`
  );
}

/** The crypto domain skill. The NLU rule MUST precede the
 *  materials price rule — "price of bitcoin" would otherwise
 *  be captured by it (order preserved by rule composition:
 *  domain rules are checked before the engine's core cascade
 *  tail). */
export function createCryptoSkill(
  options: CryptoSkillOptions = {},
): DomainSkill {
  return {
    id: "crypto",
    intents: ["crypto_market_query"],
    nluRules: [
      {
        // Crypto market intelligence (audit fix H-2): live
        // multi-venue price cross-checks and trade-gate
        // evaluations. MUST precede the materials price rule.
        intent: "crypto_market_query",
        pattern:
          /\b(?:bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp|dogecoin|doge|binance\s+coin|bnb|cardano|ada|chainlink|link|litecoin|ltc|crypto(?:coin|currency)?)\b[^.?!]*\b(?:price|worth|trading\s+at|selling\s+for|quoting)\b|\b(?:price|worth)\s+of\s+(?:bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp|dogecoin|doge|bnb|ada|link|ltc|crypto)|\b(?:should\s+i|is\s+it\s+safe\s+to|can\s+i|would\s+you)\s+(?:buy|sell|long|short)\b[^.?!]*\b(?:bitcoin|btc|ethereum|eth|solana|sol|ripple|xrp|dogecoin|doge|bnb|ada|link|ltc)\b|\bevaluate\s+(?:my\s+)?(?:trade|crypto)\b/i,
        confidence: 0.9,
      },
    ],
    handler: async (_intent: string, input: string): Promise<string> => {
      // The skill serves one intent; decline anything else so
      // the engine answers honestly.
      return handleCryptoMarketQuery(input, {
        fetcher: options.fetcher ?? null,
        tradingLimits: options.tradingLimits ?? DEFAULT_TRADING_LIMITS,
      });
    },
  };
}
