// Supabase Edge Function: archie-anatomy
// =========================================================
// FRELUX ARCHIE — COGNITIVE ANATOMY FOUNDATION
//
// The live anatomy surface: runs REAL health probes across
// all 22 anatomical subsystems, persists the snapshot to
// archie_subsystem_status (service-role write, humans only
// read), and returns the live anatomy + verified constitution
// to the Owner.
//
// Security:
//   * Owner-only: requires the caller's Supabase JWT AND an
//     admin profile. No visitor access, ever.
//   * Read-only with respect to everything except
//     archie_subsystem_status (the probe snapshot itself).
//   * Honest statuses only: HEALTHY / DEGRADED / OFFLINE /
//     NOT_OPERATIONAL from real probes — never fabricated.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  runAnatomyHealth,
  type AnatomyDb,
  type ProbeResult,
} from "../_shared/archie-ai/anatomy/registry.ts";
import {
  CONSTITUTION_VERSION,
  CONSTITUTION_CHECKSUM,
  verifyConstitution,
} from "../_shared/archie-ai/anatomy/constitution.ts";
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

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
  // Fix 2026-09-14: the PWA invokes via supabase.functions.invoke which sends POST;
  // accept both so the Anatomy probe never 405s on its own client.
  if (req.method !== "GET" && req.method !== "POST")
    return json(405, { error: "Method not allowed" });

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

  try {
    // ---- Run the REAL health probes ----
    const db = service as unknown as AnatomyDb;
    const probes: ProbeResult[] = await runAnatomyHealth(db);

    // ---- Persist the snapshot (service-role write only) ----
    for (const p of probes) {
      await service.from("archie_subsystem_status").upsert(
        {
          subsystem_key: p.subsystem_key,
          status: p.status,
          details: p.details,
          metric: p.metric ?? null,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "subsystem_key" },
      );
    }

    // ---- Constitution (DNA) verification against DB ----
    const { data: constRows } = await service
      .from("archie_constitution")
      .select("*")
      .order("version", { ascending: false })
      .limit(1);
    const row = (constRows ?? [null])[0] as {
      version: number;
      checksum: string;
      articles: Record<string, unknown>;
    } | null;
    const dna = verifyConstitution(row);

    // ---- Registry view (skeleton) with live status joined ----
    const { data: subsystems } = await service
      .from("archie_subsystems")
      .select("*")
      .order("ordinal", { ascending: true });
    const { data: status } = await service
      .from("archie_subsystem_status")
      .select("*");

    const statusByKey = new Map(
      (status ?? []).map((s: { subsystem_key: string }) => [
        s.subsystem_key,
        s,
      ]),
    );
    const anatomy = (subsystems ?? []).map((s: Record<string, unknown>) => ({
      ...s,
      live_status: statusByKey.get(s.key as string) ?? null,
    }));

    const summary = {
      healthy: probes.filter((p) => p.status === "HEALTHY").length,
      degraded: probes.filter((p) => p.status === "DEGRADED").length,
      offline: probes.filter((p) => p.status === "OFFLINE").length,
      not_operational: probes.filter((p) => p.status === "NOT_OPERATIONAL")
        .length,
      total: probes.length,
    };

    return json(200, {
      constitution: {
        version: CONSTITUTION_VERSION,
        verified: dna.verified,
        checksum: CONSTITUTION_CHECKSUM,
        articles: row?.articles ?? null,
      },
      anatomy,
      summary,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return json(500, {
      error: err instanceof Error ? err.message : "Anatomy probe failed",
    });
  }
});
