// ============================================================================
// ARCHIE MARKET INTELLIGENCE — FINANCIAL INSTRUMENT REGISTRY
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/registry.ts
//
// Authoritative specification registry for Forex, Crypto, Stocks, and Indices.
// Enforces precise lot sizes, tick sizes, pip definitions, session hours,
// and derivative/proxy distinctions.
// ============================================================================

import type { InstrumentSpec, MarketCategory } from "./types.ts";

export const FINANCIAL_INSTRUMENTS: Record<string, InstrumentSpec> = {
  // --------------------------------------------------------------------------
  // 1. FOREIGN EXCHANGE (FOREX)
  // --------------------------------------------------------------------------
  "EUR/USD": {
    symbol: "EUR/USD",
    canonicalName: "Euro / US Dollar",
    category: "FOREX",
    baseAsset: "EUR",
    quoteAsset: "USD",
    tickSize: 0.00001,
    pipSize: 0.0001,
    contractOrLotSize: 100_000, // 1 standard lot = 100k base
    minVolume: 0.01,
    maxLeverage: 30,
    settlementType: "SPOT",
    tradingSessions: [
      { name: "London", openUtcHour: 7, closeUtcHour: 16 },
      { name: "New York", openUtcHour: 12, closeUtcHour: 21 },
      { name: "Tokyo", openUtcHour: 0, closeUtcHour: 9 },
    ],
  },
  "GBP/USD": {
    symbol: "GBP/USD",
    canonicalName: "British Pound / US Dollar",
    category: "FOREX",
    baseAsset: "GBP",
    quoteAsset: "USD",
    tickSize: 0.00001,
    pipSize: 0.0001,
    contractOrLotSize: 100_000,
    minVolume: 0.01,
    maxLeverage: 30,
    settlementType: "SPOT",
  },
  "USD/JPY": {
    symbol: "USD/JPY",
    canonicalName: "US Dollar / Japanese Yen",
    category: "FOREX",
    baseAsset: "USD",
    quoteAsset: "JPY",
    tickSize: 0.001,
    pipSize: 0.01,
    contractOrLotSize: 100_000,
    minVolume: 0.01,
    maxLeverage: 30,
    settlementType: "SPOT",
  },
  "AUD/USD": {
    symbol: "AUD/USD",
    canonicalName: "Australian Dollar / US Dollar",
    category: "FOREX",
    baseAsset: "AUD",
    quoteAsset: "USD",
    tickSize: 0.00001,
    pipSize: 0.0001,
    contractOrLotSize: 100_000,
    minVolume: 0.01,
    maxLeverage: 30,
    settlementType: "SPOT",
  },

  // --------------------------------------------------------------------------
  // 2. CRYPTOCURRENCY
  // --------------------------------------------------------------------------
  "BTC/USDT": {
    symbol: "BTC/USDT",
    canonicalName: "Bitcoin / Tether USD",
    category: "CRYPTO",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    tickSize: 0.01,
    pipSize: 1.0,
    contractOrLotSize: 1, // 1 BTC
    minVolume: 0.0001,
    maxLeverage: 5,
    settlementType: "SPOT",
  },
  "ETH/USDT": {
    symbol: "ETH/USDT",
    canonicalName: "Ethereum / Tether USD",
    category: "CRYPTO",
    baseAsset: "ETH",
    quoteAsset: "USDT",
    tickSize: 0.01,
    pipSize: 0.1,
    contractOrLotSize: 1,
    minVolume: 0.001,
    maxLeverage: 5,
    settlementType: "SPOT",
  },
  "SOL/USDT": {
    symbol: "SOL/USDT",
    canonicalName: "Solana / Tether USD",
    category: "CRYPTO",
    baseAsset: "SOL",
    quoteAsset: "USDT",
    tickSize: 0.01,
    pipSize: 0.05,
    contractOrLotSize: 1,
    minVolume: 0.01,
    maxLeverage: 3,
    settlementType: "SPOT",
  },

  // --------------------------------------------------------------------------
  // 3. STOCKS & EQUITIES
  // --------------------------------------------------------------------------
  "AAPL": {
    symbol: "AAPL",
    canonicalName: "Apple Inc.",
    category: "STOCKS",
    baseAsset: "AAPL",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1, // 1 Share
    minVolume: 1,
    maxLeverage: 2,
    settlementType: "EQUITY",
    tradingSessions: [
      { name: "US_REGULAR", openUtcHour: 13.5, closeUtcHour: 20 },
    ],
  },
  "NVDA": {
    symbol: "NVDA",
    canonicalName: "NVIDIA Corporation",
    category: "STOCKS",
    baseAsset: "NVDA",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 2,
    settlementType: "EQUITY",
    tradingSessions: [
      { name: "US_REGULAR", openUtcHour: 13.5, closeUtcHour: 20 },
    ],
  },
  "MSFT": {
    symbol: "MSFT",
    canonicalName: "Microsoft Corporation",
    category: "STOCKS",
    baseAsset: "MSFT",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 2,
    settlementType: "EQUITY",
  },

  // --------------------------------------------------------------------------
  // 4. STOCK MARKET INDICES
  // --------------------------------------------------------------------------
  "SPX": {
    symbol: "SPX",
    canonicalName: "S&P 500 Index (Cash Index)",
    category: "INDICES",
    baseAsset: "SPX",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 1,
    settlementType: "CASH_INDEX",
    underlyingOrProxy: "Direct Cash Index Calculation",
  },
  "SPY": {
    symbol: "SPY",
    canonicalName: "SPDR S&P 500 ETF Trust (SPX Liquid Proxy)",
    category: "INDICES",
    baseAsset: "SPY",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 2,
    settlementType: "EQUITY",
    underlyingOrProxy: "ETF Proxy for S&P 500",
  },
  "NDX": {
    symbol: "NDX",
    canonicalName: "Nasdaq 100 Index (Cash Index)",
    category: "INDICES",
    baseAsset: "NDX",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 1,
    settlementType: "CASH_INDEX",
    underlyingOrProxy: "Direct Cash Index Calculation",
  },
  "QQQ": {
    symbol: "QQQ",
    canonicalName: "Invesco QQQ Trust (Nasdaq 100 Liquid Proxy)",
    category: "INDICES",
    baseAsset: "QQQ",
    quoteAsset: "USD",
    tickSize: 0.01,
    contractOrLotSize: 1,
    minVolume: 1,
    maxLeverage: 2,
    settlementType: "EQUITY",
    underlyingOrProxy: "ETF Proxy for Nasdaq 100",
  },
};

export function getInstrumentSpec(symbol: string): InstrumentSpec | null {
  const norm = symbol.trim().toUpperCase();
  if (FINANCIAL_INSTRUMENTS[norm]) return FINANCIAL_INSTRUMENTS[norm];
  
  // Also check slash replacement (e.g. EUR_USD -> EUR/USD or BTC-USDT -> BTC/USDT)
  const slashNorm = norm.replace(/[_\-]/g, "/");
  if (FINANCIAL_INSTRUMENTS[slashNorm]) return FINANCIAL_INSTRUMENTS[slashNorm];

  return null;
}

export function listInstrumentsByCategory(cat: MarketCategory): InstrumentSpec[] {
  return Object.values(FINANCIAL_INSTRUMENTS).filter((i) => i.category === cat);
}
