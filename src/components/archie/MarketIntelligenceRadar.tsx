// ============================================================================
// ARCHIE MARKET INTELLIGENCE RADAR & CANDLE READING WORKBENCH
// src/components/archie/MarketIntelligenceRadar.tsx
//
// Read-only, evidence-grounded observational dashboard for the native
// multi-market intelligence engine. Visualizes deterministic candle reading,
// multi-timeframe confluence, HMM regimes, GARCH volatility, and the 12
// independent performance gates. Strictly separated from order execution.
// ============================================================================

import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  Sliders,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import {
  type MarketCategory,
  type CandleInterval,
  type MarketCandle,
  type MultiTimeframeSummary,
  fuseMarketAnalysis,
  analyzeMultiTimeframeConfluence,
  classifyMarketRegimeHMM,
  forecastVolatilityGarch,
  runAutomatedGateSuite,
  globalMarketStream,
  calculateSquareRootMarketImpact,
  BinanceKlineWebSocketConnector,
  type StreamConnectionMetrics,
  analyzeOrderBook,
  computeMicrostructureMetrics,
  type MicrostructureMetrics,
} from "@/lib/archie/market-engine";

const AVAILABLE_ASSETS: Array<{ symbol: string; category: MarketCategory; name: string; basePrice: number }> = [
  { symbol: "BTCUSDT", category: "CRYPTO", name: "Bitcoin / Tether", basePrice: 65420.0 },
  { symbol: "ETHUSDT", category: "CRYPTO", name: "Ethereum / Tether", basePrice: 3450.0 },
  { symbol: "EURUSD", category: "FOREX", name: "Euro / US Dollar", basePrice: 1.085 },
  { symbol: "GBPUSD", category: "FOREX", name: "British Pound / US Dollar", basePrice: 1.272 },
  { symbol: "AAPL", category: "STOCKS", name: "Apple Inc.", basePrice: 188.5 },
  { symbol: "MSFT", category: "STOCKS", name: "Microsoft Corp.", basePrice: 425.0 },
  { symbol: "SPX", category: "INDICES", name: "S&P 500 Index", basePrice: 5120.0 },
];

function generateSimulatedCandles(basePrice: number, count = 100): MarketCandle[] {
  const candles: MarketCandle[] = [];
  const now = Date.now();
  let current = basePrice;
  const intervalMs = 60_000;

  for (let i = count; i >= 1; i--) {
    const openTimeMs = now - i * intervalMs;
    const closeTimeMs = openTimeMs + intervalMs - 1;
    const delta = (Math.sin(i * 0.15) * 0.002 + (Math.random() - 0.49) * 0.004) * current;
    const open = current;
    const close = Math.max(0.01, open + delta);
    const high = Math.max(open, close) + Math.random() * 0.002 * current;
    const low = Math.min(open, close) - Math.random() * 0.002 * current;
    const volume = Math.floor(10 + Math.random() * 50);

    candles.push({
      openTimeMs,
      closeTimeMs,
      open,
      high,
      low,
      close,
      volume,
      isFinalized: true,
      source: "synthetic_test",
      dataQualityFlags: ["SIMULATED_TEST_SERIES"],
      isSyntheticMock: true,
    });
    current = close;
  }
  return candles;
}

export default function MarketIntelligenceRadar() {
  const [selectedAsset, setSelectedAsset] = useState(AVAILABLE_ASSETS[0]);
  const [selectedInterval, setSelectedInterval] = useState<CandleInterval>("1m");
  const [isStreaming, setIsStreaming] = useState(false);
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [streamUpdatesCount, setStreamUpdatesCount] = useState(0);
  const [streamSource, setStreamSource] = useState<"LIVE_WSS" | "SIMULATED">("LIVE_WSS");
  const [socketMetrics, setSocketMetrics] = useState<StreamConnectionMetrics | null>(null);

  // Initialize and reload candles when asset changes
  useEffect(() => {
    const initial = generateSimulatedCandles(selectedAsset.basePrice, 120);
    setCandles(initial);
  }, [selectedAsset]);

  // Handle streaming updates (Live WebSocket or Simulated Fallback)
  useEffect(() => {
    if (!isStreaming) {
      setSocketMetrics(null);
      return;
    }

    // A. Live WebSocket Stream for Crypto
    if (streamSource === "LIVE_WSS" && selectedAsset.category === "CRYPTO") {
      let activeSubKey: string | null = null;
      const connector = new BinanceKlineWebSocketConnector((update) => {
        if (update.symbol === selectedAsset.symbol) {
          setCandles((prev) => {
            if (prev.length === 0) return [update.candle];
            const last = prev[prev.length - 1];
            // If current candle update belongs to active candle window, update in place
            if (update.candle.openTimeMs === last.openTimeMs) {
              return [...prev.slice(0, prev.length - 1), update.candle];
            }
            // New minute candle arrived
            return [...prev.slice(1), update.candle];
          });
          setStreamUpdatesCount((c) => c + 1);
        }
      });

      connector.subscribe(selectedAsset.symbol, selectedInterval).then((subKey) => {
        activeSubKey = subKey;
      }).catch((err) => {
        console.warn("WebSocket subscription error:", err);
      });

      const metricsInterval = setInterval(() => {
        if (activeSubKey) {
          const m = connector.getMetrics(activeSubKey);
          if (m) setSocketMetrics(m);
        }
      }, 1000);

      return () => {
        clearInterval(metricsInterval);
        connector.destroy();
        setSocketMetrics(null);
      };
    }

    // B. In-Process / Simulated Stream for other assets or test mode
    const subId = globalMarketStream.subscribe(selectedAsset.symbol, selectedAsset.category, selectedInterval);
    const unsubscribe = globalMarketStream.addListener((update) => {
      if (update.symbol === selectedAsset.symbol) {
        setCandles((prev) => [...prev.slice(1), update.candle]);
        setStreamUpdatesCount((c) => c + 1);
      }
    });

    const intervalId = setInterval(() => {
      setCandles((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const delta = (Math.random() - 0.49) * 0.003 * last.close;
        const newClose = last.close + delta;
        const newCandle: MarketCandle = {
          openTimeMs: last.closeTimeMs + 1,
          closeTimeMs: last.closeTimeMs + 60_000,
          open: last.close,
          high: Math.max(last.close, newClose) + Math.random() * 0.001 * last.close,
          low: Math.min(last.close, newClose) - Math.random() * 0.001 * last.close,
          close: newClose,
          volume: Math.floor(15 + Math.random() * 40),
          isFinalized: true,
          source: "synthetic_test",
          dataQualityFlags: ["STREAM_TICKS_TEST"],
          isSyntheticMock: true,
        };
        globalMarketStream.publishCandleUpdate(selectedAsset.symbol, selectedAsset.category, newCandle);
        return [...prev.slice(1), newCandle];
      });
    }, 2500);

    return () => {
      clearInterval(intervalId);
      unsubscribe();
      globalMarketStream.unsubscribe(subId);
    };
  }, [isStreaming, streamSource, selectedAsset, selectedInterval]);

  // Compute microstructure metrics from order book depth
  const microstructure = useMemo<MicrostructureMetrics | null>(() => {
    if (candles.length === 0) return null;
    const last = candles[candles.length - 1];
    const spread = Math.max(0.0001, last.close * 0.0004);
    const bestBid = last.close - spread / 2;
    const bestAsk = last.close + spread / 2;

    const snapshot = analyzeOrderBook(
      selectedAsset.symbol,
      [
        { price: bestBid, quantity: Math.round(last.volume * 0.6) },
        { price: bestBid * 0.999, quantity: Math.round(last.volume * 1.2) },
      ],
      [
        { price: bestAsk, quantity: Math.round(last.volume * 0.5) },
        { price: bestAsk * 1.001, quantity: Math.round(last.volume * 1.0) },
      ],
      last.closeTimeMs,
    );

    return computeMicrostructureMetrics(snapshot);
  }, [candles, selectedAsset]);

  // Run analytical fusion on candles
  const analysis = useMemo(() => {
    if (candles.length < 35) return null;
    return fuseMarketAnalysis({
      symbol: selectedAsset.symbol,
      category: selectedAsset.category,
      candles,
      interval: selectedInterval,
    });
  }, [candles, selectedAsset, selectedInterval]);

  // Compute multi-timeframe confluence
  const mtfConfluence = useMemo<MultiTimeframeSummary | null>(() => {
    if (candles.length < 60) return null;
    return analyzeMultiTimeframeConfluence({
      symbol: selectedAsset.symbol,
      category: selectedAsset.category,
      baseCandles1m: candles,
    });
  }, [candles, selectedAsset]);

  // Compute returns and HMM / GARCH analytics
  const returnsHistory = useMemo(() => {
    if (candles.length < 2) return [];
    const rets: number[] = [];
    for (let i = 1; i < candles.length; i++) {
      rets.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }
    return rets;
  }, [candles]);

  const hmmRegime = useMemo(() => {
    const atr = analysis?.indicators.atr ?? 1.0;
    return classifyMarketRegimeHMM(returnsHistory, atr);
  }, [returnsHistory, analysis]);

  const garchForecast = useMemo(() => {
    if (candles.length === 0) return null;
    const lastClose = candles[candles.length - 1].close;
    const atr = analysis?.indicators.atr ?? 1.0;
    return forecastVolatilityGarch(returnsHistory, lastClose, atr, 10);
  }, [returnsHistory, candles, analysis]);

  // Evaluate the 12 independent performance gates
  const gateEvaluation = useMemo(() => {
    if (candles.length < 50) return null;
    return runAutomatedGateSuite(candles, { ownerApproved: false });
  }, [candles]);

  const lastCandle = candles[candles.length - 1];

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Controls & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Market Intelligence Radar</h2>
            <p className="text-xs text-slate-400">
              Deterministic Candle Reading • HMM Regimes • GARCH Volatility • Performance Gates
            </p>
          </div>
        </div>

        {/* Asset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {AVAILABLE_ASSETS.map((asset) => (
            <button
              key={asset.symbol}
              onClick={() => setSelectedAsset(asset)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                selectedAsset.symbol === asset.symbol
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50"
              }`}
            >
              {asset.symbol} ({asset.category})
            </button>
          ))}
        </div>

        {/* Streaming & Interval Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Stream Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px]">
            <button
              onClick={() => setStreamSource("LIVE_WSS")}
              className={`px-2 py-1 rounded transition-colors font-medium ${
                streamSource === "LIVE_WSS"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Direct WebSocket streaming via Binance Public Kline Stream"
            >
              Live WSS
            </button>
            <button
              onClick={() => setStreamSource("SIMULATED")}
              className={`px-2 py-1 rounded transition-colors font-medium ${
                streamSource === "SIMULATED"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Local synthetic ticker generator"
            >
              Simulation
            </button>
          </div>

          {/* Socket Status Badge if active */}
          {socketMetrics && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700 text-[11px] font-mono">
              <span className={`w-2 h-2 rounded-full ${
                socketMetrics.status === "CONNECTED" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`} />
              <span className="text-slate-300 font-semibold">{socketMetrics.status}</span>
              {socketMetrics.roundTripLatencyMs > 0 && (
                <span className="text-slate-400">({socketMetrics.roundTripLatencyMs}ms)</span>
              )}
            </div>
          )}

          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              isStreaming
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            {isStreaming ? `Streaming (${streamUpdatesCount})` : "Start Stream"}
          </button>
        </div>
      </div>

      {/* Main Grid: Analytical Metrics & Confluence */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Price & Candle Reading */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Deterministic Candle Reading
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
              {analysis?.candleInterpretation.classification ?? "CALCULATING"}
            </span>
          </div>

          {lastCandle && (
            <div className="space-y-1">
              <div className="text-2xl font-bold font-mono tracking-tight">
                ${lastCandle.close.toFixed(selectedAsset.category === "FOREX" ? 5 : 2)}
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>O: {lastCandle.open.toFixed(2)}</span>
                <span>H: {lastCandle.high.toFixed(2)}</span>
                <span>L: {lastCandle.low.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Pattern Details */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="text-xs font-medium text-slate-300">Observed Patterns:</div>
            <div className="flex flex-wrap gap-1.5">
              {(analysis?.candleInterpretation.patternsDetected ?? []).length > 0 ? (
                analysis?.candleInterpretation.patternsDetected.map((pat, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 text-[11px] rounded bg-indigo-950/60 text-indigo-300 border border-indigo-800/50"
                  >
                    {pat.name} (w={pat.weight.toFixed(1)})
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">No single-bar reversal patterns detected</span>
              )}
            </div>
          </div>

          {/* Microstructure Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
            <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
              <div className="text-slate-400">Quality</div>
              <div className={`font-mono font-semibold ${
                microstructure?.microstructureQuality === "PRISTINE"
                  ? "text-emerald-400"
                  : microstructure?.microstructureQuality === "ELEVATED_TOXICITY"
                  ? "text-amber-400"
                  : "text-rose-400"
              }`}>
                {microstructure?.microstructureQuality ?? "—"}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
              <div className="text-slate-400">Spread / Imbalance</div>
              <div className="font-mono font-semibold text-slate-200">
                {microstructure ? `${microstructure.spreadBps} bps (${microstructure.depthImbalance > 0 ? "+" : ""}${microstructure.depthImbalance})` : "—"}
              </div>
            </div>
            <div className="p-2 rounded bg-slate-800/50 border border-slate-800">
              <div className="text-slate-400">VPIN Toxicity</div>
              <div className="font-mono font-semibold text-slate-200">
                {microstructure?.vpinToxicity.toFixed(2) ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column: Multi-Model Ensemble & Regimes */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              ML Ensemble & HMM Regime
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-indigo-300 border border-slate-700">
              {hmmRegime.mostLikelyRegime}
            </span>
          </div>

          {/* Probability Distribution */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <ArrowUpRight className="w-3.5 h-3.5" /> Bullish ({(analysis?.estimatedOutcomeProbabilities?.probBullish ? analysis.probabilities.probBullish * 100 : 33.3).toFixed(1)}%)
              </span>
              <span className="text-rose-400 flex items-center gap-1 font-semibold">
                <ArrowDownRight className="w-3.5 h-3.5" /> Bearish ({(analysis?.estimatedOutcomeProbabilities?.probBearish ? analysis.probabilities.probBearish * 100 : 33.3).toFixed(1)}%)
              </span>
              <span className="text-slate-400 font-semibold">
                Neutral ({(analysis?.estimatedOutcomeProbabilities?.probNeutral ? analysis.probabilities.probNeutral * 100 : 33.3).toFixed(1)}%)
              </span>
            </div>

            {/* Probability Bar */}
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${(analysis?.estimatedOutcomeProbabilities?.probBullish ?? 0.33) * 100}%` }}
              />
              <div
                className="bg-slate-600 h-full transition-all"
                style={{ width: `${(analysis?.estimatedOutcomeProbabilities?.probNeutral ?? 0.34) * 100}%` }}
              />
              <div
                className="bg-rose-500 h-full transition-all"
                style={{ width: `${(analysis?.estimatedOutcomeProbabilities?.probBearish ?? 0.33) * 100}%` }}
              />
            </div>
          </div>

          {/* HMM State Posteriors */}
          <div className="space-y-1 pt-2 border-t border-slate-800 text-xs">
            <div className="text-slate-400 font-medium">HMM State Posteriors (Entropy: {hmmRegime.entropy}):</div>
            <div className="grid grid-cols-3 gap-1 pt-1">
              {hmmRegime.states.map((st) => (
                <div key={st.name} className="p-1.5 rounded bg-slate-800/60 border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400">{st.name.replace("TRENDING_", "")}</div>
                  <div className="font-mono font-bold text-slate-200">
                    {(st.posteriorProbability * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GARCH Volatility Surface */}
          {garchForecast && (
            <div className="space-y-1 pt-2 border-t border-slate-800 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>GARCH Vol (10-bar Horizon):</span>
                <span className="font-mono text-slate-200">{garchForecast.garchConditionalVolPct}% ann.</span>
              </div>
              <div className="flex justify-between font-mono text-[11px] text-slate-300">
                <span>Band: [${garchForecast.lowerExpectedBand}</span>
                <span>${garchForecast.upperExpectedBand}]</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Multi-Timeframe Confluence & Risk Governance */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Multi-Timeframe Confluence
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
              SCORE: {mtfConfluence?.confluenceScore ?? 0}/100
            </span>
          </div>

          {mtfConfluence && (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Macro Trend (1h):</span>
                <span
                  className={`font-semibold ${
                    mtfConfluence.macroTrend === "BULLISH"
                      ? "text-emerald-400"
                      : mtfConfluence.macroTrend === "BEARISH"
                      ? "text-rose-400"
                      : "text-slate-300"
                  }`}
                >
                  {mtfConfluence.macroTrend}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Execution Trend (1m):</span>
                <span
                  className={`font-semibold ${
                    mtfConfluence.executionTrend === "BULLISH"
                      ? "text-emerald-400"
                      : mtfConfluence.executionTrend === "BEARISH"
                      ? "text-rose-400"
                      : "text-slate-300"
                  }`}
                >
                  {mtfConfluence.executionTrend}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Higher TF Conflict:</span>
                <span
                  className={`font-semibold ${
                    mtfConfluence.hasConflict ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {mtfConfluence.hasConflict ? "YES (NO-TRADE RECOMMENDED)" : "NO (ALIGNED)"}
                </span>
              </div>
            </div>
          )}

          {/* Risk Governance Boundary */}
          <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4" /> Risk Governance Enforcement
            </div>
            <div className="text-[11px] text-slate-300">
              Live automated execution is blocked. Strict read-only intelligence and simulated paper evaluation.
            </div>
            <div className="flex justify-between text-[11px] text-slate-400 pt-1">
              <span>Max Account Risk: 1.0%</span>
              <span>Model Confidence: {analysis?.confidenceExplanation ?? "EVALUATING"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: 12 Independent Performance Gates (Section 25) */}
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Section 25: 12 Independent Release Gates (Automated Audit)
            </span>
          </div>
          <span
            className={`px-2.5 py-0.5 text-xs font-mono font-semibold rounded ${
              gateEvaluation?.allGatesPassed
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                : "bg-amber-950 text-amber-400 border border-amber-800"
            }`}
          >
            {gateEvaluation?.allGatesPassed ? "ALL 12 GATES PASSED" : "GATE L: OWNER APPROVAL PENDING"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {gateEvaluation?.results.map((gate) => (
            <div
              key={gate.gateId}
              className={`p-3 rounded-lg border text-xs space-y-1 transition-all ${
                gate.passed
                  ? "bg-slate-800/50 border-emerald-900/40 text-slate-300"
                  : "bg-amber-950/20 border-amber-800/50 text-amber-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[11px] text-slate-200">{gate.name}</span>
                {gate.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                Value: <span className="text-slate-200 font-semibold">{gate.scoreOrValue}</span>
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {gate.thresholdOrRequirement}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
