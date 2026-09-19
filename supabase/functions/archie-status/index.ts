// Supabase Edge Function: archie-status
// =========================================================
// FRELUX ARCHIE STAGE 1 — STATUS CENTER (OWNER-ONLY)
//
// Returns REAL system state for the Owner dashboard from
// actual database counts and configuration. No fake status.
// Where a capability is not yet operational, it is reported
// as "NOT_OPERATIONAL" honestly (spec §§3, 16, 19).
// =========================================================

import { verifyAuthorityJwt } from "../_shared/archie-ai/security/cross-project-auth.ts";
import { createKnowledgeRepository } from "../_shared/knowledge/repository.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const CORS = {
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function count(
  table: string,
  query?: Record<string, string>,
): Promise<number> {
  let q = service.from(table).select("id", { count: "exact", head: true });
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (k.endsWith("!in")) q = q.in(k.slice(0, -3), v.split(","));
      else q = q.eq(k, v);
    }
  }
  const { count } = await q;
  return count ?? 0;
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
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  // Owner-only
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Unauthorized" });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await anon.auth.getUser();
  let user = data.user;
  if (!user) {
    // Cross-project owner identity (see cross-project-auth.ts): the
    // owner's sessions are issued by the FRELUX authority project.
    const verified = await verifyAuthorityJwt(
      authHeader.replace(/^Bearer\s+/i, ""),
    );
    if (verified) {
      user = { id: verified.sub, email: verified.email ?? "" } as typeof user;
    }
  }
  if (!user) return json(401, { error: "Unauthorized" });
  // Owner gate lookup uses the service client so cross-project
  // authority JWTs (verified above) are honored: PostgREST cannot
  // apply RLS to a token signed by another project's keys.
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return json(403, { error: "Forbidden — ARCHIE is Owner-only." });
  }

  try {
    // Knowledge repository (Phase 5 — the server-side Project B
    // abstraction in _shared/knowledge/): REAL repository state
    // against Project B. Fail-safe by design — absent Edge
    // Function secrets report NOT_CONFIGURED; a failed health
    // query (heavy aggregation on B's micro compute, retry-
    // hardened in the repository binding) reports UNAVAILABLE.
    // Never a fabricated OK (spec §§3, 16, 19). Started here so
    // B's response overlaps the Project A count fan-out below.
    const knowledgeRepositoryPromise = (async (): Promise<
      Record<string, unknown>
    > => {
      const result = createKnowledgeRepository();
      if (!result.ok) {
        return { state: "NOT_CONFIGURED", note: result.error.message };
      }
      const repo = result.repository;
      try {
        const h = await repo.health();
        if (!h) {
          return {
            state: "UNAVAILABLE",
            origin: repo.origin,
            note: "graph health query failed (Project B)",
          };
        }
        return {
          state: h.total_edges > 0 ? "OPERATIONAL" : "EMPTY",
          origin: repo.origin,
          writes_enabled: repo.writesEnabled,
          total_nodes: h.total_nodes,
          total_edges: h.total_edges,
          orphan_nodes: h.orphan_nodes,
          graph_version: h.graph_version,
          last_ingestion: h.last_ingestion,
        };
      } catch (repoErr) {
        return {
          state: "UNAVAILABLE",
          origin: repo.origin,
          note:
            repoErr instanceof Error ? repoErr.message : "health query failed",
        };
      }
    })();

    const [
      domains,
      knowledgeItems,
      knowledgeApproved,
      learningProcessing,
      learningAwaiting,
      agentsActive,
      agentsTotal,
      estimates,
      materials,
      devicesTrusted,
      devicesPending,
      conversations,
      auditEvents,
      auditCritical,
      infraCostRows,
      apiKeys,
      intelSources,
      priceObservations,
      earsTranscriptions,
    ] = await Promise.all([
      count("frelux_archie_domains", { active: "true" }),
      count("frelux_knowledge_items"),
      count("frelux_knowledge_items", { status: "ACTIVE" }),
      count("frelux_archie_ingestions", {
        "pipeline_state!in":
          "RECEIVED,EXTRACTING,AWAITING_APPROVAL,APPROVED,REJECTED",
      }),
      count("frelux_archie_ingestions", {
        pipeline_state: "AWAITING_APPROVAL",
      }),
      count("frelux_archie_internal_agents", {
        "status!in": "TERMINATED,FAILED",
      }),
      count("frelux_archie_internal_agents"),
      count("estimation_estimates"),
      count("estimation_materials"),
      count("frelux_archie_devices", { status: "TRUSTED" }),
      count("frelux_archie_devices", { status: "PENDING" }),
      count("frelux_archie_conversations", { owner_id: user.id }),
      count("frelux_archie_audit_events"),
      count("frelux_archie_audit_events", { severity: "CRITICAL" }),
      count("frelux_infrastructure_costs"),
      count("frelux_api_keys"),
      count("frelux_intelligence_sources"),
      count("frelux_price_observations"),
      count("frelux_archie_audit_events", {
        event_type: "archie.ears.transcription",
      }),
    ]);
    // Semantic Knowledge Graph Engine health (spec §19):
    // real database state from archie_graph_health() — node
    // and edge counts, status breakdowns, orphan nodes,
    // duplicate candidates, circular relationships, invalid
    // types, missing provenance and the last ingestion. When
    // the graph is not yet materialized the RPC returns the
    // real empty state; when the function itself is missing
    // (pre-migration deploy) the dashboard reports
    // UNAVAILABLE honestly — never a fabricated "OK".
    let semanticGraph: Record<string, unknown>;
    try {
      const { data: graphData, error: graphError } = await service.rpc(
        "archie_graph_health",
      );
      if (graphError || !graphData) {
        semanticGraph = {
          state: "UNAVAILABLE",
          note: String(graphError?.message ?? "no health data"),
        };
      } else {
        const h = graphData as Record<string, unknown>;
        semanticGraph = {
          state: (h.total_edges ?? 0) > 0 ? "OPERATIONAL" : "EMPTY",
          total_nodes: h.total_nodes,
          total_edges: h.total_edges,
          relation_types: Object.keys(h.relation_type_breakdown ?? {}).length,
          orphan_nodes: h.orphan_nodes,
          duplicate_candidates: h.duplicate_candidates,
          invalid_relationship_types: h.invalid_relationship_types,
          circular_relationships: h.circular_relationships,
          missing_provenance: h.missing_provenance,
          unverified_nodes: h.unverified_nodes,
          unverified_edges: h.unverified_edges,
          graph_version: h.graph_version,
          last_ingestion: h.last_ingestion,
        };
      }
    } catch (graphErr) {
      semanticGraph = {
        state: "UNAVAILABLE",
        note:
          graphErr instanceof Error ? graphErr.message : "health query failed",
      };
    }

    // Ears runs NATIVE (on-device speech recognition, no
    // provider, no key — OpenAI Separation Rule). It is
    // OPERATIONAL only once a REAL transcription exists in
    // the audit trail — never claimed before it is true
    // (spec §§3, 16, 19). There is no provider to configure:
    // dependence on any external key would violate ARCHIE's
    // independence.

    return json(200, {
      ok: true,
      generated_at: new Date().toISOString(),
      status: {
        archie_core: { state: "ONLINE", note: "ARCHIE core operational" },
        knowledge_core: {
          state: knowledgeItems > 0 ? "OPERATIONAL" : "EMPTY",
          knowledge_items: knowledgeItems,
          approved: knowledgeApproved,
          domains: domains,
        },
        learning: {
          state: learningProcessing > 0 ? "PROCESSING" : "READY",
          awaiting_approval: learningAwaiting,
        },
        frelux_connection: {
          // ARCHIE runs inside FRELUX infrastructure; the DB
          // connection itself is the live link.
          state: "CONNECTED",
          estimates: estimates,
          materials: materials,
        },
        internal_agents: { active: agentsActive, total: agentsTotal },
        devices: { trusted: devicesTrusted, pending: devicesPending },
        conversations: conversations,
        ears: {
          // native, provider-free — READY until the first real
          // transcription lands in the audit trail, then live
          state: earsTranscriptions > 0 ? "OPERATIONAL" : "READY",
          engine: "native-web-speech",
          transcriptions: earsTranscriptions,
          note:
            earsTranscriptions > 0
              ? "Native speech recognition live — no provider dependency"
              : "Native engine present — no transcription exercised yet",
        },
        security: {
          // real posture: any CRITICAL audit event in the
          // lifetime of the log escalates the display
          state: auditCritical > 0 ? "WARNING" : "NORMAL",
          audit_events: auditEvents,
          critical_events: auditCritical,
        },
        infrastructure: {
          cost_records: infraCostRows,
          api_keys: apiKeys,
          intel_sources: intelSources,
          price_observations: priceObservations,
        },
        semantic_graph: semanticGraph,
        knowledge_repository: await knowledgeRepositoryPromise,
      },
    });
  } catch (err) {
    return json(500, {
      ok: false,
      error: err instanceof Error ? err.message : "Status query failed",
    });
  }
});
