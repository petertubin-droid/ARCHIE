// =========================================================
// FRELUX ARCHIE — INFRASTRUCTURE ENGINE (HTTP SURFACE)
// supabase/functions/archie-infra/index.ts
//
// Engine inventory #26 (anatomy "legs"). Owner-only surface
// for live infrastructure assessment:
//
//   assess     — run dependency probes (Supabase REST, edge
//                runtime, production frontend) + current-month
//                cost aggregation + budget evaluation +
//                projection; appends a snapshot to the
//                append-only ledger and returns everything
//   snapshots  — assessment history (append-only ledger)
//   costs      — recent internal cost rows (never customer
//                credit transactions — disjoint ledger)
//   budgets    — the owner's budget configuration
//
// AUTHORITY MODEL:
//   * Valid Supabase JWT whose profile role is 'admin'
//     (Owner) is required for every action — no anonymous
//     access. Probes are read-only; nothing here mutates
//     external systems.
//   * Budgets are the OWNER's rules. The engine reports
//     states and the configured exhaustion action; it never
//     invents billing rules and never touches customer
//     credits (cost-governance keeps the ledgers disjoint).
// =========================================================

import { jsonResponse, errorResponse } from "../_shared/cors.ts";
import { createClient, User } from "npm:@supabase/supabase-js@2.45.4";
import { serveWithCors } from "../_shared/serve.ts";
import {
  assessInfrastructure,
  InfrastructureAssessment,
  InfrastructureDeps,
} from "../_shared/archie-ai/infrastructure/engine.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FRONTEND_URL =
  Deno.env.get("FRONTEND_URL") ?? "https://freluxtools.netlify.app";

// service client — the engine reads the ledgers and writes
// snapshots through it (RLS owner-read, service-write)
const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------
// Engine dependencies (live reads, real clock, real fetch)
// ---------------------------------------------------------
const infraDeps: InfrastructureDeps = {
  getMonthCosts: async (monthStartIso) => {
    const { data, error } = await db
      .from("frelux_infrastructure_costs")
      .select(
        "provider,operation,cost_actual_cents,cost_estimate_cents,occurred_at",
      )
      .gte("occurred_at", monthStartIso)
      .order("occurred_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("cost ledger read failed");
    return data ?? [];
  },
  getBudgets: async () => {
    const { data, error } = await db
      .from("frelux_infrastructure_budgets")
      .select(
        "provider,monthly_budget_cents,emergency_threshold_pct,exhaustion_policy,active",
      )
      .order("provider");
    if (error) throw new Error("budget read failed");
    return data ?? [];
  },
  fetchFn: fetch,
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_ROLE,
  frontendUrl: FRONTEND_URL,
  probeTimeoutMs: 5000,
  now: () => new Date(),
  log: (m: string) => console.log(`[archie-infra] ${m}`),
};

// ---------------------------------------------------------
// Auth: Owner = valid JWT + admin profile role
// ---------------------------------------------------------
async function authenticate(
  req: Request,
): Promise<{ user: User | null; isOwner: boolean }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return { user: null, isOwner: false };
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await anon.auth.getUser();
  const user = (userData?.user ?? null) as User | null;
  if (userError || !user) return { user: null, isOwner: false };
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { user, isOwner: profile?.role === "admin" };
}

// ---------------------------------------------------------
// Handler
// ---------------------------------------------------------
interface InfraBody {
  action: "assess" | "snapshots" | "costs" | "budgets";
  limit?: number;
}

async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse("Use POST with { action }.", 405);
  }

  const { user, isOwner } = await authenticate(req);
  if (!user || !isOwner) {
    return errorResponse("Owner authority required.", 401);
  }

  let body: InfraBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body.", 400);
  }

  switch (body.action) {
    case "assess": {
      // Live assessment — probes + costs + budgets + snapshot
      let assessment: InfrastructureAssessment;
      try {
        assessment = await assessInfrastructure(infraDeps);
      } catch (err) {
        return errorResponse(
          `Assessment failed: ${err instanceof Error ? err.message : String(err)}`,
          500,
        );
      }
      // append the snapshot (evidence, append-only)
      const { error: snapError } = await db
        .from("frelux_archie_infrastructure_snapshots")
        .insert({
          overall_status: assessment.overall_status,
          checks: assessment.checks,
          cost_summary: assessment.cost_summary,
          budget_states: assessment.budget_states,
          emergency: assessment.emergency,
          assessed_at: assessment.assessed_at,
          created_by: user.id,
        });
      if (snapError) {
        return errorResponse(
          "Snapshot append failed: assessment NOT persisted.",
          500,
        );
      }
      return jsonResponse({ ok: true, ...assessment }, 200);
    }

    case "snapshots": {
      const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);
      const { data, error } = await db
        .from("frelux_archie_infrastructure_snapshots")
        .select("*")
        .order("created_date", { ascending: false })
        .limit(limit);
      if (error) return errorResponse("Snapshot ledger read failed.", 500);
      return jsonResponse({ ok: true, snapshots: data }, 200);
    }

    case "costs": {
      const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 500);
      const { data, error } = await db
        .from("frelux_infrastructure_costs")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) return errorResponse("Cost ledger read failed.", 500);
      return jsonResponse({ ok: true, costs: data }, 200);
    }

    case "budgets": {
      const { data, error } = await db
        .from("frelux_infrastructure_budgets")
        .select("*")
        .order("provider");
      if (error) return errorResponse("Budget read failed.", 500);
      return jsonResponse({ ok: true, budgets: data }, 200);
    }

    default:
      return errorResponse(
        "Unknown action. Use: assess | snapshots | costs | budgets.",
        400,
      );
  }
}

serveWithCors((req: Request) => handler(req));
