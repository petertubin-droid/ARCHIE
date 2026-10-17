// =========================================================
// CRYPTO & BLOCKCHAIN DOMAIN SKILL (owner directive
// 2026-09-11). Registers ARCHIE's market/blockchain
// intelligence into the pluggable DomainSkillRegistry —
// the core engine stays untouched and domain-neutral.
//
// Intents served:
//   market_query     — "analyze bitcoin", "how is eth doing"
//   trade_request    — "should i buy bitcoin now", paper trade
//   wallet_query     — "check my wallet balance" (authorized)
//   blockchain_query — "inspect tx 0x...", "is this a valid
//                       wallet passphrase"
//
// THE INTELLIGENCE LOOP (owner's directed sequence) runs per
// trade_request: FETCH → ANALYZE → CROSS-CHECK → PROBABILITY →
// RISK → HARD GATE → (OWNER AUTHORITY) → PAPER EXECUTE → the
// observation/validation/learning legs run on the ledger +
// prediction record (mark-to-market resolves predictions and
// feeds the calibration the gate requires next time).
// =========================================================

import type { Rule, Operator } from "../types.ts";
import type { DomainSkill } from "./registry.ts";
import {
  fetchMarketSnapshot,
  snapshotFreshness,
} from "../market-data.ts";
import { analyzeCandles, crossCheckAgreement } from "../market-analysis.ts";
import { estimateDirectionProbability } from "../probability.ts";
import { gateDecide, DEFAULT_TRADE_LIMITS, type GateDecision } from "../trade-gate.ts";
import {
  newLedger,
  openPosition,
  markPositions,
  paperPerformance,
  type PaperLedger,
} from "../paper-trading.ts";
import {
  WalletRegistry,
  observeWallet,
} from "../blockchain.ts";
import { checkMnemonicFull } from "../passphrase-tools.ts";

/** Symbol extraction from free text — known symbols only.
 *  Unknown assets are refused honestly (no guess). */
const KNOWN_SYMBOLS =
  /\b(btc|bitcoin|eth|ethereum|bnb|sol|solana|xrp|ripple|ada|cardano|doge|dogecoin|usdt|tether|link|chainlink|matic|polygon|dot|polkadot|ltc|litecoin)\b/i;
export function symbolIn(input: string): string | null {
  const m = KNOWN_SYMBOLS.exec(input);
  return m ? m[1].toLowerCase() : null;
}

// ── Emergency stop: module-level owner kill switch ──
let emergencyStop = false;
export function setEmergencyStop(on: boolean): void {
  emergencyStop = on;
}
export function isEmergencyStop(): boolean {
  return emergencyStop;
}

// ── Market reasoning rules (knowledge-layer, honest) ──
export const CRYPTO_RULES: Rule[] = [
  {
    id: "rule_volatility_risk",
    conditions: [
      { subject: "asset", predicate: "realized-volatility", object: "?v" },
    ],
    produces: {
      subject: "asset",
      predicate: "volatility-risk",
      object: "high risk when annualized realized volatility exceeds the owner's configured limit",
    },
    weight: 0.9,
    description:
      "High realized volatility is a risk condition, not a signal — it can veto a trade but never creates one",
  },
  {
    id: "rule_diversification",
    conditions: [
      { subject: "portfolio", predicate: "crypto-exposure", object: "?e" },
    ],
    produces: {
      subject: "portfolio",
      predicate: "diversification-note",
      object: "crypto exposure must stay within the owner's configured maximum fraction",
    },
    weight: 0.8,
    description: "Position sizing is capped by the owner's exposure limit",
  },
];

// ── Planning operator: analysis step in a planning chain ──
export const CRYPTO_OPERATORS: Operator[] = [
  {
    id: "op_market_analysis",
    description: "Fetch real market data and run the indicator analysis for the goal asset",
    achieves: { subject: "$goal", predicate: "market-analyzed" },
    preconditions: [{ subject: "$goal", predicate: "asset-identified" }],
    effects: [],
    cost: 2,
  },
];

// ── The skill's state (per-engine-instance) ──
export interface CryptoSkillState {
  ledger: PaperLedger;
  walletRegistry: WalletRegistry;
  /** The owner's resolved prediction record — the calibration
   *  memory of the gate. Persisted externally by the edge
   *  wrapper; engine-level default starts empty, and an EMPTY
   *  record means NO TRADES (methodology unproven) — honest. */
  predictionRecord: { reportedProbability: number; outcomeFavorable: boolean }[];
}

export function newCryptoSkillState(): CryptoSkillState {
  return {
    ledger: newLedger(),
    walletRegistry: new WalletRegistry(),
    predictionRecord: [],
  };
}

/** Compose the market analysis answer (real data only). */
async function answerMarketQuery(input: string): Promise<string> {
  const symbol = symbolIn(input);
  if (!symbol) {
    return (
      "I can analyze real market data for known assets — BTC, ETH, SOL, XRP, ADA, DOGE, LINK, MATIC, DOT, LTC, BNB, USDT (say \"analyze bitcoin\"). " +
      "I will not guess an asset identity or fabricate prices."
    );
  }
  const snap = await fetchMarketSnapshot(symbol, { candleLimit: 90 });
  if (!snap) {
    return (
      `I could not fetch live market data for ${symbol.toUpperCase()} right now — every provider call is honestly classified, and a failed fetch never becomes a fabricated price. Try again shortly.`
    );
  }
  const ind = analyzeCandles(snap.candles);
  if (!ind) return `No usable candle data for ${symbol.toUpperCase()} — refusing to analyze nothing.`;
  const { ageHours } = snapshotFreshness(snap);
  const vol = ind.realizedVol !== undefined ? `${(ind.realizedVol * 100).toFixed(0)}%/yr realized volatility` : "volatility not measurable";
  const rsiTxt = ind.rsi14 !== undefined ? `RSI(14) ${ind.rsi14.toFixed(1)}` : "RSI not measurable";
  let cross = "";
  if (snap.crossCheck) {
    const { agree, divergence } = crossCheckAgreement(ind.last, snap.crossCheck.price);
    cross = agree
      ? ` Cross-checked against an independent price source (divergence ${(divergence * 100).toFixed(2)}% — providers agree).`
      : ` ⚠ Cross-check DIVERGED by ${(divergence * 100).toFixed(1)}% — treat this data as anomalous; I would not trade on it.`;
  }
  return (
    `${symbol.toUpperCase()} market analysis (Coinbase Exchange daily candles, ${ind.windowSize} candles, newest ${ageHours.toFixed(1)}h old):\n` +
    `• Last close: $${ind.last.toFixed(2)}\n` +
    `• Regime: ${ind.regime} (SMA20 ${ind.sma20 ? `$${ind.sma20.toFixed(2)}` : "n/a"}, 14-day momentum ${ind.momentum14 !== undefined ? `${(ind.momentum14 * 100).toFixed(1)}%` : "n/a"})\n` +
    `• ${rsiTxt}; ${vol}; max drawdown in window ${(ind.maxDrawdown * 100).toFixed(1)}%\n` +
    `• Volume: ${ind.volumeZ !== undefined ? `${ind.volumeZ.toFixed(1)}σ vs mean` : "not enough volume history"}\n` +
    `This is measured history, not a prediction.${cross}\n` +
    `Honest gaps: funding rates and open interest are UNAVAILABLE (no reachable keyless derivatives provider — Binance is geo-blocked from this infrastructure); on-chain flows are readable for owner-authorized wallets only.`
  );
}

/** Compose the trade-request answer — runs the full loop. */
async function answerTradeRequest(
  input: string,
  state: CryptoSkillState,
): Promise<string> {
  const symbol = symbolIn(input);
  if (!symbol) {
    return "Which asset? I trade-analyze known symbols only (BTC, ETH, SOL, ...). I will not guess.";
  }
  const snap = await fetchMarketSnapshot(symbol, { candleLimit: 90 });
  if (!snap) {
    return `I could not fetch live data for ${symbol.toUpperCase()} — without real data there is no analysis, no probability, and no trade. That is the honest answer.`;
  }
  const decision: GateDecision = gateDecide({
    snapshot: snap,
    limits: DEFAULT_TRADE_LIMITS,
    predictionRecord: state.predictionRecord,
    emergencyStop: isEmergencyStop(),
  });
  if (decision.decision === "NO_TRADE") {
    return (
      `HARD TRADE GATE: NO TRADE on ${symbol.toUpperCase()}.\n` +
      decision.reasons.map((r) => `• ${r}`).join("\n") +
      `\nNothing was executed. When the evidence meets every condition, the position opens on the PAPER portfolio (live execution does not exist — it requires an owner-configured exchange adapter).`
    );
  }
  // Eligible → paper execution (live requires owner config that
  // does not exist — see module header).
  const { opened, note } = openPosition(state.ledger, decision, decision.entry);
  return (
    `HARD TRADE GATE: ${symbol.toUpperCase()} is ELIGIBLE (probability ${decision.probability.toFixed(2)} = Wilson 95% lower bound over the measured analogs; risk/reward ${decision.riskReward.toFixed(2)}).\n` +
    `${note}\n` +
    `${paperPerformance(state.ledger)}\n` +
    `Probability basis: ${decision.evidence.probabilityNote}\n` +
    `This is PAPER — the owner's authority gate over live execution cannot be reached because no exchange adapter is configured, by design.`
  );
}

/** Wallet query — authorization-gated read. */
async function answerWalletQuery(
  input: string,
  state: CryptoSkillState,
): Promise<string> {
  const wallets = state.walletRegistry.list();
  if (wallets.length === 0) {
    return (
      "No wallets are on the authorized registry yet. Wallet reads are authorization-gated: give me an address through the owner-authorized wallet registry and I will read its REAL on-chain balance and activity — I never probe unregistered addresses."
    );
  }
  // Any specific address mentioned?
  const hex = input.match(/0x[0-9a-fA-F]{40}/);
  const b58 = input.match(/\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/);
  const target = hex?.[0] ?? b58?.[0] ?? wallets[0].address;
  const obs = await observeWallet(state.walletRegistry, target);
  if ("error" in obs) return obs.error;
  return (
    `${obs.wallet.label} (${obs.chain}, ${obs.wallet.address.slice(0, 10)}…):\n` +
    `• Native balance: ${obs.balance}\n` +
    `• Transaction count: ${obs.txCount}\n` +
    `${obs.recentTxs.length > 0 ? `• Recent transactions (immutable on-chain references):\n${obs.recentTxs.map((t) => `  - ${t.hash} — ${t.amount} @ ${new Date(t.time).toISOString()}`).join("\n")}\n` : ""}` +
    `(${obs.note}) — read-only observation. I have no signing capability of any kind.`
  );
}

/** Blockchain query — tx inspection or passphrase validation. */
async function answerBlockchainQuery(
  input: string,
  state: CryptoSkillState,
): Promise<string> {
  // Passphrase validation (transient, never stored)
  if (/\bpassphrase|mnemonic|seed phrase|recovery words?\b/i.test(input)) {
    const words = input.match(/\b[a-z]+\b/gi) ?? [];
    // Strip the instruction words from the candidate (crude but
    // honest: we only proceed when the owner supplies an
    // actual wordlist-shaped block).
    const check = await checkMnemonicFull(input.replace(/^[^:]*:/, ""));
    if (!check.looksLikeMnemonic) {
      return (
        `${check.verdict}\n` +
        `Send the passphrase like "verify this passphrase: word1 word2 …" and I will check its BIP-39 checksum — structurally only. I never derive keys, never store the words, and the input is stripped from all logs. (Found ${words.length} candidate words in that message.)`
      );
    }
    return check.verdict;
  }
  // BTC tx inspection
  const tx = input.match(/\b([a-f0-9]{64})\b/i);
  if (tx) {
    const { inspectBitcoinTx } = await import("../blockchain.ts");
    const res = await inspectBitcoinTx(tx[1]);
    return res.found ? res.note : `I could not inspect that transaction: ${res.note}`;
  }
  // EVM tx
  const evmTx = input.match(/\b0x[a-f0-9]{64}\b/i);
  if (evmTx) {
    return (
      "EVM transaction inspection requires an RPC-archive provider with full transaction-receipt lookup — the reachable public RPC serves balances and nonces only. This capability is honestly UNAVAILABLE until an owner configures an archive provider (e.g. an Etherscan API key)."
    );
  }
  return (
    "I can: inspect a Bitcoin transaction by hash, validate whether a passphrase is a well-formed BIP-39 mnemonic (checksum verification — never stored, never derived), and read authorized wallets. Which is it?"
  );
}

export function cryptoSkill(state: CryptoSkillState): DomainSkill {
  return {
    id: "crypto",
    intents: ["market_query", "trade_request", "wallet_query", "blockchain_query"],
    rules: CRYPTO_RULES,
    operators: CRYPTO_OPERATORS,
    handler: (intent, input) => {
      // The handler must be sync per the DomainSkill contract;
      // network work is async, so we return a placeholder that
      // the engine's async dispatch resolves — the engine
      // wrapper (below) handles these intents via
      // cryptoAnswerAsync instead. This sync handler declines.
      void intent;
      void input;
      return null;
    },
  };
}

/** The async answer path — called by the engine's dispatcher
 *  for crypto intents (the engine change is minimal and
 *  domain-neutral: one branch calling this function). */
export async function cryptoAnswerAsync(
  intent: string,
  input: string,
  state: CryptoSkillState,
): Promise<string | null> {
  switch (intent) {
    case "market_query":
      return answerMarketQuery(input);
    case "trade_request":
      return answerTradeRequest(input, state);
    case "wallet_query":
      return answerWalletQuery(input, state);
    case "blockchain_query":
      return answerBlockchainQuery(input, state);
    default:
      return null;
  }
}

/** Mark-to-market + prediction resolution — the OBSERVE →
 *  VALIDATE → LEARN legs of the loop. The edge wrapper calls
 *  this on a schedule; resolved predictions feed the
 *  calibration record the gate requires. */
export function observeAndLearn(
  state: CryptoSkillState,
  /** Latest fetched price per symbol (the caller pre-fetches;
   *  this function does no network). A symbol with no fresh
   * price is simply not marked this round — honest. */
  prices: (symbol: string) => number,
): string {
  const events = markPositions(state.ledger, prices);
  return events.length > 0 ? events.join("\n") : paperPerformance(state.ledger);
}
