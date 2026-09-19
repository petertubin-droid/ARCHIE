// =========================================================
// MARKET DATA & ANALYSIS TESTS
//
// The adapter tests replay REAL response shapes captured live
// from the venues (Coinbase, Kraken, OKX, KuCoin, CoinGecko)
// through a fixture fetcher — no network in CI. Indicator
// math is verified on small hand-checkable series. Live
// integration is proven by the smoke test in the deployed
// edge function, never faked here.
// =========================================================

import { describe, expect, it } from "vitest";
import {
  crossCheckTicker,
  fetchCandles,
  fetchFunding,
  fetchOpenInterest,
  fetchTicker,
  mapSymbol,
  venueSupportsInterval,
  type Fetcher,
} from "@studio-shared/archie-ai/native-engine/crypto/market-data.ts";
import {
  analyzeCandles,
  atr,
  classifyTrend,
  isFresh,
  macd,
  orderBookImbalance,
  realizedVolatilityPct,
  rsi,
  supportResistance,
  volumeZScore,
} from "@studio-shared/archie-ai/native-engine/crypto/market-analysis.ts";

// ---------------------------------------------------------
// Fixture fetcher: map URL → captured payload
// ---------------------------------------------------------
function fixtureFetcher(routes: Record<string, unknown>): Fetcher {
  return async (url) => {
    for (const [pattern, payload] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          json: async () => payload,
        };
      }
    }
    return { ok: false, status: 451, json: async () => ({}) };
  };
}

const coinbaseTicker = {
  ask: "77100.95",
  bid: "77100.94",
  volume: "6626.50",
  trade_id: 1,
  price: "77100.94",
  size: "0.0000001",
  time: "2026-09-11T10:19:37.816Z",
};
const okxTicker = {
  code: "0",
  data: [
    {
      instType: "SPOT",
      instId: "BTC-USDT",
      last: "77137.2",
      askPx: "77137.3",
      bidPx: "77137.2",
      open24h: "78003.1",
      high24h: "78055.7",
      low24h: "76464.7",
      vol24h: "5148.2",
      ts: "1",
    },
  ],
};
const krakenTicker = {
  error: [],
  result: {
    XBTUSDT: {
      a: ["77132.5", "1", "1"],
      b: ["77129.7", "1", "1"],
      c: ["77114.0", "0.746"],
      v: ["22.5", "125.2"],
      p: ["77002.2", "77128.5"],
      t: [1086, 4367],
      l: ["76562.9", "76336.3"],
      h: ["77999.9", "78100.1"],
      o: "76900.0",
    },
  },
};
const kucoinTicker = {
  code: "200000",
  data: { time: "1", price: "77130.1", bestBid: "77130.1", bestAsk: "77130.2" },
};
const coingeckoPrice = {
  bitcoin: { usd: 77068, usd_24h_change: -1.149327028 },
};
const binanceGeoBlock = {
  code: 0,
  msg: "Service unavailable from a restricted location",
};
const okxFunding = {
  code: "0",
  data: [
    {
      instId: "BTC-USDT-SWAP",
      fundingRate: "0.0000133872",
      fundingTime: "1789142400000",
    },
  ],
};
const okxOI = {
  code: "0",
  data: [{ instId: "BTC-USDT-SWAP", oi: "125000.5", oiCcy: "9632000000.1" }],
};
const krakenOhlc = {
  error: [],
  result: {
    XBTUSDT: [
      [
        1726876800,
        "63190.9",
        "63530.2",
        "62778.7",
        "63369.7",
        "63076.5",
        "55.69",
        3058,
      ],
      [
        1726963200,
        "63355.9",
        "64000.1",
        "62435.4",
        "63652.3",
        "63155.3",
        "84.43",
        3363,
      ],
    ],
    last: 1726963200,
  },
};
const coinbaseCandles = [
  // newest-first [time, low, high, open, close, volume]
  [1727049700, 62000, 64100, 63000, 63500, 100],
  [1726963300, 61500, 63200, 62500, 63000, 90],
  [1726876900, 61000, 62600, 62000, 62500, 80],
];

describe("venue adapters (captured live response shapes)", () => {
  it("coinbase ticker parses", async () => {
    const r = await fetchTicker(
      "coinbase",
      "BTC-USDT",
      fixtureFetcher({
        "api.exchange.coinbase.com/products/BTC-USD/ticker": coinbaseTicker,
      }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.last).toBeCloseTo(77100.94, 2);
      expect(r.data.bid).toBeCloseTo(77100.94, 2);
      expect(r.data.volume24hBase).toBeCloseTo(6626.5, 1);
      expect(r.data.symbol).toBe("BTC-USDT");
    }
  });
  it("okx ticker parses and computes 24h change from open24h", async () => {
    const r = await fetchTicker(
      "okx",
      "BTC-USDT",
      fixtureFetcher({ "okx.com/api/v5/market/ticker": okxTicker }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.last).toBeCloseTo(77137.2, 1);
      expect(r.data.changePct24h).toBeCloseTo(
        ((77137.2 - 78003.1) / 78003.1) * 100,
        6,
      );
    }
  });
  it("kraken ticker maps XBT and computes change from vwap", async () => {
    const r = await fetchTicker(
      "kraken",
      "BTC-USDT",
      fixtureFetcher({ "api.kraken.com/0/public/Ticker": krakenTicker }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.last).toBeCloseTo(77114.0, 1);
      expect(r.data.changePct24h).not.toBeNull();
    }
  });
  it("kucoin ticker parses", async () => {
    const r = await fetchTicker(
      "kucoin",
      "BTC-USDT",
      fixtureFetcher({
        "kucoin.com/api/v1/market/orderbook/level1": kucoinTicker,
      }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.data.last).toBeCloseTo(77130.1, 1);
  });
  it("coingecko ticker parses", async () => {
    const r = await fetchTicker(
      "coingecko",
      "BTC-USDT",
      fixtureFetcher({ "coingecko.com/api/v3/simple/price": coingeckoPrice }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.last).toBe(77068);
      expect(r.data.symbol).toBe("BTC-USD");
    }
  });
  it("a geo-blocked venue is honestly UNAVAILABLE, never fabricated", async () => {
    const r = await fetchTicker(
      "binance",
      "BTC-USDT",
      fixtureFetcher({ "api.binance.com/api/v3/ticker/24hr": binanceGeoBlock }),
    );
    // The fixture fetcher returns ok:false only when no route matches;
    // a real 200-with-error-body must ALSO be unavailable:
    const r2 = await fetchTicker("binance", "BTC-USDT", async () => ({
      ok: true,
      status: 200,
      json: async () => binanceGeoBlock,
    }));
    expect(r.kind === "unavailable" || r2.kind === "unavailable").toBe(true);
    if (r2.kind === "ok") {
      // if a payload lacks a price it MUST be unavailable
      expect.fail("geo-block payload with no price must be unavailable");
    }
  });
  it("okx funding + open interest parse", async () => {
    const f = await fetchFunding(
      "okx",
      "BTC-USDT",
      fixtureFetcher({ "okx.com/api/v5/public/funding-rate": okxFunding }),
    );
    expect(f.kind).toBe("ok");
    if (f.kind === "ok") {
      expect(f.data.fundingRatePct).toBeCloseTo(0.00133872, 7);
      expect(f.data.nextFundingAt).not.toBeNull();
    }
    const oi = await fetchOpenInterest(
      "okx",
      "BTC-USDT",
      fixtureFetcher({ "okx.com/api/v5/public/open-interest": okxOI }),
    );
    expect(oi.kind).toBe("ok");
    if (oi.kind === "ok")
      expect(oi.data.openInterestBase).toBeCloseTo(125000.5, 1);
  });
  it("kraken OHLC candles sort ascending with correct OHLC mapping", async () => {
    const r = await fetchCandles(
      "kraken",
      "BTC-USDT",
      1440,
      10,
      fixtureFetcher({ "api.kraken.com/0/public/OHLC": krakenOhlc }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.candles.length).toBe(2);
      const [first, second] = r.data.candles;
      expect(first.ts).toBeLessThan(second.ts);
      expect(first.open).toBeCloseTo(63190.9, 1);
      expect(first.high).toBeCloseTo(63530.2, 1);
      expect(first.low).toBeCloseTo(62778.7, 1);
      expect(first.close).toBeCloseTo(63369.7, 1);
      expect(first.volumeBase).toBeCloseTo(55.69, 2);
    }
  });
  it("coinbase candles reverse newest-first and map low/high/open/close", async () => {
    const r = await fetchCandles(
      "coinbase",
      "BTC-USDT",
      1440,
      10,
      fixtureFetcher({
        "api.exchange.coinbase.com/products/BTC-USD/candles": coinbaseCandles,
      }),
    );
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.data.candles[0].ts).toBe(1726876900);
      expect(r.data.candles[0].open).toBeCloseTo(62000, 0);
      expect(r.data.candles[0].low).toBeCloseTo(61000, 0);
      expect(r.data.candles[2].close).toBeCloseTo(63500, 0);
    }
  });
  it("interval support is honest per venue", () => {
    expect(venueSupportsInterval("kraken", 1440)).toBe(true);
    expect(venueSupportsInterval("coinbase", 1440)).toBe(true);
    expect(venueSupportsInterval("kraken", 7)).toBe(false);
  });
  it("symbol mapping (incl. Kraken XBT)", () => {
    expect(mapSymbol("kraken", "BTC-USDT")).toBe("XBTUSDT");
    expect(mapSymbol("binance", "BTC-USDT")).toBe("BTCUSDT");
    expect(mapSymbol("coinbase", "BTC-USDT")).toBe("BTC-USD");
    expect(mapSymbol("okx", "BTC-USDT")).toBe("BTC-USDT");
  });
});

describe("cross-venue consensus", () => {
  it("computes the median across responding venues and reports unavailable ones", async () => {
    const fetcher = fixtureFetcher({
      "api.exchange.coinbase.com/products/BTC-USD/ticker": coinbaseTicker,
      "api.kraken.com/0/public/Ticker": krakenTicker,
      "okx.com/api/v5/market/ticker": okxTicker,
      // binance + bybit + kucoin + coingecko have no fixture → unavailable
    });
    const cc = await crossCheckTicker("BTC-USDT", fetcher);
    expect(cc.venuesReporting.sort()).toEqual(["coinbase", "kraken", "okx"]);
    expect(cc.venuesUnavailable.length).toBe(4);
    // prices: 77100.94, 77114.0, 77137.2 → median 77114.0
    expect(cc.consensusPrice).toBeCloseTo(77114.0, 1);
    expect(cc.maxDeviationPct).toBeLessThan(0.1);
    expect(cc.anomaly).toBe(false);
  });
  it("flags an anomaly on large cross-venue deviation", async () => {
    const fetcher = fixtureFetcher({
      "api.exchange.coinbase.com/products/BTC-USD/ticker": coinbaseTicker,
      "okx.com/api/v5/market/ticker": {
        code: "0",
        data: [{ ...okxTicker.data[0], last: "90000.0", open24h: "78003.1" }],
      },
    });
    const cc = await crossCheckTicker("BTC-USDT", fetcher);
    expect(cc.anomaly).toBe(true);
  });
  it("all venues down → no consensus, no fabrication", async () => {
    const cc = await crossCheckTicker("BTC-USDT", async () => ({
      ok: false,
      status: 0,
      json: async () => ({}),
    }));
    expect(cc.consensusPrice).toBeNull();
    expect(cc.venuesReporting).toEqual([]);
    expect(cc.venuesUnavailable.length).toBe(7);
  });
});

// ---------------------------------------------------------
// Indicator math — hand-checkable fixtures
// ---------------------------------------------------------

function makeCandles(
  closes: number[],
): import("@studio-shared/archie-ai/native-engine/crypto/market-data.ts").Candle[] {
  // Distinct intrabar highs/lows: a wiggle keeps fractal pivots
  // strict (tied highs would erase pivot points).
  const wig = (i: number) => Math.sin(i * 1.7) * 0.001;
  return closes.map((c, i) => ({
    ts: 1726876800 + i * 86400,
    open: closes[i - 1] ?? c,
    high: c * (1.01 + wig(i)),
    low: c * (0.99 - wig(i)),
    close: c,
    volumeBase: 100,
  }));
}

describe("indicators", () => {
  it("realized volatility is zero for a flat series and positive for a moving one", () => {
    const flat = makeCandles(new Array(30).fill(100));
    expect(realizedVolatilityPct(flat, 365)).toBe(0);
    const rising = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    expect(realizedVolatilityPct(rising, 365)).toBeGreaterThan(0);
    expect(realizedVolatilityPct(flat.slice(0, 10), 365)).toBeNull();
  });
  it("RSI is 100 for a strictly rising series and 0 for strictly falling", () => {
    const rising = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    const falling = makeCandles(Array.from({ length: 30 }, (_, i) => 100 - i));
    expect(rsi(rising)).toBe(100);
    expect(rsi(falling)).toBe(0);
    expect(rsi(makeCandles([1, 2]))).toBeNull();
  });
  it("ATR is positive and finite for a varied series", () => {
    const varied = makeCandles(
      Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i) * 5),
    );
    const a = atr(varied);
    expect(a).not.toBeNull();
    expect(a!).toBeGreaterThan(0);
  });
  it("MACD histogram is macd - signal", () => {
    const varied = makeCandles(
      Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 8),
    );
    const m = macd(varied);
    expect(m).not.toBeNull();
    expect(m!.histogram).toBeCloseTo(m!.macd - m!.signal, 10);
  });
  it("volume z-score flags a spike", () => {
    const candles = makeCandles(new Array(31).fill(100));
    candles[30].volumeBase = 5000;
    const z = volumeZScore(candles, 30);
    expect(z).toBeGreaterThan(4);
  });
  it("classifyTrend detects uptrend vs downtrend", () => {
    // Rising sawteeth: segment peaks 136,146,156… (higher
    // highs), troughs 100,110,120… (higher lows).
    const upCloses = Array.from(
      { length: 40 },
      (_, i) => 100 + (i % 10) * 4 + Math.floor(i / 10) * 10,
    );
    const up = makeCandles(upCloses);
    const down = makeCandles(
      upCloses.map((c) => 500 - c).map((c, i) => c - 0 * i),
    );
    expect(classifyTrend(up).structure).toBe("uptrend");
    expect(classifyTrend(down).structure).toBe("downtrend");
  });
  it("support lies below and resistance above the last price", () => {
    const series = makeCandles(
      Array.from({ length: 40 }, (_, i) => 100 + i * 2 + Math.sin(i) * 3),
    );
    const sr = supportResistance(series);
    const last = series[series.length - 1].close;
    if (sr.support) expect(sr.support.price).toBeLessThan(last);
    if (sr.resistance) expect(sr.resistance.price).toBeGreaterThan(last);
  });
});

describe("order book imbalance", () => {
  it("computes imbalance and spread", () => {
    const book = {
      venue: "okx" as const,
      symbol: "BTC-USDT",
      asks: [
        [100.5, 2],
        [101, 3],
      ] as Array<[number, number]>,
      bids: [
        [100, 4],
        [99.5, 2],
      ] as Array<[number, number]>,
      fetchedAt: new Date().toISOString(),
      latencyMs: 10,
    };
    const imb = orderBookImbalance(book);
    expect(imb.bidDepth).toBeCloseTo(100 * 4 + 99.5 * 2, 6);
    expect(imb.askDepth).toBeCloseTo(100.5 * 2 + 101 * 3, 6);
    expect(imb.imbalance).toBeCloseTo(
      (imb.bidDepth - imb.askDepth) / (imb.bidDepth + imb.askDepth),
      6,
    );
    expect(imb.spreadPct).toBeCloseTo(((100.5 - 100) / 100) * 100, 6);
  });
});

describe("analyzeCandles composite", () => {
  it("produces a full analysis for a 60-candle series and refuses <30", () => {
    const candles = makeCandles(
      Array.from(
        { length: 60 },
        (_, i) => 100 + Math.sin(i / 3) * 10 + i * 0.5,
      ),
    );
    const a = analyzeCandles({
      symbol: "BTC-USDT",
      venue: "kraken",
      intervalMinutes: 1440,
      candles,
    });
    expect(a).not.toBeNull();
    expect(a!.candleCount).toBe(60);
    expect(a!.rsi14).not.toBeNull();
    expect(a!.realizedVolatilityPct).not.toBeNull();
    expect(a!.trend).not.toBe("insufficient");
    const short = analyzeCandles({
      symbol: "BTC-USDT",
      venue: "kraken",
      intervalMinutes: 1440,
      candles: candles.slice(0, 20),
    });
    expect(short).toBeNull();
  });
  it("flags a volume-spike anomaly", () => {
    const candles = makeCandles(new Array(40).fill(100));
    candles[39].volumeBase = 99999;
    const a = analyzeCandles({
      symbol: "BTC-USDT",
      venue: "okx",
      intervalMinutes: 60,
      candles,
    });
    expect(a!.anomalies.some((x) => x.startsWith("volume spike"))).toBe(true);
  });
  it("freshness check honors max age", () => {
    const now = Date.now();
    expect(isFresh(new Date(now - 1000).toISOString(), now, 5000)).toBe(true);
    expect(isFresh(new Date(now - 60000).toISOString(), now, 5000)).toBe(false);
    expect(isFresh("garbage", now, 5000)).toBe(false);
  });
});
