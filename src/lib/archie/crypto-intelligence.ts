// =========================================================
// FRELUX PHASE 8 P5, ARCHIE CRYPTO & DIGITAL ASSET
// INTELLIGENCE (OWNER-ONLY DOMAIN)
//
// A dedicated ARCHIE intelligence domain for legitimate
// crypto/digital-asset research. Integrated into the ARCHIE
// core (domains registry + knowledge pipeline), never a
// separate chatbot.
//
// HARD RULES ENFORCED HERE AND SERVER-SIDE:
//   * Every piece of output carries a CLASSIFICATION from
//     CRYPTO_CLASSIFICATION_ORDER. Data is never presented
//     as a higher class than it is.
//   * PREDICTIONS are never guaranteed. Guarantees of profit
//     or outcomes are structurally impossible to produce:
//     cryptoPredictionGuardrails() REJECTS them and every
//     PREDICTION/RECOMMENDATION record carries a mandatory
//     disclaimer.
//   * ARCHIE can NEVER buy, sell, transfer, withdraw or move
//     crypto. FORBIDDEN_FINANCIAL_ACTIONS is the exhaustive
//     denylist checked by assertNoFinancialAction() on every
//     entrypoint. If exchange/wallet integrations are ever
//     added, EXCHANGE_INTEGRATION_REQUIREMENTS is the
//     mandatory governance contract (no withdrawal permission
//     by default, least privilege, owner authorization for
//     every financial action).
//   * Owner-private: the tables behind this module are RLS
//     admin-only. Crypto knowledge never mixes into
//     customer-facing knowledge unless governance expands it.
// =========================================================

/** The classification taxonomy, weakest → strongest claim. */
export const CRYPTO_CLASSIFICATION_ORDER = [
  "LIVE_MARKET_DATA",
  "OBSERVED_INFORMATION",
  "ANALYSIS",
  "RISK_ASSESSMENT",
  "RECOMMENDATION",
  "PREDICTION",
] as const;

export type CryptoClassification = (typeof CRYPTO_CLASSIFICATION_ORDER)[number];

/** Statements that can NEVER accompany crypto intelligence. */
const FORBIDDEN_GUARANTEE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bguaranteed\b/i,
  /\bguarantee(s|d)?\s+(profit|return|profit|gain|outcome|result|success)/i,
  /\brisk[- ]free\b/i,
  /\bcannot lose\b/i,
  /\bcan'?t lose\b/i,
  /\bsure\s+(thing|profit|bet)\b/i,
  /\b100%\s+(safe|profit|return|sure)/i,
  /\bget rich\b/i,
  /\bmoon\b(?=.*(guaranteed|sure|certain))/i,
  /\bcertain(ly)?\s+(profit|gain|return|double|rise)/i,
  /\balways\s+(goes? up|rises?|doubles?)\b/i,
  /\bno risk\b/i,
  /\binfallible\b/i,
];

/** Mandatory disclaimer on RECOMMENDATION and PREDICTION records. */
export const CRYPTO_MANDATORY_DISCLAIMER =
  "Not financial advice. Digital assets are volatile; you can lose " +
  "some or all of your money. Predictions are reasoned estimates, " +
  "never guarantees. All financial decisions remain with the Owner.";

/**
 * Financial actions ARCHIE may NEVER autonomously perform.
 * Exhaustive denylist; checked at every crypto entrypoint.
 */
export const FORBIDDEN_FINANCIAL_ACTIONS: readonly string[] = [
  "buy",
  "sell",
  "swap",
  "transfer",
  "withdraw",
  "deposit",
  "move",
  "bridge",
  "stake",
  "unstake",
  "trade",
  "send",
  "sign_transaction",
  "approve_spending",
];

export function assertNoFinancialAction(action: string): void {
  const normalized = action
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (FORBIDDEN_FINANCIAL_ACTIONS.includes(normalized)) {
    throw new Error(
      `ARCHIE cannot autonomously perform financial actions. ` +
        `"${action}" is restricted: ARCHIE provides research, analysis, ` +
        `risk assessment and recommendations only. Financial decisions ` +
        `and execution remain under Owner control.`,
    );
  }
}

/**
 * Guardrails for prediction/recommendation text. Returns the
 * violations found; empty array = the text may be stored.
 */
export function cryptoPredictionGuardrails(text: string): string[] {
  const violations: string[] = [];
  for (const rx of FORBIDDEN_GUARANTEE_PATTERNS) {
    if (rx.test(text)) {
      violations.push(`forbidden guarantee language: ${rx.source}`);
    }
  }
  return violations;
}

/**
 * Validate + finalize a crypto intelligence record before it is
 * ever persisted. Throws on guaranteed-outcome language or a
 * financial action; appends the mandatory disclaimer to
 * RECOMMENDATION/PREDICTION records.
 */
export function finalizeCryptoRecord(input: {
  classification: CryptoClassification;
  statement: string;
  requested_action?: string;
  disclaimer?: string;
}): { classification: CryptoClassification; statement: string } {
  if (input.requested_action) {
    assertNoFinancialAction(input.requested_action);
  }
  const violations = cryptoPredictionGuardrails(input.statement);
  if (violations.length > 0) {
    throw new Error(
      `Crypto ${input.classification} rejected: predictions must never ` +
        `be presented as guaranteed facts or guaranteed profits. ` +
        `Violations: ${violations.join("; ")}`,
    );
  }
  if (
    input.classification === "RECOMMENDATION" ||
    input.classification === "PREDICTION"
  ) {
    return {
      classification: input.classification,
      statement: input.statement.trim() + "\n\n" + CRYPTO_MANDATORY_DISCLAIMER,
    };
  }
  return {
    classification: input.classification,
    statement: input.statement.trim(),
  };
}

// ---------------------------------------------------------
// Scam / manipulation indicator taxonomy
// ---------------------------------------------------------

export interface CryptoScamIndicator {
  id: string;
  category:
    | "RUG_PULL"
    | "MANIPULATION"
    | "SUSPICIOUS_PROJECT"
    | "CONCENTRATION"
    | "HONEYPOT"
    | "YIELD_FARM";
  label: string;
  description: string;
  /** Cheap textual/structural heuristics usable offline. */
  heuristics: ReadonlyArray<RegExp>;
}

export const CRYPTO_SCAM_INDICATORS: readonly CryptoScamIndicator[] = [
  {
    id: "anon_team",
    category: "SUSPICIOUS_PROJECT",
    label: "Anonymous/unverifiable team",
    description:
      "No verifiable identity, no prior track record, copy-paste bios or hidden founders.",
    heuristics: [
      /\b(anonymous|hidden|pseudonymous)\s+team\b/i,
      /\bdoxx(ed)?\s+later\b/i,
    ],
  },
  {
    id: "guaranteed_apy",
    category: "YIELD_FARM",
    label: "Guaranteed/unrealistic APY",
    description:
      "Fixed or extreme yield promises (e.g. guaranteed 100%+ APY) are a classic Ponzi signature.",
    heuristics: [
      /\bguaranteed\s+\d+\s*%?\s*(apy|apr|roi|return)/i,
      /\b\d{3,}\s*%\s*(apy|apr|roi)\b/i,
    ],
  },
  {
    id: "concentrated_supply",
    category: "CONCENTRATION",
    label: "Concentrated token supply",
    description:
      "A small number of wallets controls a large share of circulating supply.",
    heuristics: [],
  },
  {
    id: "no_audit",
    category: "SUSPICIOUS_PROJECT",
    label: "No audit / unverifiable contract",
    description:
      "Unverified contract source or no credible third-party audit before deposits open.",
    heuristics: [/\bunverified\s+contract\b/i, /\bno\s+(credible\s+)?audit\b/i],
  },
  {
    id: "honeypot_pattern",
    category: "HONEYPOT",
    label: "Honeypot pattern",
    description:
      "Buys succeed, sells are blocked or heavily taxed by contract logic.",
    heuristics: [/\b(can buy|buying works) (but|but) (can'?t|cannot) sell\b/i],
  },
  {
    id: "wash_trading",
    category: "MANIPULATION",
    label: "Wash trading / fake volume",
    description:
      "Volume dominated by circular self-trades or one or two exchange wallets.",
    heuristics: [/\bwash\s?trading\b/i, /\bfake\s+volume\b/i],
  },
  {
    id: "pump_signal",
    category: "MANIPULATION",
    label: "Coordinated pump signaling",
    description:
      "Public calls to coordinate buys at a set time, 'pump groups', Telegram signal pumps.",
    heuristics: [
      /\bpump\s+(group|signal|at\s+\d)/i,
      /\bcoordinated\s+(buy|pump)\b/i,
    ],
  },
];

/** Screen a project description against the indicator taxonomy. */
export function screenForScamIndicators(text: string): CryptoScamIndicator[] {
  return CRYPTO_SCAM_INDICATORS.filter((ind) =>
    ind.heuristics.some((rx) => rx.test(text)),
  );
}

// ---------------------------------------------------------
// Portfolio concentration & risk
// ---------------------------------------------------------

export interface CryptoHolding {
  symbol: string;
  /** Current market value in a common quote currency. */
  value: number;
}

export interface PortfolioRiskReport {
  total_value: number;
  weights: Array<{ symbol: string; weight: number }>;
  /** Herfindahl–Hirschman Index, 0..10000. */
  hhi: number;
  concentration:
    | "WELL_DIVERSIFIED"
    | "MODERATE_CONCENTRATION"
    | "HIGH_CONCENTRATION"
    | "EXTREME_CONCENTRATION";
  largest_weight: number;
  risk_notes: string[];
}

/** HHI thresholds for portfolio concentration. */
export function concentrationFromHhi(
  hhi: number,
): PortfolioRiskReport["concentration"] {
  if (hhi < 1600) return "WELL_DIVERSIFIED";
  if (hhi < 2500) return "MODERATE_CONCENTRATION";
  if (hhi < 5000) return "HIGH_CONCENTRATION";
  return "EXTREME_CONCENTRATION";
}

export function assessPortfolioConcentration(
  holdings: CryptoHolding[],
): PortfolioRiskReport {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  if (total <= 0 || holdings.length === 0) {
    return {
      total_value: 0,
      weights: [],
      hhi: 0,
      concentration: "WELL_DIVERSIFIED",
      largest_weight: 0,
      risk_notes: ["Portfolio is empty or has no positive value."],
    };
  }
  const weights = holdings.map((h) => ({
    symbol: h.symbol,
    weight: h.value / total,
  }));
  const hhi = Math.round(
    weights.reduce((s, w) => s + w.weight * w.weight, 0) * 10_000,
  );
  const largest = Math.max(...weights.map((w) => w.weight));
  const notes: string[] = [];
  const concentration = concentrationFromHhi(hhi);
  if (largest > 0.5) {
    notes.push(
      `Largest position is ${(largest * 100).toFixed(1)}% of the portfolio; ` +
        `a single-asset drawdown dominates total portfolio risk.`,
    );
  }
  if (weights.length < 4) {
    notes.push(
      "Fewer than 4 assets; diversification benefit is structurally limited.",
    );
  }
  if (
    concentration === "HIGH_CONCENTRATION" ||
    concentration === "EXTREME_CONCENTRATION"
  ) {
    notes.push(
      "Consider diversification across assets, sectors and stable value.",
    );
  }
  notes.push(
    "Risk figures describe observed concentration only; they are not a recommendation to trade.",
  );
  return {
    total_value: total,
    weights,
    hhi,
    concentration,
    largest_weight: largest,
    risk_notes: notes,
  };
}

// ---------------------------------------------------------
// Exchange / wallet integration governance contract
// ---------------------------------------------------------

/**
 * If exchange or wallet integrations are added in the future,
 * EVERY item here is mandatory. A proposed integration that
 * violates any invariant is rejected by
 * validateExchangeIntegration().
 */
export const EXCHANGE_INTEGRATION_REQUIREMENTS = [
  "OFFICIAL_AUTH: Use only the provider's official OAuth/API authentication; no credential scraping.",
  "LEAST_PRIVILEGE: Request the minimum scopes/permissions required for read-only research.",
  "NO_WITHDRAWAL_BY_DEFAULT: Withdrawal/transfer permissions must NEVER be granted to the integration.",
  "SERVER_SIDE_CREDENTIALS: Keys/tokens stored server-side (Supabase secrets/edge env) only; never in frontend code or localStorage.",
  "TOKEN_ROTATION: Refresh/rotate tokens on a schedule; immediate revocation path documented and tested.",
  "FULL_AUDIT_LOGGING: Every integration call logged with actor, scope, resource and result.",
  "OWNER_AUTHORIZATION_FOR_FINANCIAL_ACTIONS: Any buy/sell/transfer/withdraw remains an explicit Owner-authorized action, per-operation.",
] as const;

export interface ProposedExchangeIntegration {
  provider: string;
  authentication: string;
  requested_scopes: string[];
  credential_storage: string;
  token_rotation: boolean;
  audit_logging: boolean;
  withdrawal_permission: boolean;
  financial_action_policy: string;
}

/** Validate a proposed integration against the governance contract. */
export function validateExchangeIntegration(
  proposal: ProposedExchangeIntegration,
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  if (proposal.withdrawal_permission) {
    violations.push(
      "Withdrawal permission granted: forbidden by default (NO_WITHDRAWAL_BY_DEFAULT).",
    );
  }
  const wl = proposal.requested_scopes.map((s) => s.toLowerCase());
  const withdrawalScopes = wl.filter((s) =>
    /withdraw|transfer|send|trade|order/.test(s),
  );
  if (withdrawalScopes.length > 0) {
    violations.push(
      `Least-privilege violation: scopes ${withdrawalScopes.join(", ")} grant financial-action capability.`,
    );
  }
  if (!/server[- ]side|supabase|edge/i.test(proposal.credential_storage)) {
    violations.push(
      "Credentials must be stored server-side (SERVER_SIDE_CREDENTIALS).",
    );
  }
  if (!proposal.token_rotation) {
    violations.push("Token rotation is mandatory (TOKEN_ROTATION).");
  }
  if (!proposal.audit_logging) {
    violations.push("Full audit logging is mandatory (FULL_AUDIT_LOGGING).");
  }
  if (!/official|oauth/i.test(proposal.authentication)) {
    violations.push(
      "Only official authentication flows are permitted (OFFICIAL_AUTH).",
    );
  }
  if (!/owner/i.test(proposal.financial_action_policy)) {
    violations.push(
      "Financial actions must remain Owner-authorized (OWNER_AUTHORIZATION_FOR_FINANCIAL_ACTIONS).",
    );
  }
  return { ok: violations.length === 0, violations };
}
