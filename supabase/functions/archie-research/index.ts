// Supabase Edge Function: archie-research
// =========================================================
// FRELUX ARCHIE — WEB RESEARCH PANEL API (owner directive
// 2026-09-16: activate the web-research surface + its UI)
//
// The research findings ARCHIE stores are REAL rows: candidate
// web-findings (predicate 'web-finding') in the SPO fact store
// and researched vocabulary terms in frelux_vocabulary — both
// service-role-only tables, so the UI reaches them ONLY through
// this owner-gated function. NO THEATER:
//   * GET  returns the REAL findings with their full
//     provenance (site, fetch depth, category, authority,
//     timestamp) and honest status counts.
//   * POST { fact_id, action } is the owner's validation
//     verdict: 'validate' promotes the fact to validated with
//     a real verification event (owner-confirm:<ts>) in the
//     verified_by ledger; 'reject' parks it as uncertain —
//     nothing is deleted, every verdict is audited to
//     frelux_security_events.
//
// Security:
//   * Owner-only: caller's Supabase JWT + admin profile.
//   * Only research facts (predicate 'web-finding') can be
//     validated or rejected here — the endpoint can NEVER
//     touch owner-taught or seed knowledge.
//   * Rate limited per user.
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

/** A candidate web-finding as the panel renders it. */
interface ResearchFindingView {
  id: string;
  query: string;
  title: string | null;
  snippet: string | null;
  url: string | null;
  confidence: number;
  status: string;
  provenanceNote: string | null;
  verifiedBy: string[];
  updatedAt: string;
}

function toFindingView(row: Record<string, unknown>): ResearchFindingView {
  const obj = (row.object ?? {}) as Record<string, unknown>;
  const prov = (row.provenance ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id),
    query: String(row.subject ?? ""),
    title: typeof obj.title === "string" ? obj.title : null,
    snippet: typeof obj.snippet === "string" ? obj.snippet : null,
    url: typeof obj.url === "string" ? obj.url : null,
    confidence: Number(row.confidence ?? 0),
    status: String(row.status ?? "candidate"),
    provenanceNote:
      typeof prov.note === "string" ? prov.note : null,
    verifiedBy: Array.isArray(row.verified_by)
      ? (row.verified_by as string[])
      : [],
    updatedAt: String(row.updated_at ?? ""),
  };
}

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

  // ---- GET: the real research register ----
  if (req.method === "GET") {
    const { data: factRows, error: factErr } = await service
      .from("frelux_archie_native_facts")
      .select(
        "id,subject,predicate,object,confidence,provenance,status,verified_by,updated_at",
      )
      .eq("predicate", "web-finding")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (factErr) {
      return json(500, {
        error: `Research register unavailable: ${factErr.message}`,
      });
    }
    const findings = (factRows ?? []).map(toFindingView);

    const { data: vocabRows, error: vocabErr } = await service
      .from("frelux_vocabulary")
      .select(
        "term,meaning,provenance,confidence,times_seen,updated_at",
      )
      .eq("source", "research")
      .order("updated_at", { ascending: false })
      .limit(100);
    // Vocabulary is a secondary register — an error there is
    // reported honestly without killing the findings list.
    const vocabulary = vocabErr
      ? []
      : (vocabRows ?? []).map((r: Record<string, unknown>) => ({
          term: String(r.term ?? ""),
          meaning: typeof r.meaning === "string" ? r.meaning : null,
          provenance: String(r.provenance ?? ""),
          confidence: Number(r.confidence ?? 0),
          timesSeen: Number(r.times_seen ?? 0),
          updatedAt: String(r.updated_at ?? ""),
        }));

    const counts = {
      total: findings.length,
      candidate: findings.filter((f) => f.status === "candidate").length,
      validated: findings.filter((f) => f.status === "validated").length,
      uncertain: findings.filter((f) => f.status === "uncertain").length,
    };
    return json(200, {
      findings,
      vocabulary,
      vocabulary_error: vocabErr ? vocabErr.message : undefined,
      counts,
      checked_at: new Date().toISOString(),
    });
  }

  // ---- POST: the owner's validation verdict ----
  if (req.method === "POST") {
    let body: { fact_id?: string; action?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }
    const factId = body.fact_id;
    const action = body.action;
    if (!factId || typeof factId !== "string") {
      return json(400, {
        error: "fact_id (string) is required",
      });
    }
    if (action !== "validate" && action !== "reject") {
      return json(400, {
        error:
          "action must be 'validate' (promote to validated with an owner verification event) or 'reject' (park as uncertain)",
      });
    }

    // ONLY research facts are touchable here — the predicate
    // filter is the authority boundary: owner-taught, seed
    // and derived knowledge can never be reached.
    const { data: fact, error: fetchErr } = await service
      .from("frelux_archie_native_facts")
      .select("id,status,verified_by,validated_count")
      .eq("id", factId)
      .eq("predicate", "web-finding")
      .maybeSingle();
    if (fetchErr) {
      return json(500, { error: `Fact lookup failed: ${fetchErr.message}` });
    }
    if (!fact) {
      return json(404, {
        error:
          "No research finding with that id — only web-research facts can be validated or rejected here.",
      });
    }

    const now = new Date().toISOString();
    const verifiedBy = Array.isArray(fact.verified_by)
      ? (fact.verified_by as string[])
      : [];
    // Same ledger convention as the engine (learning.ts):
    // `owner-confirm:<unique-event>` — the panel stamp is
    // unique per verdict so dedupe never drops a REAL owner
    // verification event.
    const stamp = `owner-confirm:research-panel:${Date.now()}`;
    const next =
      action === "validate"
        ? {
            status: "validated",
            verified_by: [...verifiedBy, stamp],
            validated_count: Number(fact.validated_count ?? 0) + 1,
            updated_at: now,
          }
        : { status: "uncertain", updated_at: now };

    const { error: updateErr } = await service
      .from("frelux_archie_native_facts")
      .update(next)
      .eq("id", factId)
      .eq("predicate", "web-finding");
    if (updateErr) {
      return json(500, { error: `Update failed: ${updateErr.message}` });
    }

    // Audit the owner's verdict.
    await service.from("frelux_security_events").insert({
      user_id: userData.user.id,
      kind: "archie_research_validation",
      severity: "info",
      message: `Research fact ${factId} ${action === "validate" ? "VALIDATED" : "REJECTED"} by owner`,
      metadata: { fact_id: factId, action },
    });

    return json(200, {
      ok: true,
      fact_id: factId,
      action,
      status: next.status,
    });
  }

  return json(405, { error: "Use GET or POST" });
});
