// Supabase Edge Function: archie-wallet-recovery
// =========================================================
// ARCHIE ABANDONED-WALLET PASSPHRASE RECOVERY (batch 21,
// fix 70, 2026-09-15)
//
// Owner directive (2026-09-11): "implement controlled
// passphrase recovery for my abandoned wallet (using only
// my own details)." The engine existed with full test
// coverage; this is its first runtime surface.
//
// THE SECURITY CONTRACT (mirrored from the engine):
//   * Owner/Admin ONLY (JWT -> profile role 'admin').
//   * The spec (template + candidates + passphrases) comes
//     from the owner; nothing is invented here.
//   * Keys are derived EPHEMERALLY in memory; only public
//     addresses and on-chain facts are returned.
//   * PRIVATE KEYS, SEEDS, MNEMONICS AND PASSPHRASES ARE
//     NEVER PERSISTED, LOGGED OR ECHOED to any ledger. The
//     durable job record stores accounting ONLY (shape,
//     attempt counts, found flag, matched public addresses).
//   * The FULL result (including which candidate matched)
//     is returned to the owner over authenticated HTTPS --
//     the owner then imports THEIR OWN mnemonic/passphrase
//     into THEIR OWN wallet software. ARCHIE never holds or
//     exports private keys, ever.
//   * Hard caps (RECOVERY_CAPS) keep jobs finite; the
//     validator refuses anything beyond them.
//   * Unreachable chains are reported unavailable, never
//     guessed.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import {
  RECOVERY_CAPS,
  renderRecoveryReport,
  runRecoveryJob,
  validateRecoverySpec,
  type RecoveryJobSpec,
} from "../_shared/archie-ai/native-engine/crypto/passphrase-recovery.ts";
import {
  CHAINS,
  defaultRpcFetcher,
} from "../_shared/archie-ai/native-engine/crypto/blockchain.ts";

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

// REST helper (apikey + bearer, Kong convention, fix 27).
async function service<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
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

// ---- spec parsing (fail closed; never invent content) ----
function parseSpec(raw: Record<string, unknown>): RecoveryJobSpec | null {
  try {
    const template = raw.template as Record<string, unknown> | undefined;
    if (
      typeof template !== "object" ||
      template === null ||
      !Array.isArray(template.slots) ||
      !Array.isArray(template.candidates)
    ) {
      return null;
    }
    // slots: known words (string) and blanks (null)
    const slots = template.slots.map((s) =>
      s === null ? null : typeof s === "string" ? s.trim().toLowerCase() : null,
    );
    if (slots.some((s) => s === null && false)) return null;
    const candidates = (template.candidates as unknown[])
      .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      .map((c) => c.trim().toLowerCase());
    const passphrases = Array.isArray(raw.passphrases)
      ? (raw.passphrases as unknown[])
          .filter((p): p is string => typeof p === "string")
          .map((p) => p)
      : undefined;
    if (!passphrases || passphrases.length === 0) return null;
    const accounts = typeof raw.accounts === "number" ? raw.accounts : 2;
    const addressesPerAccount =
      typeof raw.addressesPerAccount === "number" ? raw.addressesPerAccount : 5;
    const chains = Array.isArray(raw.chains)
      ? (raw.chains as unknown[])
          .filter((c): c is string => typeof c === "string")
          .filter((c): c is keyof typeof CHAINS => c in CHAINS)
      : Object.keys(CHAINS);
    const knownAddressHints = Array.isArray(raw.knownAddressHints)
      ? (raw.knownAddressHints as unknown[]).filter(
          (h): h is string => typeof h === "string",
        )
      : [];
    if (slots.length === 0 || candidates.length === 0) return null;
    return {
      template: { slots: slots as Array<string | null>, candidates },
      passphrases,
      accounts,
      addressesPerAccount,
      chains: chains as RecoveryJobSpec["chains"],
      knownAddressHints,
    };
  } catch {
    return null;
  }
}

// ---- non-secret matched-address extraction for the ledger ----
function matchedPublicAddresses(result: {
  results: Array<{
    found: boolean;
    addresses: Array<{ address: string; hasActivity: boolean }>;
  }>;
}): string[] {
  const out: string[] = [];
  for (const r of result.results) {
    if (!r.found) continue;
    for (const a of r.addresses) {
      if (a.hasActivity && !out.includes(a.address)) out.push(a.address);
    }
  }
  return out;
}

serveWithCors(async (req: Request) => {
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only." });

  // ---- authentication + owner/admin authorization ----
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
      error:
        "Wallet recovery is Owner/Admin-only. This surface exists solely for the owner's own wallet, using only the owner's own details.",
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON." });
  }
  const action = String(payload.action ?? "");

  // ---- action: meta (caps + supported chains) ----
  if (action === "meta") {
    return json(200, {
      caps: RECOVERY_CAPS,
      chains: Object.entries(CHAINS).map(([id, info]) => ({
        id,
        name: (info as { name?: string }).name ?? id,
      })),
      contract: [
        "Keys are derived ephemerally in memory; only public addresses are returned.",
        "Mnemonics, passphrases and private keys are NEVER persisted, logged or stored.",
        "The durable job record stores accounting only (shape, attempts, found flag, matched public addresses).",
        "Found means: a checksum-valid candidate derives an address with real on-chain activity. Import YOUR OWN mnemonic/passphrase into YOUR OWN wallet software to take custody.",
        "Run this ONLY from a device you trust.",
      ],
    });
  }

  // ---- action: recover (run the owner's own job) ----
  if (action === "recover") {
    const spec = parseSpec(payload.spec as Record<string, unknown>);
    if (!spec) {
      return json(400, {
        error:
          "recover requires a spec: { template: { slots: (word|null)[], candidates: string[] }, passphrases: string[], accounts?, addressesPerAccount?, chains?, knownAddressHints? }.",
      });
    }
    const v = validateRecoverySpec(spec);
    if (!v.ok) {
      return json(400, { error: `invalid recovery spec: ${v.reason}` });
    }

    // The engine derives keys ephemerally and enforces caps.
    let result;
    try {
      result = await runRecoveryJob(spec, defaultRpcFetcher);
    } catch (err) {
      return json(500, {
        error: `recovery job failed: ${err instanceof Error ? err.message : "unknown error"}. Nothing was persisted.`,
      });
    }

    // Ledger: accounting ONLY -- never candidate content.
    const ledgerErr = await service("/rest/v1/frelux_archie_recovery_jobs", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        slots: result.specSummary.slots,
        blanks: result.specSummary.blanks,
        candidate_pool: result.specSummary.candidatePool,
        passphrase_count: result.specSummary.passphrases,
        accounts: spec.accounts,
        addresses_per_account: spec.addressesPerAccount,
        chains: result.specSummary.chains,
        attempts: result.attempts,
        found: result.found,
        matched_addresses: matchedPublicAddresses(result),
        note: result.note,
        opened_at: new Date(
          Date.parse(result.completedAt) - 1000,
        ).toISOString(),
        completed_at: result.completedAt,
      }),
    });
    // A ledger failure NEVER loses the owner's result.
    const ledgerWarning = ledgerErr.error
      ? `job ledger write failed: ${ledgerErr.error} — the job result below is still complete.`
      : null;

    return json(200, {
      result,
      report: renderRecoveryReport(result),
      ledger_warning: ledgerWarning,
    });
  }

  // ---- action: jobs (owner reads the audit ledger) ----
  if (action === "jobs") {
    const r = await service<Array<Record<string, unknown>>>(
      "/rest/v1/frelux_archie_recovery_jobs?order=opened_at.desc&limit=50" +
        "&select=id,slots,blanks,candidate_pool,passphrase_count,accounts,addresses_per_account,chains,attempts,found,matched_addresses,note,opened_at,completed_at",
    );
    return json(200, { jobs: Array.isArray(r.data) ? r.data : [] });
  }

  return json(400, {
    error: "Unknown action. Valid: meta | recover | jobs.",
  });
});
