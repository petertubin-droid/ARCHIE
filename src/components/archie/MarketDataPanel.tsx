// =========================================================
// ARCHIE MARKETS PANEL — real market data for ALL markets
// (stocks, crypto, forex, IPOs) through the owner-gated
// archie-market-data edge function (Massive.com feed).
//
// HONESTY CONTRACT:
//   * Every price shows its asOf date + "DAILY" granularity —
//     the current plan carries daily aggregates, NOT intraday.
//   * Symbols the plan is not entitled to show an honest
//     "not entitled" state — nothing is simulated or faked.
// =========================================================

import { useCallback, useEffect, useState } from "react";
import { Search, TrendingUp, TrendingDown, Globe2, Calendar } from "lucide-react";
import {
  fetchIpos,
  fetchMarketQuotes,
  fetchMarketStatus,
  searchTickers,
  type IpoEntry,
  type MarketQuote,
  type MarketStatus,
  type TickerSearchResult,
} from "@/lib/archie/market-client";

const WATCHLIST = [
  "X:BTCUSD",
  "X:ETHUSD",
  "X:SOLUSD",
  "C:EURUSD",
  "C:GBPUSD",
  "C:XAUUSD",
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
];

function fmtPrice(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return v >= 1000
    ? v.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : v.toFixed(v < 2 ? 4 : 2);
}

export default function MarketDataPanel() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [ipos, setIpos] = useState<IpoEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [q, s, i] = await Promise.all([
        fetchMarketQuotes(WATCHLIST).catch(() => null),
        fetchMarketStatus().catch(() => null),
        fetchIpos("pending").catch(() => null),
      ]);
      if (q) {
        setQuotes(q);
        setAsOf(q.find((x) => x.asOf)?.asOf ?? null);
        const anyOk = q.some((x) => x.price !== null);
        setFeedError(anyOk ? null : "Live feed unavailable right now.");
      } else {
        setFeedError("Live feed unavailable right now.");
      }
      if (s) setStatus(s);
      if (i) setIpos(i);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // EOD/daily data: 10-minute re-pull keeps quota safe.
    const t = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const results = await searchTickers(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Feed provenance banner — always visible, always honest */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300">
          <Globe2 className="h-3 w-3" /> LIVE · Massive.com daily feed
        </span>
        <span>
          Granularity: DAILY (end-of-day){asOf ? ` · as of ${new Date(asOf).toLocaleString()}` : ""}
        </span>
        {loading && <span className="text-amber-300">refreshing…</span>}
        {feedError && (
          <span className="flex items-center gap-1 text-rose-400">
            <TrendingDown className="h-3 w-3" /> {feedError}
          </span>
        )}
      </div>

      {/* Watchlist quotes grid — all markets side by side */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {quotes.map((q) => {
          const up = (q.changePerc ?? 0) >= 0;
          return (
            <div
              key={q.ticker}
              className="rounded-xl border border-white/10 bg-slate-900/70 p-3"
              data-testid={`market-tile-${q.ticker}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">{q.ticker}</span>
                <span className="text-[9px] uppercase text-slate-500">
                  {q.ticker.startsWith("X:") ? "crypto" : q.ticker.startsWith("C:") ? "forex" : "stock"}
                </span>
              </div>
              {q.price === null ? (
                <div className="mt-2 text-[10px] text-slate-500">
                  {q.error?.kind === "not_entitled"
                    ? "Not entitled on this plan"
                    : q.error?.kind === "not_configured"
                      ? "Feed not configured"
                      : "No daily bar yet"}
                </div>
              ) : (
                <>
                  <div className="mt-1 text-lg font-bold tabular-nums text-slate-50">
                    {fmtPrice(q.price)}
                  </div>
                  <div
                    className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold ${
                      up ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {q.changePerc === null ? "—" : `${up ? "+" : ""}${q.changePerc}%`}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">
                    H {fmtPrice(q.high)} · L {fmtPrice(q.low)}
                  </div>
                </>
              )}
            </div>
          );
        })}
        {quotes.length === 0 && !loading && (
          <div className="col-span-full rounded-xl border border-white/10 bg-slate-900/70 p-4 text-xs text-slate-400">
            No live quotes available.
          </div>
        )}
      </div>

      {/* Market status */}
      {status && (
        <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3 text-[11px] text-slate-300">
          <span className="font-semibold text-slate-100">Market status:</span>{" "}
          {status.currencies?.crypto === "open" ? "Crypto open" : "Crypto closed"}
          {status.currencies?.fx ? ` · FX ${status.currencies.fx}` : ""}
          {status.market ? ` · US equities ${status.market}` : ""}
        </div>
      )}

      {/* Ticker search — the full Massive reference catalog */}
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
        <form onSubmit={runSearch} className="flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any market — AAPL, TSLA, BTC, EURUSD…"
            data-testid="market-search-input"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-100 outline-none focus:border-amber-400/50"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-400/20 disabled:opacity-50"
          >
            {searching ? "…" : "Search"}
          </button>
        </form>
        {searchResults.length > 0 && (
          <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto" data-testid="market-search-results">
            {searchResults.map((r) => (
              <li
                key={r.ticker}
                className="flex items-center justify-between rounded-lg bg-slate-950/60 px-2 py-1 text-[11px]"
              >
                <span className="font-semibold text-slate-200">{r.ticker}</span>
                <span className="truncate px-2 text-slate-400">{r.name}</span>
                <span className="text-[9px] uppercase text-slate-500">{r.market}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* IPO calendar */}
      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
        <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 text-xs font-semibold text-slate-200">
          <Calendar className="h-3.5 w-3.5 text-amber-300" /> Upcoming IPOs
        </div>
        {ipos.length === 0 ? (
          <div className="pt-2 text-[11px] text-slate-500">
            No pending IPOs on the calendar right now.
          </div>
        ) : (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
            {ipos.map((i) => (
              <li
                key={`${i.ticker}-${i.listingDate}`}
                className="flex items-center justify-between rounded-lg bg-slate-950/60 px-2 py-1 text-[11px]"
              >
                <span className="font-semibold text-slate-200">{i.ticker}</span>
                <span className="truncate px-2 text-slate-400">{i.issuer}</span>
                <span className="text-[10px] text-amber-300">{i.listingDate}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
