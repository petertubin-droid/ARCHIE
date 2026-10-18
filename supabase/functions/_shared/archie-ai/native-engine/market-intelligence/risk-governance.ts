// ============================================================================
// ARCHIE MARKET INTELLIGENCE — RISK GOVERNANCE & SAFETY ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/risk-governance.ts
//
// Institutional risk management, exposure caps, and position sizing.
// ENFORCES STRICT NON-EXECUTION: Real brokerage trading is explicitly forbidden
// by code architecture and throws an unbypassable exception.
// ============================================================================

import type { InstrumentSpec } from "./types.ts";

export interface RiskLimits {
  maxRiskPerTradeQuote: number;
  maxDailyLossQuote: number;
  maxOpenExposureQuote: number;
  maxLeverage: number;
  maxSpreadThresholdPct: number;
  enableLiveExecution: boolean; // MUST ALWAYS BE FALSE
}

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxRiskPerTradeQuote: 250,
  maxDailyLossQuote: 1000,
  maxOpenExposureQuote: 5000,
  maxLeverage: 10,
  maxSpreadThresholdPct: 0.002, // 20 bps
  enableLiveExecution: false,
};

/**
 * Calculates safe position sizing based on risk budget, stop distance, and instrument spec.
 */
export function calculatePositionSize(
  entryPrice: number,
  stopLossPrice: number,
  spec: InstrumentSpec,
  limits = DEFAULT_RISK_LIMITS,
): {
  quantityUnits: number;
  lotSize: number;
  riskAmountQuote: number;
  notionalValueQuote: number;
  isEligible: boolean;
  rejectionReason?: string;
} {
  const stopDistance = Math.abs(entryPrice - stopLossPrice);
  if (stopDistance <= 0 || entryPrice <= 0) {
    return {
      quantityUnits: 0,
      lotSize: 0,
      riskAmountQuote: 0,
      notionalValueQuote: 0,
      isEligible: false,
      rejectionReason: "Invalid entry or stop loss price (zero distance).",
    };
  }

  // Raw units = Risk Budget / Price Risk Per Unit
  const rawUnits = limits.maxRiskPerTradeQuote / stopDistance;

  // Adapt to lot/contract size
  const lotSize = rawUnits / (spec.contractOrLotSize || 1);
  const roundedLot = Math.floor(lotSize * 100) / 100;
  const finalUnits = roundedLot * (spec.contractOrLotSize || 1);

  const notionalValue = finalUnits * entryPrice;

  if (notionalValue > limits.maxOpenExposureQuote) {
    return {
      quantityUnits: finalUnits,
      lotSize: roundedLot,
      riskAmountQuote: limits.maxRiskPerTradeQuote,
      notionalValueQuote: notionalValue,
      isEligible: false,
      rejectionReason: `Notional exposure ${notionalValue.toFixed(2)} exceeds maximum cap of ${limits.maxOpenExposureQuote}.`,
    };
  }

  return {
    quantityUnits: finalUnits,
    lotSize: roundedLot,
    riskAmountQuote: finalUnits * stopDistance,
    notionalValueQuote: notionalValue,
    isEligible: true,
  };
}

/**
 * Absolute guard preventing real order dispatch.
 */
export function assertNoLiveTradeAllowed(): void {
  // Hard refusal
  throw new Error(
    "ARCHIE RISK GOVERNANCE: Live broker trade execution is strictly forbidden under system authority rules.",
  );
}
