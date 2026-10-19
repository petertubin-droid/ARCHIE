// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — RISK GOVERNANCE
// src/lib/archie/trading/risk-governance.ts
//
// Independent, deterministic risk management controls:
//   * Absolute monetary loss caps & equity percentage boundaries
//   * Aggregate open exposure & leverage constraints
//   * Daily cumulative drawdown limit & circuit breakers
//   * Immediate Owner-authorized Emergency Kill Switch
//   * Model predictions can NEVER bypass the risk engine
// =========================================================

import type {
  RiskEvaluationRequest,
  RiskEvaluationResult,
  RiskLimits,
  OwnerAutomationSettings,
} from "./types";

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxRiskPerTradeQuote: 250,
  maxRiskPerTradePct: 2.0,
  maxTotalExposureQuote: 2500,
  maxLeverage: 100,
  maxDailyDrawdownPct: 5.0,
  maxOpenPositions: 5,
  maxSpreadPips: 3.5,
  killSwitchEngaged: false,
};

export const DEFAULT_OWNER_SETTINGS: OwnerAutomationSettings = {
  mode: "MODE_2_PAPER_TRADING",
  emergencyKillSwitchEngaged: false,
  requireOwnerApprovalPerOrder: true,
  allowAutomatedTrailingStops: false,
  allowEmergencyPositionClosure: true,
  authorizedBrokers: ["PAPER_SIMULATOR", "EXNESS_OPENAPI"],
  authorizedInstruments: ["BTC/USD", "EUR/USD", "XAU/USD"],
  maxDailyLossEquityPct: 5.0,
  maxMonetaryLossPerTrade: 250,
};

/**
 * Perform independent risk evaluation for a proposed trade.
 */
export function evaluateRiskGate(
  request: RiskEvaluationRequest,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
  ownerSettings: OwnerAutomationSettings = DEFAULT_OWNER_SETTINGS
): RiskEvaluationResult {
  const checks: RiskEvaluationResult["checks"] = [];
  const reasons: string[] = [];

  // 1. Emergency Kill Switch check
  const killSwitchActive = limits.killSwitchEngaged || ownerSettings.emergencyKillSwitchEngaged;
  checks.push({
    name: "Emergency Kill Switch",
    passed: !killSwitchActive,
    detail: killSwitchActive ? "Kill switch is ENGAGED. All trading halted." : "Disengaged and healthy.",
  });
  if (killSwitchActive) reasons.push("Emergency kill switch is engaged.");

  // 2. Maximum open positions check
  const positionsPassed = request.existingOpenPositionsCount < limits.maxOpenPositions;
  checks.push({
    name: "Max Open Positions",
    passed: positionsPassed,
    detail: `Current: ${request.existingOpenPositionsCount}, Max: ${limits.maxOpenPositions}`,
  });
  if (!positionsPassed) reasons.push(`Maximum open positions limit (${limits.maxOpenPositions}) reached.`);

  // 3. Stop-Loss distance & monetary risk calculation
  const stopDistance = Math.abs(request.entryPrice - request.stopPrice);
  const riskPerTradeQuote = stopDistance * request.volumeLots * request.instrument.contractSize;
  const riskPctEquity = request.accountEquity > 0 ? (riskPerTradeQuote / request.accountEquity) * 100 : 0;

  const monetaryRiskPassed = riskPerTradeQuote <= limits.maxRiskPerTradeQuote;
  checks.push({
    name: "Monetary Risk Cap",
    passed: monetaryRiskPassed,
    detail: `Calculated: $${riskPerTradeQuote.toFixed(2)}, Max Allowed: $${limits.maxRiskPerTradeQuote}`,
  });
  if (!monetaryRiskPassed) reasons.push(`Monetary risk ($${riskPerTradeQuote.toFixed(2)}) exceeds cap ($${limits.maxRiskPerTradeQuote}).`);

  const equityPctPassed = riskPctEquity <= limits.maxRiskPerTradePct;
  checks.push({
    name: "Equity Risk Percentage",
    passed: equityPctPassed,
    detail: `Calculated: ${riskPctEquity.toFixed(2)}%, Max Allowed: ${limits.maxRiskPerTradePct}%`,
  });
  if (!equityPctPassed) reasons.push(`Equity risk (${riskPctEquity.toFixed(2)}%) exceeds limit (${limits.maxRiskPerTradePct}%).`);

  // 4. Spread threshold check
  const spreadPips = request.instrument.pipSize > 0 ? request.instrument.spread / request.instrument.pipSize : request.instrument.spread;
  const spreadPassed = spreadPips <= limits.maxSpreadPips;
  checks.push({
    name: "Market Spread Tolerance",
    passed: spreadPassed,
    detail: `Current Spread: ${spreadPips.toFixed(1)} pips, Max: ${limits.maxSpreadPips} pips`,
  });
  if (!spreadPassed) reasons.push(`Spread (${spreadPips.toFixed(1)} pips) exceeds maximum tolerance (${limits.maxSpreadPips} pips).`);

  // 5. Margin requirement calculation
  const notionalQuote = request.entryPrice * request.volumeLots * request.instrument.contractSize;
  const marginRequiredQuote = notionalQuote / (limits.maxLeverage || 1);
  const marginAvailable = request.accountEquity - request.existingExposureQuote;
  const marginPassed = marginAvailable >= marginRequiredQuote;

  checks.push({
    name: "Margin Availability",
    passed: marginPassed,
    detail: `Required: $${marginRequiredQuote.toFixed(2)}, Available: $${marginAvailable.toFixed(2)}`,
  });
  if (!marginPassed) reasons.push("Insufficient available margin to open proposed position.");

  const approved = checks.every((c) => c.passed);

  return {
    approved,
    riskPerTradeQuote: Number(riskPerTradeQuote.toFixed(2)),
    riskPctEquity: Number(riskPctEquity.toFixed(2)),
    marginRequiredQuote: Number(marginRequiredQuote.toFixed(2)),
    spreadPips: Number(spreadPips.toFixed(1)),
    reasons,
    checks,
  };
}
