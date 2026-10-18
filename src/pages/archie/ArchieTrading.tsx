// =========================================================
// ARCHIE PWA — TRADING TERMINAL VIEW (EXNESS GRADE)
//
// The Owner's institutional execution and market intelligence console:
//   * Real-time Multi-Asset Market Watch (Crypto, Forex, Metals, Indices)
//   * Advanced TradingView Candlestick Engine with Multi-Timeframe & Indicators
//   * Exness-grade Order Ticket with 1-click execution & leverage controls
//   * Deterministic Trade-Gate validation backed by archie-trading edge function
//   * Server-authoritative gate enforcement — no client-side credential handling.
// =========================================================

import TradingConsole from "@/components/archie/TradingConsole";

export default function ArchieTrading() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-3 md:px-6 md:py-5">
      <TradingConsole />
    </div>
  );
}
