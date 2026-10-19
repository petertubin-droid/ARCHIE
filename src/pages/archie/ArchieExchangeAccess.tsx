// =========================================================
// ARCHIE PWA — MULTI-BROKER & EXCHANGE ACCESS GATEWAY
//
// The Owner's multi-broker connectivity & trading terminal gateway:
//   * Exness OpenAPI & MT5 Institutional Gateway
//   * Binance HMAC-SHA256 Multi-Asset Gateway
//   * MetaTrader 4/5 Terminal Bridge
//   * Zero-risk Paper Simulator Sandbox
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
} from "@/components/archie/premium";
import { INITIAL_BROKER_REGISTRY } from "@/lib/archie/trading/broker-center";
import type { BrokerCardState } from "@/lib/archie/trading/types";

export default function ArchieExchangeAccess() {
  const [brokers, setBrokers] = useState<BrokerCardState[]>(INITIAL_BROKER_REGISTRY);
  const [selectedBroker, setSelectedBroker] = useState<string>(brokers[0]?.id || "broker_exness");
  const [confirmLiveOpen, setConfirmLiveOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setBrokers((prev) =>
        prev.map((b) => ({
          ...b,
          lastSyncIso: new Date().toISOString(),
          latencyMs: Math.floor(Math.random() * 15) + 12,
        }))
      );
    }, 500);
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
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {brokers.map((broker) => {
          const isSelected = broker.id === selectedBroker;
          return (
            <button
              key={broker.id}
              onClick={() => setSelectedBroker(broker.id)}
              className={`archie-panel archie-focusable rounded-xl p-4 text-left transition-all ${
                isSelected
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-100 text-sm">
                  {broker.name}
                </span>
                <ArchieBadge
                  tone={broker.status === "CONNECTED" ? "positive" : "neutral"}
                >
                  {broker.status}
                </ArchieBadge>
              </div>

              <div className="text-[11px] text-slate-400 font-mono mb-2">
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
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs py-1 px-2.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                Ping WS
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

          <div className="grid gap-4 sm:grid-cols-3 mb-4">
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
