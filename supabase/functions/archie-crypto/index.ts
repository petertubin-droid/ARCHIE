// Supabase Edge Function: archie-crypto
// =========================================================
// FRELUX PHASE 8 P5 — ARCHIE CRYPTO & DIGITAL ASSET
// INTELLIGENCE (OWNER-ONLY, SERVER-SIDE)
//
// The ONLY server entrypoint for the owner-only crypto domain.
// Mirrors src/lib/archie/crypto-intelligence.ts (source of
// truth for the contracts re-validated here):
//
//   * Admin/owner authorization verified server-side on every
//     call (JWT → profile role). No client can read or write
//     crypto intelligence.
//   * Every analysis record is CLASSIFIED (LIVE_MARKET_DATA →
//     OBSERVED_INFORMATION → ANALYSIS → RISK_ASSESSMENT →
//     RECOMMENDATION → PREDICTION).
//   * Guaranteed-profit/prediction language is REJECTED before
//     insert; RECOMMENDATION/PREDICTION rows always carry the
//     mandatory disclaimer.
//   * Financial execution is impossible: assertNoFinancialAction
//     rejects buy/sell/transfer/withdraw/move/… on every action.
//     ARCHIE provides research, analysis and risk assessment only;
//     financial decisions remain under Owner control.
//   * Market fetches go to a public read-only API (CoinGecko),
//     every observation stored with provenance (source, time).
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ---- contracts mirrored from src/lib/archie/crypto-intelligence.ts ----
const CRYPTO_MANDATORY_DISCLAIMER =
  "Not financial advice. Digital assets are volatile; you can lose " +
  "some or all of your money. Predictions are reasoned estimates, " +
  "never guarantees. All financial decisions remain with the Owner.";

const FORBIDDEN_FINANCIAL_ACTIONS = [
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

const FORBIDDEN_GUARANTEE_PATTERNS = [
  /\bguaranteed\b/i,
  /\bguarantee(s|d)?\s+(profit|return|gain|outcome|result|success)/i,
  /\brisk[- ]free\b/i,
  /\bcannot lose\b/i,
  /\bcan'?t lose\b/i,
  /\bsure\s+(thing|profit|bet)\b/i,
  /\b100%\s+(safe|profit|return|sure)/i,
  /\bget rich\b/i,
  /\bcertain(ly)?\s+(profit|gain|return|double|rise)/i,
  /\balways\s+(goes? up|rises?|doubles?)\b/i,
  /\bno risk\b/i,
  /\binfallible\b/i,
];

const CLASSIFICATIONS = [
  "LIVE_MARKET_DATA",
  "OBSERVED_INFORMATION",
  "ANALYSIS",
  "RISK_ASSESSMENT",
  "RECOMMENDATION",
  "PREDICTION",
] as const;

function assertNoFinancialAction(action: string): string | null {
  const normalized = action
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (FORBIDDEN_FINANCIAL_ACTIONS.includes(normalized)) {
    return `ARCHIE cannot autonomously perform financial actions. "${action}" is restricted: ARCHIE provides research, analysis, risk assessment and recommendations only.`;
  }
  return null;
}

function guaranteeViolations(text: string): string[] {
  return FORBIDDEN_GUARANTEE_PATTERNS.filter((rx) => rx.test(text)).map(
    (rx) => rx.source,
  );
}

/** Herfindahl–Hirschman concentration for the portfolio action. */
function concentration(holdings: Array<{ symbol: string; value: number }>) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  if (total <= 0 || holdings.length === 0) {
    return {
      total_value: 0,
      hhi: 0,
      concentration: "WELL_DIVERSIFIED",
      largest_weight: 0,
      weights: [],
    };
  }
  const weights = holdings.map((h) => ({
    symbol: h.symbol,
    weight: h.value / total,
  }));
  const hhi = Math.round(
    weights.reduce((s, w) => s + w.weight * w.weight, 0) * 10_000,
  );
  const concentrationLabel =
    hhi < 1600
      ? "WELL_DIVERSIFIED"
      : hhi < 2500
        ? "MODERATE_CONCENTRATION"
        : hhi < 5000
          ? "HIGH_CONCENTRATION"
          : "EXTREME_CONCENTRATION";
  return {
    total_value: total,
    hhi,
    concentration: concentrationLabel,
    largest_weight: Math.max(...weights.map((w) => w.weight)),
    weights,
  };
}

async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  // FIX 27 (remediation batch 9, Level 6 security audit
  // 2026-09-13): the Supabase REST gateway requires BOTH the
  // apikey header and the bearer token (supabase-js always
  // sends both). Without apikey, Kong rejects every call with
  // 401 "No API key found in request" — this entire function's
  // REST reads/writes were dead in production. Same convention
  // as archie-owner-auth / api-credential-store, plus the
  // trailing-slash-safe join.
  const base = SUPABASE_URL.endsWith("/") ? SUPABASE_URL : `${SUPABASE_URL}/`;
  const res = await fetch(`${base}${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      data: null,
      error: (body as { message?: string })?.message ?? `HTTP ${res.status}`,
    };
  }
  return { data: body as T, error: null };
}

// SSRF-safe: fixed public host, ids validated against the registry.
const COINGECKO = "https://api.coingecko.com/api/v3";

serveWithCors(async (req: Request) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only." });

  // ---- authentication + owner/admin authorization (server-side) ----
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json(401, { error: "Authentication required." });
  }
  const callerToken = authHeader.replace("Bearer ", "");
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
  });
  const { data: auth, error: authErr } = await caller.auth.getUser();
  if (authErr || !auth?.user) return json(401, { error: "Invalid session." });

  const { data: profile } = await service<{ role: string }>(
    `/rest/v1/profiles?id=eq.${auth.user.id}&select=role`,
  ).then((r) =>
    Array.isArray(r.data) ? { data: r.data[0] ?? null, error: r.error } : r,
  );
  if (profile?.role !== "admin") {
    return json(403, {
      error: "Crypto intelligence is Owner/Admin-only.",
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const action = String(payload.action ?? "");

  // A financial action is NEVER valid on any crypto endpoint.
  const financialError = assertNoFinancialAction(action);
  if (financialError) return json(403, { error: financialError });

  // ---- action: fetch live market data (public API) ----
  if (action === "market") {
    const symbols = (
      Array.isArray(payload.symbols) ? (payload.symbols as string[]) : ["BTC"]
    )
      .map((s) => s.trim().toUpperCase())
      .slice(0, 20);
    const { data: assets } = await service<
      Array<{ symbol: string; provider_ref: string }>
    >(
      `/rest/v1/frelux_archie_crypto_assets?is_active=eq.true&select=symbol,provider_ref`,
    );
    const registry = (assets ?? []).filter((a) => symbols.includes(a.symbol));
    if (registry.length === 0) {
      return json(400, {
        error: "No registered active assets for those symbols.",
      });
    }
    const ids = registry
      .map((a) => a.provider_ref)
      .filter(Boolean)
      .join(",");
    const res = await fetch(
      `${COINGECKO}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) {
      return json(502, {
        error: `Market data source unavailable (HTTP ${res.status}).`,
      });
    }
    const raw = await res.json();
    const observations: Array<Record<string, unknown>> = [];
    for (const asset of registry) {
      const p = raw[asset.provider_ref];
      if (!p?.usd) continue;
      observations.push({
        asset_symbol: asset.symbol,
        source: "coingecko:public",
        price_usd: p.usd,
        market_cap_usd: p.usd_market_cap ?? null,
        volume_24h_usd: p.usd_24h_vol ?? null,
        volatility_24h_pct: null,
        change_24h_pct: p.usd_24h_change ?? null,
        raw: p,
        created_by: auth.user.id,
      });
    }
    const { error: insErr } = await service(
      "/rest/v1/frelux_archie_crypto_observations",
      {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(observations),
      },
    );
    if (insErr)
      return json(500, { error: `Failed to record observations: ${insErr}` });
    return json(200, {
      classification: "LIVE_MARKET_DATA",
      disclaimer:
        "Live market data is a point-in-time observation, not a prediction.",
      observed_at: new Date().toISOString(),
      assets: registry.map((a) => ({
        symbol: a.symbol,
        ...(raw[a.provider_ref] ?? {}),
      })),
    });
  }

  // ---- action: store a classified analysis record ----
  if (action === "record_analysis") {
    const classification = String(payload.classification ?? "");
    const statement = String(payload.statement ?? "").trim();
    const assetSymbol = String(payload.asset_symbol ?? "")
      .trim()
      .toUpperCase();
    const requestedAction = payload.requested_action
      ? String(payload.requested_action)
      : null;
    if (
      !CLASSIFICATIONS.includes(
        classification as (typeof CLASSIFICATIONS)[number],
      )
    ) {
      return json(400, {
        error: `classification must be one of ${CLASSIFICATIONS.join(", ")}`,
      });
    }
    if (!statement || !assetSymbol) {
      return json(400, { error: "asset_symbol and statement are required." });
    }
    if (requestedAction) {
      const err = assertNoFinancialAction(requestedAction);
      if (err) return json(403, { error: err });
    }
    const violations = guaranteeViolations(statement);
    if (violations.length > 0) {
      return json(422, {
        error:
          "Crypto predictions must never be presented as guaranteed facts or guaranteed profits.",
        violations,
      });
    }
    const needsDisclaimer =
      classification === "RECOMMENDATION" || classification === "PREDICTION";
    const finalStatement = needsDisclaimer
      ? statement + "\n\n" + CRYPTO_MANDATORY_DISCLAIMER
      : statement;
    const { error: insErr } = await service(
      "/rest/v1/frelux_archie_crypto_analysis",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          asset_symbol: assetSymbol,
          classification,
          statement: finalStatement,
          evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
          cited_sources: Array.isArray(payload.cited_sources)
            ? payload.cited_sources
            : [],
          confidence:
            typeof payload.confidence === "number"
              ? Math.min(1, Math.max(0, payload.confidence))
              : null,
          disclaimer_present: needsDisclaimer,
          requested_action: requestedAction,
          provenance: {
            recorded_by: "archie-crypto",
            recorded_at: new Date().toISOString(),
            actor: auth.user.id,
          },
          created_by: auth.user.id,
        }),
      },
    );
    if (insErr)
      return json(500, { error: `Failed to record analysis: ${insErr}` });
    return json(200, {
      ok: true,
      classification,
      disclaimer_appended: needsDisclaimer,
    });
  }

  // ---- action: portfolio risk (non-custodial notebook) ----
  if (action === "portfolio_risk") {
    const holdings = Array.isArray(payload.holdings)
      ? (payload.holdings as Array<{
          symbol: string;
          quantity?: number;
          value?: number;
        }>)
      : [];
    if (holdings.length === 0)
      return json(400, { error: "holdings[] required." });
    const valued = holdings.map((h) => ({
      symbol: String(h.symbol ?? "").toUpperCase(),
      value: Number(h.value ?? 0) >= 0 ? Number(h.value ?? 0) : 0,
    }));
    const report = concentration(valued);
    return json(200, {
      classification: "RISK_ASSESSMENT",
      report,
      note: "Portfolio figures are Owner-recorded research data. ARCHIE does not hold, move or control any funds.",
    });
  }

  return json(400, {
    error:
      "Unknown action. Valid actions: market, record_analysis, portfolio_risk.",
  });
});
