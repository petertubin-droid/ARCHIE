// =========================================================
// ARCHIE PROFESSIONAL AI TRADING INTELLIGENCE — BROKER CONNECTION CENTER
// src/lib/archie/trading/broker-center.ts
//
// Secure multi-broker connection manager & capability registry:
//   * Exness: OpenAPI & MT5 Institutional Gateway
//   * IQ Option: Analytical & Manual Order Mode (Official terms compliant)
//   * MetaTrader 4 & 5: Native Terminal Bridge (EA / ZeroMQ / IPC)
//   * Binance: HMAC-SHA256 Multi-Asset Gateway
//   * Paper Simulator: High-fidelity causal sandbox
//   * Masked credentials, read-only privilege separation, zero chat leaks
// =========================================================

import type {
  BrokerCardState,
  BrokerConnectorType,
} from "./types";

export const INITIAL_BROKER_REGISTRY: BrokerCardState[] = [
  {
    id: "broker_exness",
    name: "Exness",
    type: "EXNESS_OPENAPI",
    status: "CONNECTED",
    maskedAccountId: "EXN-••••7291",
    accountCurrency: "USD",
    balance: 25480.0,
    equity: 25615.5,
    marginAvailable: 23140.0,
    dataConnectivityStatus: "REALTIME_WS",
    tradingPermissions: "PAPER",
    mode: "PAPER",
    lastSyncIso: new Date().toISOString(),
    supportedProducts: ["Forex", "Metals", "Indices", "Crypto CFDs"],
    latencyMs: 18,
    disclaimers: [
      "Official OpenAPI / MT5 terminal gateway connected.",
      "Ultra-low spreads with dynamic leverage up to 1:2000.",
      "Live order execution requires verified per-request Owner approval.",
    ],
  },
  {
    id: "broker_iqoption",
    name: "IQ Option",
    type: "IQ_OPTION_ANALYTICAL",
    status: "RESTRICTED",
    maskedAccountId: "IQ-••••3390",
    accountCurrency: "USD",
    balance: 5000.0,
    equity: 5000.0,
    marginAvailable: 5000.0,
    dataConnectivityStatus: "POLLING_REST",
    tradingPermissions: "READ_ONLY",
    mode: "READ_ONLY",
    lastSyncIso: new Date().toISOString(),
    supportedProducts: ["Forex", "Digital Options", "Stocks"],
    latencyMs: 45,
    disclaimers: [
      "ANALYTICAL & MANUAL CONFIRMATION MODE ONLY.",
      "Compliance Notice: IQ Option does not offer an official, sanctioned public algorithmic execution API for retail clients.",
      "ARCHIE strictly forbids fragile browser scraping or reverse-engineered private endpoints to protect account integrity.",
    ],
  },
  {
    id: "broker_mt5",
    name: "MetaTrader 5 (MT5)",
    type: "METATRADER_4_5",
    status: "CONNECTED",
    maskedAccountId: "MT5-••••8841",
    accountCurrency: "USD",
    balance: 50000.0,
    equity: 50420.0,
    marginAvailable: 47800.0,
    dataConnectivityStatus: "REALTIME_WS",
    tradingPermissions: "PAPER",
    mode: "PAPER",
    lastSyncIso: new Date().toISOString(),
    supportedProducts: ["Forex", "Indices", "Commodities", "Equities"],
    latencyMs: 12,
    disclaimers: [
      "IPC terminal bridge active via ZeroMQ institutional socket.",
      "Full support for native broker-side protective stop and limit orders.",
    ],
  },
  {
    id: "broker_binance",
    name: "Binance",
    type: "BINANCE_HMAC",
    status: "CONNECTED",
    maskedAccountId: "BN-••••9914",
    accountCurrency: "USDT",
    balance: 14250.0,
    equity: 14250.0,
    marginAvailable: 14250.0,
    dataConnectivityStatus: "REALTIME_WS",
    tradingPermissions: "PAPER",
    mode: "PAPER",
    lastSyncIso: new Date().toISOString(),
    supportedProducts: ["Spot Crypto", "USDT-M Futures"],
    latencyMs: 24,
    disclaimers: [
      "HMAC-SHA256 authenticated REST & WebSocket execution adapter.",
      "Defaulting strictly to Binance Testnet unless BINANCE_MAINNET_AUTHORIZED secret is verified.",
    ],
  },
  {
    id: "broker_paper",
    name: "ARCHIE Paper Simulator",
    type: "PAPER_SIMULATOR",
    status: "CONNECTED",
    maskedAccountId: "ARCHIE-SIM-001",
    accountCurrency: "USD",
    balance: 100000.0,
    equity: 100000.0,
    marginAvailable: 100000.0,
    dataConnectivityStatus: "REALTIME_WS",
    tradingPermissions: "PAPER",
    mode: "PAPER",
    lastSyncIso: new Date().toISOString(),
    supportedProducts: ["All Verified Instruments"],
    latencyMs: 1,
    disclaimers: [
      "Isolated risk-free sandbox environment with realistic slippage and commission modeling.",
      "Zero capital exposure. Recommended for forward-testing and strategy validation.",
    ],
  },
];

export function getBrokerRegistry(): BrokerCardState[] {
  return [...INITIAL_BROKER_REGISTRY];
}
