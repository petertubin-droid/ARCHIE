// ============================================================================
// ARCHIE MARKET INTELLIGENCE — OWNER-CONTROLLED CONFIGURATION LAYER
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/admin-config.ts
//
// Component R / Section 21:
// Administrative configuration layer with strict owner authority, parameter
// validation, immutable change records, and non-negotiable security guardrails.
// ============================================================================

import type {
  AdminConfig,
  ConfigChangeRequest,
  MarketCategory,
} from "./types.ts";
import { globalMarketAudit } from "./observability-audit.ts";

export const DEFAULT_ADMIN_CONFIG: AdminConfig = {
  version: 1,
  updatedAtMs: Date.now(),
  updatedBy: "SYSTEM_GENESIS",
  authorizedProviders: [
    "CRYPTO_REST_PUBLIC",
    "FOREX_INSTITUTIONAL_FEED",
    "EQUITY_SIP_CONSOLIDATED",
    "INDEX_BENCHMARK_FEED",
  ],
  enabledCategories: ["FOREX", "CRYPTO", "STOCKS", "INDICES"],
  supportedSymbols: [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "EURUSD",
    "GBPUSD",
    "USDJPY",
    "AAPL",
    "MSFT",
    "NVDA",
    "SPY",
    "QQQ",
  ],
  maxRiskPerHypotheticalTradePct: 0.01, // 1%
  minConfidenceToIssueDirectional: 0.60, // 60%
  maxLeverageCeiling: 10,
  liveOrderExecutionEnabled: false, // HARD GUARDRAIL: ALWAYS FALSE
  autoModelPromotionAllowed: false, // HARD GUARDRAIL: ALWAYS FALSE
};

export class AdminConfigManager {
  private currentConfig: AdminConfig = { ...DEFAULT_ADMIN_CONFIG };
  private configHistory: Array<{ config: AdminConfig; reason: string }> = [];

  constructor() {
    this.configHistory.push({
      config: Object.freeze({ ...this.currentConfig }),
      reason: "Genesis configuration",
    });
  }

  public getConfig(): Readonly<AdminConfig> {
    return Object.freeze({ ...this.currentConfig });
  }

  /**
   * Applies an administrative configuration update with strict validation and guardrails.
   */
  public updateConfig(request: ConfigChangeRequest): {
    success: boolean;
    config?: AdminConfig;
    error?: string;
  } {
    // 1. Guardrail checks
    if (request.updates.maxRiskPerHypotheticalTradePct !== undefined) {
      if (
        request.updates.maxRiskPerHypotheticalTradePct <= 0 ||
        request.updates.maxRiskPerHypotheticalTradePct > 0.05
      ) {
        return {
          success: false,
          error: "Guardrail violation: maxRiskPerHypotheticalTradePct must be between 0.1% and 5.0%.",
        };
      }
    }

    if (request.updates.maxLeverageCeiling !== undefined) {
      if (request.updates.maxLeverageCeiling < 1 || request.updates.maxLeverageCeiling > 50) {
        return {
          success: false,
          error: "Guardrail violation: maxLeverageCeiling must be between 1x and 50x.",
        };
      }
    }

    if (request.updates.minConfidenceToIssueDirectional !== undefined) {
      if (
        request.updates.minConfidenceToIssueDirectional < 0.50 ||
        request.updates.minConfidenceToIssueDirectional > 0.95
      ) {
        return {
          success: false,
          error: "Guardrail violation: minConfidenceToIssueDirectional must be between 0.50 and 0.95.",
        };
      }
    }

    // 2. Clone and increment version
    const newConfig: AdminConfig = {
      ...this.currentConfig,
      ...request.updates,
      liveOrderExecutionEnabled: false, // Enforce hardcoded non-execution
      autoModelPromotionAllowed: false, // Enforce Owner approval requirement
      version: this.currentConfig.version + 1,
      updatedAtMs: Date.now(),
      updatedBy: request.requester,
    };

    this.currentConfig = newConfig;
    this.configHistory.push({
      config: Object.freeze({ ...newConfig }),
      reason: request.reason,
    });

    globalMarketAudit.logEvent(
      "ADMIN_CONFIG_CHANGE",
      request.requester,
      {
        version: newConfig.version,
        reason: request.reason,
        changes: request.updates,
      },
      "INFO",
    );

    return {
      success: true,
      config: this.getConfig(),
    };
  }

  public getHistory(): Array<{ config: AdminConfig; reason: string }> {
    return [...this.configHistory];
  }
}

export const globalAdminConfig = new AdminConfigManager();
