// =========================================================
// ARCHIE TRADING RISK GOVERNANCE TESTS
// =========================================================
import { describe, it, expect } from "vitest";
import { evaluateRiskGate, DEFAULT_RISK_LIMITS } from "../trading/risk-governance";
import type { RiskEvaluationRequest, MarketInstrument } from "../trading/types";

const mockInstrument: MarketInstrument = {
  symbol: "BTC/USD",
  name: "Bitcoin",
  category: "CRYPTO",
  bid: 68000,
  ask: 68001,
  spread: 1.0,
  change24h: 2.5,
  high24h: 69000,
  low24h: 67000,
  volume24h: "$10B",
  digits: 2,
  contractSize: 1,
  pipSize: 1,
  baseCurrency: "BTC",
  quoteCurrency: "USD",
};

describe("Independent Risk Gate", () => {
  it("approves qualified trade within monetary and leverage limits", () => {
    const request: RiskEvaluationRequest = {
      symbol: "BTC/USD",
      side: "BUY",
      orderType: "MARKET",
      volumeLots: 0.1, // 0.1 BTC = $6800
      entryPrice: 68000,
      stopPrice: 67000, // $1000 distance -> $100 risk on 0.1 lot
      instrument: mockInstrument,
      accountEquity: 10000,
      existingOpenPositionsCount: 1,
      existingExposureQuote: 1000,
    };
    const res = evaluateRiskGate(request, DEFAULT_RISK_LIMITS);
    expect(res.approved).toBe(true);
    expect(res.riskPerTradeQuote).toBe(100);
  });

  it("rejects trade when monetary risk exceeds cap", () => {
    const request: RiskEvaluationRequest = {
      symbol: "BTC/USD",
      side: "BUY",
      orderType: "MARKET",
      volumeLots: 1.0, // 1 BTC
      entryPrice: 68000,
      stopPrice: 65000, // $3000 risk -> exceeds $250 default cap
      instrument: mockInstrument,
      accountEquity: 10000,
      existingOpenPositionsCount: 1,
      existingExposureQuote: 1000,
    };
    const res = evaluateRiskGate(request, DEFAULT_RISK_LIMITS);
    expect(res.approved).toBe(false);
    expect(res.reasons.some((r) => r.includes("exceeds cap"))).toBe(true);
  });

  it("halts trade execution when kill switch is engaged", () => {
    const request: RiskEvaluationRequest = {
      symbol: "BTC/USD",
      side: "BUY",
      orderType: "MARKET",
      volumeLots: 0.05,
      entryPrice: 68000,
      stopPrice: 67500,
      instrument: mockInstrument,
      accountEquity: 10000,
      existingOpenPositionsCount: 1,
      existingExposureQuote: 500,
    };
    const res = evaluateRiskGate(request, { ...DEFAULT_RISK_LIMITS, killSwitchEngaged: true });
    expect(res.approved).toBe(false);
    expect(res.reasons.some((r) => r.includes("kill switch"))).toBe(true);
  });
});
