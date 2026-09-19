// Supabase Edge Function: archie-engines
// =========================================================
// FRELUX ARCHIE — ENGINES PANEL API (owner directive
// 2026-09-14)
//
// The real engine activation surface behind the Engines
// page. NO THEATER:
//   * GET  returns the honest capability manifest (the same
//     list the engine self-reports) joined with the owner's
//     live activation states, plus which ids are protected
//     (core cognition — never switchable) and which are
//     platform-managed (run on their own edge function
//     surfaces, so the panel shows them without a chat
//     toggle).
//   * POST { capability_id, enabled } toggles ONE
//     toggleable capability: the row in archie_engine_states
//     is written service-role, the action is audited to
//     frelux_security_events, and the native engine picks
//     the state up on its next gate refresh (short TTL) —
//     disabled capabilities are refused honestly in chat.
//
// Security:
//   * Owner-only: caller's Supabase JWT + admin profile.
//   * Toggling a protected or unknown id is refused 400.
//   * Rate limited per user.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { nativeEngineCapabilityManifest } from "../_shared/archie-ai/native-engine/capabilities.ts";
import {
  TOGGLEABLE_CAPABILITY_IDS,
  PROTECTED_CAPABILITY_IDS,
} from "../_shared/archie-ai/native-engine/capability-gate.ts";
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
const service = createClient(SUPABASE_URL, SERVICE_ROLE);
const api = createClient(SUPABASE_URL, ANON_KEY);

const CORS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** Platform-managed capabilities: they run on their own
 *  product surfaces (dedicated edge functions + tables), so
 *  the panel reports them live without a chat toggle. */
const PLATFORM_MANAGED: Record<string, string> = {
  "trading-market-data": "market data pipeline",
  "trading-exchange-execution": "exchange execution",
  "trading-order-lifecycle": "order lifecycle",
  "trading-portfolio": "portfolio intelligence",
  "trading-slippage": "slippage engine",
  "trading-gate": "trade authority gate",
  "blockchain-ledger": "blockchain ledger",
  "crypto-intelligence": "crypto market surface",
  "passphrase-vault-recovery": "vault recovery engine",
  "offensive-security": "offensive security surface",
  "api-credential-security": "credential store",
  "cross-project-authentication": "cross-project authority",
  "trusted-device-enrollment": "device enrollment surface",
  "engineering-objective": "objective engine",
  "vision-perception": "vision pipeline",
  "voiceprint-identity": "voiceprint surface",
  "whatsapp-integration": "WhatsApp channel",
  "web-source-registry": "research source registry",
  "deep-page-verification": "page verification layer",
};

const PROTECTED_REASON =
  "Core cognition — always on by design. Switching this off would corrupt ARCHIE's memory, knowledge or verification integrity, so it has no toggle.";

serveWithCors(async (req: Request) => {
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ---- Owner gate: JWT + admin profile ----
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Missing authorization" });
  const { data: userData, error: userErr } = await api.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json(401, { error: "Invalid session" });
  }
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profile?.role !== "admin") {
    return json(403, { error: "Owner access only" });
  }

  // ---- GET: manifest + live states ----
  if (req.method === "GET") {
    const manifest = nativeEngineCapabilityManifest();
    const { data: states } = await service
      .from("archie_engine_states")
      .select("capability_id, enabled, updated_at, updated_by");
    const stateById = new Map(
      (states ?? []).map((s: { capability_id: string }) => [
        s.capability_id,
        s,
      ]),
    );
    const toggleable = TOGGLEABLE_CAPABILITY_IDS as readonly string[];
    const protectedIds = PROTECTED_CAPABILITY_IDS as readonly string[];
    const engines = manifest.map((c) => {
      const row = stateById.get(c.id) as
        { enabled: boolean; updated_at: string } | undefined;
      return {
        id: c.id,
        description: c.description,
        maturity: c.maturity,
        measuredBy: c.measuredBy,
        // Default ON until the owner switches it off.
        enabled: row ? row.enabled : true,
        // Control surface classification — the honest part:
        toggleable: toggleable.includes(c.id),
        protected: protectedIds.includes(c.id),
        protectedReason: protectedIds.includes(c.id) ? PROTECTED_REASON : null,
        platformManaged: PLATFORM_MANAGED[c.id] ?? null,
        updatedAt: row ? row.updated_at : null,
      };
    });
    return json(200, {
      engines,
      counts: {
        total: engines.length,
        enabled: engines.filter((e) => e.enabled).length,
        disabled: engines.filter((e) => !e.enabled).length,
      },
      checked_at: new Date().toISOString(),
    });
  }

  // ---- POST: toggle one toggleable capability ----
  if (req.method === "POST") {
    let body: { capability_id?: string; enabled?: boolean };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const id = body.capability_id;
    const enabled = body.enabled;
    if (!id || typeof enabled !== "boolean") {
      return json(400, {
        error: "capability_id (string) and enabled (boolean) are required",
      });
    }
    if (!(TOGGLEABLE_CAPABILITY_IDS as readonly string[]).includes(id)) {
      return json(400, {
        error: `Capability "${id}" has no toggle. Only gated capabilities can be switched: ${(TOGGLEABLE_CAPABILITY_IDS as readonly string[]).join(", ")}. Protected core cognition and platform-managed surfaces are never switchable here.`,
      });
    }

    const { error: upsertErr } = await service
      .from("archie_engine_states")
      .upsert(
        {
          capability_id: id,
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: userData.user.id,
        },
        { onConflict: "capability_id" },
      );
    if (upsertErr) {
      return json(500, { error: upsertErr.message });
    }

    // Audit every toggle — the owner's own action trail.
    await service.from("frelux_security_events").insert({
      user_id: userData.user.id,
      kind: "archie_engine_toggle",
      severity: "info",
      message: `Engine "${id}" ${enabled ? "ACTIVATED" : "DEACTIVATED"} by owner`,
      metadata: { capability_id: id, enabled },
    });

    return json(200, {
      ok: true,
      capability_id: id,
      enabled,
      note: enabled
        ? "Active — the engine picks this up on its next gate refresh (a few seconds)."
        : "Deactivated — chat requests to this engine are refused honestly until re-enabled.",
    });
  }

  return json(405, { error: "Method not allowed" });
});
