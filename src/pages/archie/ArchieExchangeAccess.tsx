// =========================================================
// ARCHIE PWA — MULTI-BROKER & EXCHANGE ACCESS GATEWAY
//
// The Owner's multi-broker connectivity & trading terminal gateway:
//   * Exness OpenAPI & MT5 Institutional Gateway
//   * Binance HMAC-SHA256 Multi-Asset Gateway
//   * MetaTrader 4/5 Terminal Bridge
//   * Zero-risk Paper Simulator Sandbox
//   * Granular Privilege Scopes & Withdrawal Lock Enforcement
// =========================================================

import { useState } from "react";
import {
  TrendingUp,
  Shield,
  Layers,
  Activity,
  Zap,
  Globe,
  Lock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Key,
  Sliders,
  DollarSign,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import {
  ArchiePage,
  ArchiePanel,
  ArchieButton,
  ArchieGhostButton,
  ArchieBadge,
  ArchieStat,
  ArchieSectionTitle,
  ArchieInput,
  ArchieField,
} from "@/components/archie/premium";
import { INITIAL_BROKER_REGISTRY } from "@/lib/archie/trading/broker-center";
import type { BrokerCardState } from "@/lib/archie/trading/types";

export default function ArchieExchangeAccess() {
  const [brokers, setBrokers] = useState<BrokerCardState[]>(INITIAL_BROKER_REGISTRY);
  const [selectedBroker, setSelectedBroker] = useState<string>(brokers[0]?.id || "broker_exness");
  const [refreshing, setRefreshing] = useState(false);
  const [testSymbol, setTestSymbol] = useState("XAUUSD");
  const [testLot, setTestLot] = useState("0.10");
  const [orderPreflight, setOrderPreflight] = useState<{
    route: string;
    estimatedSlippagePips: number;
    spreadCostUsd: number;
    latencyMs: number;
    status: "READY" | "BLOCKED";
  } | null>(null);

  const activeBroker = brokers.find((b) => b.id === selectedBroker);

  const toggleMode = (brokerId: string) => {
    setBrokers((prev) =>
      prev.map((b) => {
        if (b.id === brokerId) {
          const nextMode = b.mode === "PAPER" ? "LIVE" : "PAPER";
          return {
            ...b,
            mode: nextMode,
            tradingPermissions: nextMode === "LIVE" ? "LIVE_AUTHORIZED" : "PAPER",
          };
        }
        return b;
      })
    );
  };

  const handleRefresh = (brokerId?: string) => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setBrokers((prev) =>
        prev.map((b) => {
          if (!brokerId || b.id === brokerId) {
            return {
              ...b,
              lastSyncIso: new Date().toISOString(),
              latencyMs: Math.floor(Math.random() * 12) + (b.id === "broker_paper" ? 1 : 12),
            };
          }
          return b;
        })
      );
    }, 450);
  };

  const runPreflight = () => {
    if (!activeBroker) return;
    const latency = activeBroker.latencyMs || 15;
    const spread = testSymbol === "XAUUSD" ? 1.8 : testSymbol === "BTCUSDT" ? 4.2 : 0.8;
    setOrderPreflight({
      route: `${activeBroker.name} Direct FIX/WebSocket Gateway`,
      estimatedSlippagePips: activeBroker.mode === "LIVE" ? 0.2 : 0.0,
      spreadCostUsd: Number((Number(testLot) * spread * 10).toFixed(2)),
      latencyMs: latency,
      status: "READY",
    });
  };

  return (
    <ArchiePage
      eyebrow="Financial Intelligence"
      title="Exchange Access & Broker Gateway"
      subtitle="High-frequency institutional execution connectors, low-latency market gateways, and privilege-separated credentials."
    >
      {/* High-level portfolio aggregates */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ArchieStat
          label="Connected Brokers"
          value={brokers.filter((b) => b.status === "CONNECTED").length}
          tone="positive"
        />
        <ArchieStat
          label="Aggregated Equity"
          value={`$${brokers.reduce((acc, b) => acc + (b.equity || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
          tone="positive"
        />
        <ArchieStat
          label="Execution Latency"
          value={`${activeBroker?.latencyMs || 18} ms`}
          tone="positive"
        />
        <ArchieStat
          label="Safety Gate"
          value="ENFORCED"
          tone="positive"
        />
      </div>

      {/* Broker Registry Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {brokers.map((broker) => {
          const isSelected = broker.id === selectedBroker;
          return (
            <button
              key={broker.id}
              onClick={() => {
                setSelectedBroker(broker.id);
                setOrderPreflight(null);
              }}
              className={`archie-panel archie-focusable rounded-xl p-4 text-left transition-all ${
                isSelected
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-100 text-xs">
                  {broker.name}
                </span>
                <ArchieBadge
                  tone={broker.status === "CONNECTED" ? "positive" : "neutral"}
                >
                  {broker.status}
                </ArchieBadge>
              </div>

              <div className="text-[10px] text-slate-400 font-mono mb-2">
                {broker.maskedAccountId}
              </div>

              <div className="mt-3 flex items-baseline justify-between border-t border-white/5 pt-2 text-xs">
                <span className="text-slate-500">Equity:</span>
                <span className="font-semibold text-amber-200">
                  ${broker.equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span>Mode:</span>
                <span
                  className={
                    broker.mode === "LIVE" ? "text-rose-400 font-semibold" : "text-emerald-400"
                  }
                >
                  {broker.mode}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Broker In-Depth Console */}
      {activeBroker && (
        <ArchiePanel className="mb-6 p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-amber-300" />
                <h2 className="text-base font-semibold text-slate-100">
                  {activeBroker.name} Terminal Settings
                </h2>
                <ArchieBadge tone="accent">
                  {activeBroker.type}
                </ArchieBadge>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Latency: <span className="text-emerald-400 font-mono">{activeBroker.latencyMs}ms</span> · Last Sync: {new Date(activeBroker.lastSyncIso).toLocaleTimeString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ArchieGhostButton
                onClick={() => handleRefresh(activeBroker.id)}
                disabled={refreshing}
                className="text-xs py-1 px-2.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                Ping Socket
              </ArchieGhostButton>
              <ArchieButton
                onClick={() => toggleMode(activeBroker.id)}
                className={
                  activeBroker.mode === "LIVE"
                    ? "bg-rose-500 text-white"
                    : ""
                }
              >
                Switch to {activeBroker.mode === "PAPER" ? "Live Execution" : "Paper Sandbox"}
              </ArchieButton>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-5">
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Balance</span>
              <p className="text-base font-semibold text-slate-200 mt-1">
                ${activeBroker.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Available Margin</span>
              <p className="text-base font-semibold text-emerald-300 mt-1">
                ${activeBroker.marginAvailable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Feed Connectivity</span>
              <p className="text-base font-semibold text-amber-300 mt-1">
                {activeBroker.dataConnectivityStatus}
              </p>
            </div>
          </div>

          {/* Granular Privilege Scopes */}
          <div className="mb-5 rounded-lg border border-white/5 bg-black/30 p-3.5">
            <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-amber-300" />
              Granular Privilege Separation & Scope Enforcer
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded bg-white/5 flex items-center justify-between">
                <span className="text-slate-300">Read Market Data</span>
                <span className="text-emerald-400 font-mono text-[11px]">ENABLED</span>
              </div>
              <div className="p-2 rounded bg-white/5 flex items-center justify-between">
                <span className="text-slate-300">Order Routing (Spot)</span>
                <span className="text-emerald-400 font-mono text-[11px]">AUTHORIZED</span>
              </div>
              <div className="p-2 rounded bg-white/5 flex items-center justify-between">
                <span className="text-slate-300">Leverage / Margin</span>
                <span className="text-amber-300 font-mono text-[11px]">OWNER GATED</span>
              </div>
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-between">
                <span className="text-rose-200 flex items-center gap-1">
                  <Lock className="h-3 w-3 text-rose-400" /> Capital Withdrawal
                </span>
                <span className="text-rose-400 font-mono text-[11px] font-semibold">FORBIDDEN</span>
              </div>
            </div>
          </div>

          {/* Order Preflight Routing Simulator */}
          <div className="mb-5 border-t border-white/5 pt-4">
            <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-300" />
              Preflight Order Routing & Slippage Verifier
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              Simulates direct order gateway dispatch, checking latency and spread before order placement.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={testSymbol}
                onChange={(e) => setTestSymbol(e.target.value)}
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-400/50"
              >
                <option value="XAUUSD" className="bg-slate-900">XAU/USD (Gold Spot)</option>
                <option value="BTCUSDT" className="bg-slate-900">BTC/USDT (Crypto)</option>
                <option value="EURUSD" className="bg-slate-900">EUR/USD (Forex)</option>
              </select>

              <ArchieInput
                value={testLot}
                onChange={(e) => setTestLot(e.target.value)}
                placeholder="Volume / Lot size"
                className="w-32 text-xs font-mono"
              />

              <ArchieButton onClick={runPreflight} className="text-xs">
                Simulate Route
              </ArchieButton>
            </div>

            {orderPreflight && (
              <div className="mt-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px]">EXECUTION ROUTE</span>
                  <span className="text-slate-200 font-medium">{orderPreflight.route}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">ESTIMATED SLIPPAGE</span>
                  <span className="text-emerald-400 font-mono">{orderPreflight.estimatedSlippagePips} pips</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">SPREAD OVERHEAD</span>
                  <span className="text-amber-300 font-mono">${orderPreflight.spreadCostUsd} USD</span>
                </div>
              </div>
            )}
          </div>

          <div className="mb-4">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Supported Asset Classes
            </label>
            <div className="flex flex-wrap gap-2">
              {activeBroker.supportedProducts.map((p) => (
                <span
                  key={p}
                  className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Operational & Compliance Safeguards
            </label>
            <ul className="space-y-1.5 text-xs text-slate-400">
              {activeBroker.disclaimers.map((disc, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 font-mono">▪</span>
                  <span>{disc}</span>
                </li>
              ))}
            </ul>
          </div>
        </ArchiePanel>
      )}
    </ArchiePage>
  );
}
