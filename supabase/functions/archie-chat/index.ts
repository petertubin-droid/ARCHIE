// Supabase Edge Function: archie-chat
// =========================================================
// FRELUX ARCHIE STAGE 1, INTELLIGENCE CORE (CHAT ENTRYPOINT)
//
// The conversational front door to the ARCHIE Intelligence
// Core. ARCHITECTURE (provider-independent):
//
//   ARCHIE CHAT CENTER (client)
//     → this function — ARCHIE INTELLIGENCE CORE
//       (auth, tool orchestration, validation, policy)
//     → ARCHIE AI INFERENCE LAYER (_shared/archie-ai)
//     → ARCHIE MODEL RUNTIME (own model — implementation
//       boundary, not implemented yet)
//       … with an optional, explicitly-labeled external
//       development adapter during the independence roadmap.
//
// HARD RULES:
//   * This function NEVER calls Gemini/OpenAI directly. All
//     inference goes through the ARCHIE AI abstraction.
//   * If no engine is operational, the response says so
//     honestly. ARCHIE never substitutes a provider silently.
//   * Tools below are ARCHIE's own capabilities
//     (provider-independent); the inference layer only routes
//     tool calls, it never owns them.
//   * Owner-only: caller's profile.role must be 'admin'.
//   * No secrets in, no secrets out.
// =========================================================

import { verifyAuthorityJwt } from "../_shared/archie-ai/security/cross-project-auth.ts";
import { createClient, User } from "npm:@supabase/supabase-js@2.45.4";
import {
  resolveArchieCapabilityEngine,
  type ArchieInferenceRequest,
  type ArchieInferencePart,
  type ArchieToolSpec,
} from "../_shared/archie-ai/runtime.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { createSupabaseCredentialStore } from "../_shared/archie-ai/security/api-credential-store.ts";
import {
  authenticateCredential,
  credentialFromAuthHeader,
  isCredentialKey,
} from "../_shared/archie-ai/security/api-credentials.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Pure outcome value — the boundary (serveWithCors wrapper
 *  below) decides whether it becomes one JSON Response or an
 *  SSE stream. Let a plain data return flow through ALL the
 *  existing return sites untouched (gap-3 refactor). */
function respond(
  status: number,
  body: Record<string, unknown>,
): { status: number; body: Record<string, unknown> } {
  return { status, body };
}

/** The non-streaming boundary still speaks Responses. */
function jsonResponse(outcome: {
  status: number;
  body: Record<string, unknown>;
}): Response {
  return new Response(JSON.stringify(outcome.body), {
    status: outcome.status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

import {
  EngineDeps,
  ExecutionTarget,
  executeTarget,
} from "../_shared/archie-ai/execution/engine.ts";
import {
  classifySecurityMessage,
  reduceAuthorizations,
  EngagementRow,
} from "../_shared/archie-ai/security/verdict.ts";
import {
  classifyLifeSafety,
  lifeSafetyStopMessage,
} from "../_shared/archie-ai/security/life-safety.ts";

// ---- shared service client --------------------------------
const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// API-credential channel storage (owner directive 2026-09-12):
// the shared service-role backend used by archie-credentials
// for management and here for authentication — one store, one
// authority model.
const chatApiCredentialStore = createSupabaseCredentialStore(
  SUPABASE_URL,
  SERVICE_ROLE,
);

// ARCHIE Native Intelligence Engine — wire durable persistence
// (knowledge facts + learning outcomes) into the engine the
// registry resolves. Zero external AI APIs.
import {
  configureNativeEnginePersistence,
  configureNativeEngineMarketLookup,
  configureNativeEngineLessonLookup,
  type MarketPriceResult,
} from "../_shared/archie-ai/native-engine/engine.ts";
import {
  configureNativeEngineCapabilityGate,
  disabledCapabilityIds,
} from "../_shared/archie-ai/native-engine/capability-gate.ts";
import type { RecordedLesson } from "../_shared/archie-ai/native-engine/lessons.ts";
configureNativeEnginePersistence(
  db as unknown as import("../_shared/archie-ai/native-engine/persistence.ts").SupabaseLike,
);

// ---------------------------------------------------------
// ENGINES PANEL GATE (owner directive 2026-09-14): the
// owner's activation states live in archie_engine_states.
// The engine consults the gate at its real dispatch points
// (research, planning, code analysis, price lookup, system
// adapters, construction calculators, tools). Refreshed
// with a short TTL so a toggle on the Engines page lands
// within seconds without a redeploy. Honest refusals only
// — never a faked engine result.
// ---------------------------------------------------------
let engineGateLoadedAt = 0;
async function refreshEngineGate(): Promise<void> {
  const now = Date.now();
  if (now - engineGateLoadedAt < 15_000) return; // TTL 15s
  engineGateLoadedAt = now;
  const { data: states } = await db
    .from("archie_engine_states")
    .select("capability_id, enabled")
    .eq("enabled", false);
  configureNativeEngineCapabilityGate(
    (states ?? []).map((r: { capability_id: string }) => r.capability_id),
  );
}

// ---------------------------------------------------------
// ARCHIE market intelligence adapter (REAL): price lookups
// straight from the market intelligence tables. Approved
// prices win; raw validated observations are the honest
// fallback, clearly labeled. No data → null → ARCHIE says so
// (never a guessed price).
// ---------------------------------------------------------
configureNativeEngineMarketLookup(
  async (
    product: string,
    market?: string,
  ): Promise<MarketPriceResult | null> => {
    const like = `%${product}%`;

    // 1) Freshest ACTIVE approved price by product name
    let ap = db
      .from("mi_approved_prices")
      .select(
        "product_name, price, currency_code, package_size, package_unit, market_code, freshness, last_updated, brand",
      )
      .eq("is_active", true)
      .ilike("product_name", like)
      .order("last_updated", { ascending: false })
      .limit(5);
    if (market) ap = ap.eq("market_code", market);
    const { data: approved } = await ap;

    if (approved && approved.length > 0) {
      const a = approved[0];
      return {
        product: a.product_name as string,
        price: Number(a.price),
        currency: (a.currency_code as string) ?? "NGN",
        packageSize: a.package_size != null ? Number(a.package_size) : null,
        packageUnit: (a.package_unit as string) ?? null,
        marketCode: (a.market_code as string) ?? "NG",
        freshness: (a.freshness as MarketPriceResult["freshness"]) ?? "recent",
        source: "approved",
        recordedAt: String(a.last_updated),
        note: a.brand ? `brand: ${a.brand}` : undefined,
      };
    }

    // 2) Honest fallback: latest APPROVED/validated raw observation
    let ob = db
      .from("mi_price_observations")
      .select(
        "original_product_name, price, currency_code, package_size, package_unit, market_code, freshness, collected_at",
      )
      .or(`normalized_name.ilike.${like},original_product_name.ilike.${like}`)
      .in("validation_status", ["approved", "validating"])
      .order("collected_at", { ascending: false })
      .limit(5);
    if (market) ob = ob.eq("market_code", market);
    const { data: observed } = await ob;

    if (observed && observed.length > 0) {
      const o = observed[0];
      const days =
        (Date.now() - new Date(o.collected_at).getTime()) / 86_400_000;
      const freshness: MarketPriceResult["freshness"] =
        days <= 7
          ? "fresh"
          : days <= 30
            ? "recent"
            : days <= 90
              ? "stale"
              : "expired";
      return {
        product: (o.original_product_name as string) ?? product,
        price: Number(o.price),
        currency: (o.currency_code as string) ?? "NGN",
        packageSize: o.package_size != null ? Number(o.package_size) : null,
        packageUnit: (o.package_unit as string) ?? null,
        marketCode: (o.market_code as string) ?? "NG",
        freshness,
        source: "observation",
        recordedAt: String(o.collected_at),
      };
    }

    // No data — the engine reports this honestly.
    return null;
  },
);
// ---------------------------------------------------------
// ARCHIE lessons → behavior (REAL, Phase 4.4): the owner's
// evolution memory (archie_evolution_memory, §15) read back
// into planning. Until 4.4 these rows were write-only — now
// ARCHIE retrieves owner-recorded lessons relevant to a goal
// (deterministic salient-token overlap, in the engine) and
// annotates the plan with dated, provenance-carrying context.
// No rows / error → null → the plan carries no lessons
// (absence is honest, never fabricated).
// ---------------------------------------------------------
configureNativeEngineLessonLookup(
  async (): Promise<RecordedLesson[] | null> => {
    const { data, error } = await db
      .from("archie_evolution_memory")
      .select(
        "id, problem, proposed_solution, owner_decision, implementation_result, test_result, production_result, failure_information, rollback_information, lessons_learned, related_cr_number, affected_version, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return null;
    if (!data || data.length === 0) return null;
    return data.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      problem: String(r.problem ?? ""),
      proposedSolution: String(r.proposed_solution ?? ""),
      ownerDecision: String(r.owner_decision ?? ""),
      implementationResult: (r.implementation_result as string) ?? null,
      testResult: (r.test_result as string) ?? null,
      productionResult: (r.production_result as string) ?? null,
      failureInformation: (r.failure_information as string) ?? null,
      rollbackInformation: (r.rollback_information as string) ?? null,
      lessonsLearned: (r.lessons_learned as string) ?? null,
      relatedCrNumber: (r.related_cr_number as string) ?? null,
      affectedVersion: (r.affected_version as string) ?? null,
      createdAt: String(r.created_at ?? ""),
    }));
  },
);

// ---------------------------------------------------------
// ARCHIE system adapters (REAL): each one reads live rows
// from its deployed table. No rows / error → null → the
// engine reports "nothing recorded" honestly. ARCHIE never
// invents system state.
// ---------------------------------------------------------
import {
  configureNativeEngineSystemAdapters,
  type SystemAdapterResult,
} from "../_shared/archie-ai/native-engine/engine.ts";

/** Count ingestions by pipeline state for a set of input types. */
async function ingestionSummary(
  inputTypes: string[],
): Promise<SystemAdapterResult | null> {
  const { data, error } = await db
    .from("frelux_archie_ingestions")
    .select("title,pipeline_state,candidate_count,created_date")
    .in("input_type", inputTypes)
    .order("created_date", { ascending: false })
    .limit(200);
  if (error) return null;
  if (!data || data.length === 0) return null;
  const by: Record<string, number> = {};
  for (const r of data) by[r.pipeline_state] = (by[r.pipeline_state] ?? 0) + 1;
  const states = Object.entries(by)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");
  const recent = data
    .slice(0, 3)
    .map(
      (r) =>
        `"${r.title}" (${r.pipeline_state}, ${r.candidate_count} candidates)`,
    )
    .join("; ");
  return {
    headline: `${data.length} ingestion(s) in the pipeline: ${states}. Recent: ${recent}.`,
    source: "frelux_archie_ingestions",
  };
}

configureNativeEngineSystemAdapters({
  // Documents: PDF / scanned / drawing / table ingestions.
  documents: () =>
    ingestionSummary([
      "PDF_DOCUMENT",
      "SCANNED_TECHNICAL",
      "ENGINEERING_DRAWING",
      "TABLE_CALCULATION",
    ]),
  // Images: photo / video ingestions.
  images: () => ingestionSummary(["IMAGE", "VIDEO_DEMONSTRATION"]),
  // Voice bank: real sample rows. Transcription is NOT
  // implemented and never claimed.
  voice: async (): Promise<SystemAdapterResult | null> => {
    const { data, error } = await db
      .from("frelux_archie_voice_samples")
      .select("duration_sec,is_active,created_date")
      .eq("is_active", true)
      .order("created_date", { ascending: false })
      .limit(200);
    if (error || !data || data.length === 0) return null;
    const seconds = data.reduce(
      (sum: number, r) => sum + Number(r.duration_sec ?? 0),
      0,
    );
    return {
      headline: `Your voice bank holds ${data.length} active sample(s), about ${Math.round(seconds)}s of recorded audio total. Note: spoken-audio transcription is not implemented yet — these samples are banked for when that capability is built, and I do not claim it.`,
      source: "frelux_archie_voice_samples",
    };
  },
  // Social: connected account rows (tokens stay in the
  // service-role-only vault — never surfaced here).
  social: async (): Promise<SystemAdapterResult | null> => {
    const { data, error } = await db
      .from("frelux_social_accounts")
      .select("platform,account_handle,status,synced_at,connected_at")
      .order("connected_at", { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) return null;
    const list = data
      .map(
        (r) =>
          `${r.platform} @${r.account_handle} (${r.status}${r.synced_at ? `, synced ${String(r.synced_at).slice(0, 10)}` : ""})`,
      )
      .join("; ");
    return {
      headline: `${data.length} social account connection(s): ${list}.`,
      source: "frelux_social_accounts",
    };
  },
  // Family / trusted people: the roster the owner manages.
  family: async (): Promise<SystemAdapterResult | null> => {
    const { data, error } = await db
      .from("frelux_archie_people")
      .select("display_name,relation,status,invited_at")
      .order("invited_at", { ascending: false })
      .limit(20);
    if (error || !data || data.length === 0) return null;
    const list = data
      .map(
        (r) => `${r.display_name} (${r.relation.toLowerCase()}, ${r.status})`,
      )
      .join("; ");
    return {
      headline: `Your trusted-people network has ${data.length} member(s): ${list}.`,
      source: "frelux_archie_people",
    };
  },
});

// Wire the unified cognitive engine (kernel) with the same
// service client: world model, audit log + traces persist.
import {
  configureCognitiveEnginePersistence,
  getCognitiveEngine,
} from "../_shared/archie-ai/cognitive/kernel.ts";
import { ArchieNativeEngine } from "../_shared/archie-ai/native-engine/engine.ts";
import {
  captureUnknownVocabulary,
  loadLearnedTerms,
  lookupTerms,
  registerLearnedTerms,
  teachTerm,
} from "../_shared/archie-ai/knowledge/vocabulary.ts";
import { serveWithCors } from "../_shared/serve.ts";
configureCognitiveEnginePersistence(
  db as unknown as import("../_shared/archie-ai/native-engine/persistence.ts").SupabaseLike,
);

// ---- request types ----------------------------------------
interface ChatTurn {
  role: "owner" | "archie";
  content: string;
}
interface ChatRequest {
  message: string;
  clientId?: string;
  history?: ChatTurn[];
  attachments?: { name: string; type: string }[];
  /** API-credential channel only: the capability the
   *  application wants to use ("chat" | "status"). Each maps
   *  to a required scope enforced at authentication. */
  capability?: string;
  /** Scopes the engine session (working memory, episodic
   *  stamps, tool surface) per conversation — isolated even
   *  when concurrent requests share one isolate. */
  conversationId?: string;
  /** SSE streaming (gap 3): true → text/event-stream with
   *  live progress events + word-group deltas + done. */
  stream?: boolean;
}

interface ToolRun {
  tool: string;
  ok: boolean;
  input: unknown;
  output: unknown;
  at: string;
}

// ---- sanitizer: keep credentials out of ARCHIE traffic ----
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /AQ.[A-Za-z0-9_-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{20,}.[A-Za-z0-9_-]{15,}/g,
];
function sanitize(text: string): string {
  let out = text;
  for (const p of SECRET_PATTERNS) out = out.replace(p, "[redacted]");
  return out;
}

// =========================================================
// ARCHIE TOOL REGISTRY (provider-independent)
// Real tools run against production data (read-only). Pending
// tools are declared NOT OPERATIONAL so ARCHIE answers
// honestly instead of faking. New ARCHIE capabilities
// register here — the core is not hardcoded around this list.
// =========================================================
interface ToolDef extends ArchieToolSpec {
  operational: boolean;
  execute?: (
    input: Record<string, unknown>,
    ctx: { userId: string },
  ) => Promise<unknown>;
}

async function count(table: string, filter?: [string, unknown]) {
  let q = db.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count, error } = await q;
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

const TOOLS: ToolDef[] = [
  {
    name: "frelux_status",
    description:
      "Live FRELUX platform status: counts of user profiles, saved client estimates, active knowledge items, active ARCHIE domains, and ARCHIE internal agents grouped by lifecycle state.",
    parameters: { type: "object", properties: {}, required: [] },
    operational: true,
    execute: async () => {
      const [profiles, estimates, knowledge, domains, agents, events] =
        await Promise.all([
          count("profiles"),
          count("client_estimates"),
          count("frelux_knowledge_items", ["status", "ACTIVE"]),
          count("frelux_archie_domains", ["active", true]),
          db
            .from("frelux_archie_internal_agents")
            .select("status")
            .then(({ data }) => {
              const by: Record<string, number> = {};
              for (const a of data ?? [])
                by[a.status] = (by[a.status] ?? 0) + 1;
              return by;
            }),
          count("frelux_security_events"),
        ]);
      return {
        profiles,
        estimates,
        knowledge,
        domains,
        agents,
        security_events_total: events,
      };
    },
  },
  {
    name: "knowledge_search",
    description:
      "Search ARCHIE's approved knowledge (ACTIVE knowledge items) by keyword — covers all ARCHIE domains including coding and cybersecurity intelligence. Returns topic, capability, scope, confidence and a content excerpt.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
    operational: true,
    execute: async (input) => {
      // Token-based topic matching: any meaningful token of the query can
      // match a topic (natural questions rarely substring-match topics).
      const q = String(input.query ?? "").slice(0, 120);
      const tokens = q
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter(
          (t) =>
            t.length >= 3 &&
            !["the", "and", "for", "how", "what", "with", "about"].includes(t),
        )
        .slice(0, 6);
      const filter = tokens.length
        ? tokens.map((t) => `topic.ilike.%${t.replace(/,/g, "")}%`).join(",")
        : `topic.ilike.%${q}%`;
      const { data, error } = await db
        .from("frelux_knowledge_items")
        .select(
          "topic,capability,scope,content,confidence,domain,knowledge_type",
        )
        .eq("status", "ACTIVE")
        .or(filter)
        .order("confidence", { ascending: false })
        .limit(8);
      if (error) return { error: error.message };
      return {
        results: (data ?? []).map((k) => ({
          topic: k.topic,
          capability: k.capability,
          domain: k.domain,
          knowledge_type: k.knowledge_type,
          scope: k.scope,
          confidence: k.confidence,
          excerpt: JSON.stringify(k.content).slice(0, 1200),
        })),
      };
    },
  },
  {
    name: "vocabulary_lookup",
    description:
      "Look up a word, abbreviation, phrase, idiom or expression in ARCHIE's living vocabulary registry (seeded English foundation + Nigerian English + words learned from the owner's own usage + owner-taught meanings). Use FIRST for any what does X mean / define X / what is X question. Returns the meaning, word class and provenance, or an honest missing.",
    parameters: {
      type: "object",
      properties: { term: { type: "string" } },
      required: ["term"],
    },
    operational: true,
    execute: async (input) => {
      const term = String(input.term ?? "").slice(0, 60);
      const rows = await lookupTerms(db, term);
      if (rows.length === 0) {
        return {
          found: false,
          note: "Not in the vocabulary registry. Say so honestly; offer to research it or ask the owner to teach it.",
        };
      }
      return {
        found: true,
        results: rows.map((r) => ({
          term: r.term,
          type: r.term_type,
          word_class: r.word_class,
          meaning: r.meaning,
          source: r.source,
          confidence: r.confidence,
          times_seen: r.times_seen,
        })),
      };
    },
  },
  {
    name: "vocabulary_teach",
    description:
      "Store a word or phrase meaning the owner just taught. Saves to the vocabulary registry with owner-taught provenance and high confidence. Learning is free and encouraged.",
    parameters: {
      type: "object",
      properties: {
        term: { type: "string" },
        meaning: { type: "string" },
        word_class: { type: "string" },
      },
      required: ["term", "meaning"],
    },
    operational: true,
    execute: async (input) => {
      const term = String(input.term ?? "").slice(0, 60);
      const meaning = String(input.meaning ?? "").slice(0, 500);
      if (!term || !meaning) return { error: "term and meaning are required" };
      const ok = await teachTerm(
        db,
        activeOwnerUserId,
        term,
        meaning,
        String(input.word_class ?? "unknown").slice(0, 40),
      );
      return ok
        ? { stored: true, term, provenance: "owner taught in chat" }
        : { stored: false, error: "registry write failed" };
    },
  },
  {
    name: "archie_agent_status",
    description:
      "Inspect ARCHIE internal agents: role, display name, lifecycle status, task, and cost fields.",
    parameters: { type: "object", properties: {}, required: [] },
    operational: true,
    execute: async () => {
      const { data, error } = await db
        .from("frelux_archie_internal_agents")
        .select(
          "role,display_name,status,task,estimated_cost_cents,actual_cost_cents",
        )
        .order("created_date", { ascending: false })
        .limit(20);
      if (error) return { error: error.message };
      return { agents: data ?? [] };
    },
  },
  {
    name: "archie_domains",
    description:
      "List ARCHIE knowledge domains (the registry of what ARCHIE knows and is learning), with risk class and active state.",
    parameters: { type: "object", properties: {}, required: [] },
    operational: true,
    execute: async () => {
      const { data, error } = await db
        .from("frelux_archie_domains")
        .select("key,label,risk_class,active,is_core")
        .order("is_core", { ascending: false })
        .limit(50);
      if (error) return { error: error.message };
      return { domains: data ?? [] };
    },
  },
  {
    name: "execution_engine_list",
    description:
      "List the ARCHIE Execution & Runtime Engine registry: authorized execution targets with environment (SANDBOX/STAGING/PRODUCTION), risk class and whether the Owner Secret is required. Production targets are never executable from chat.",
    parameters: { type: "object", properties: {}, required: [] },
    operational: true,
    execute: async () => {
      const { data, error } = await db
        .from("frelux_archie_execution_targets")
        .select(
          "key,label,environment,risk_class,requires_owner_secret,allowed_initiators,enabled,http_method",
        )
        .order("environment", { ascending: true });
      if (error) return { error: error.message };
      return { targets: data };
    },
  },
  {
    name: "execution_engine_run",
    description:
      "Execute a REGISTERED non-production execution target (SANDBOX/STAGING only, ARCHIE_CHAT-allowed) through the audited engine: verify → authority → execute → verify → audit. Returns a redacted result and run id. Production targets are refused in chat — use the PWA/Studio with your Owner Secret.",
    parameters: {
      type: "object",
      properties: {
        targetKey: { type: "string" },
        input: { type: "object" },
      },
      required: ["targetKey"],
    },
    operational: true,
    execute: async (input) => {
      const targetKey = String(input.targetKey ?? "").trim();
      const payload = input.input ?? {};
      return await chatExecute(targetKey, payload);
    },
  },
  {
    name: "execution_engine_history",
    description:
      "Recent ARCHIE execution engine runs (audit trail): target, environment, status, attempts, duration, initiator, authority method.",
    parameters: {
      type: "object",
      properties: { limit: { type: "number" } },
      required: [],
    },
    operational: true,
    execute: async (input) => {
      const limit = Math.min(Math.max(Number(input.limit ?? 15), 1), 50);
      const { data, error } = await db
        .from("frelux_archie_execution_runs")
        .select(
          "id,target_key,environment,status,attempts,duration_ms,initiator_system,authority_method,created_date",
        )
        .order("created_date", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return { runs: data };
    },
  },
  // ---- REAL website inspection: URL -> robots-aware fetch ->
  // structured extraction -> persisted ARCHIE ingestion ----
  {
    name: "web_intelligence",
    description:
      "Inspect a website URL: fetches the live page (robots.txt respected, private addresses blocked), extracts title/meta/headings/content/counts, and persists the inspection into the ARCHIE learning pipeline. Use whenever the Owner supplies a website URL or asks to inspect, review or analyze a website. Returns REAL data from the live response - report findings and recommendations from it.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
    operational: true,
    execute: async (input, ctx) => {
      const raw = String(input.url ?? "").trim();
      if (!raw) return { error: "url is required" };
      let u: URL;
      try {
        u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      } catch {
        return { error: "That does not look like a valid URL." };
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return { error: "Only http/https URLs can be inspected." };
      }
      if (isBlockedHost(u.hostname)) {
        return {
          error:
            "That host is not inspectable (private, reserved or non-public address).",
        };
      }

      // robots.txt (standard crawler behavior; unreachable => proceed)
      let blockedBy: string | null = null;
      try {
        const robotsRes = await fetchWithTimeout(
          `${u.origin}/robots.txt`,
          8000,
        );
        if (robotsRes.ok) {
          const rules = starDisallowRules(await robotsRes.text());
          blockedBy = robotsBlocks(rules, u.pathname + u.search);
        }
      } catch {
        /* no robots file: allowed */
      }
      if (blockedBy) {
        return {
          blocked: true,
          reason: `The site's robots.txt disallows this path (rule "${blockedBy}"). ARCHIE respects the site's crawl policy - nothing was fetched.`,
          url: u.href,
        };
      }

      const res = await fetchWithTimeout(u.href, 15000);
      const contentType = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        return {
          error: `The site responded HTTP ${res.status} ${res.statusText}. Nothing was inspected.`,
          url: u.href,
        };
      }
      if (!/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
        return {
          error: `The URL returned ${contentType || "an unknown content type"}, which is not inspectable as a page.`,
          url: u.href,
        };
      }
      const reader = res.body?.getReader();
      let html = "";
      if (reader) {
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          if (html.length > 500_000) {
            await reader.cancel();
            break;
          }
        }
      } else {
        html = (await res.text()).slice(0, 500_000);
      }

      const report = extractSiteReport(html);
      const inspection = {
        url: u.href,
        final_url: res.url,
        https: res.url.startsWith("https://"),
        http_status: res.status,
        content_type: contentType,
        inspected_at: new Date().toISOString(),
        ...report,
      };

      // Persist into the ARCHIE learning pipeline (owner-owned)
      const { error: insErr } = await db
        .from("frelux_archie_ingestions")
        .insert({
          created_by: ctx.userId,
          input_type: "WEB_INTELLIGENCE",
          title: report.title || u.hostname,
          domain: u.hostname,
          source_ref: res.url,
          raw_text: report.content_excerpt,
          pipeline_state: "RECEIVED",
        });

      return {
        inspection,
        persisted_to_learning: insErr ? false : true,
        persistence_error: insErr ? insErr.message : undefined,
      };
    },
  },
  // ---- REAL market intelligence: configured FRELUX prices +
  // regional OBSERVED market data with provenance. Never
  // invented: empty regions return an honest empty state ----
  {
    name: "market_intelligence",
    description:
      "Regional building-material market price intelligence. Queries the configured FRELUX material price catalog and the frelux_archie_market_observations registry (observed prices/rates with source provenance) for a region and optional item. Returns REAL recorded data only - if nothing is recorded for a region, say so honestly and state which regions DO have observations.",
    parameters: {
      type: "object",
      properties: {
        region: {
          type: "string",
          description: "Region, state or country, e.g. 'Lagos', 'Nigeria'",
        },
        item: {
          type: "string",
          description: "Optional item filter, e.g. 'cement', 'paint'",
        },
      },
      required: ["region"],
    },
    operational: true,
    execute: async (input, ctx) => {
      const region = String(input.region ?? "")
        .trim()
        .slice(0, 80);
      const item = input.item ? String(input.item).trim().slice(0, 80) : null;
      if (!region) return { error: "region is required" };

      const obsQ = db
        .from("frelux_archie_market_observations")
        .select(
          "kind,region,item,value,currency,unit,price_kind,observed_at,confidence,source_ref",
        )
        .ilike("region", `%${region}%`)
        .order("observed_at", { ascending: false })
        .limit(100);
      const obsRes = item ? await obsQ.ilike("item", `%${item}%`) : await obsQ;
      if (obsRes.error) return { error: obsRes.error.message };
      const observations = obsRes.data ?? [];

      // Which regions actually have data (honest guidance)
      const regionsRes = await db
        .from("frelux_archie_market_observations")
        .select("region")
        .limit(500);
      const regionsWithData = [
        ...new Set((regionsRes.data ?? []).map((r) => r.region)),
      ];

      const catQ = db
        .from("material_prices")
        .select("name,category,unit,price,currency")
        .eq("is_active", true)
        .order("sort_order")
        .limit(50);
      const catRes = item ? await catQ.ilike("name", `%${item}%`) : await catQ;
      if (catRes.error) return { error: catRes.error.message };
      const configured_prices = catRes.data ?? [];

      const { error: insErr } = await db
        .from("frelux_archie_ingestions")
        .insert({
          created_by: ctx.userId,
          input_type: "TEXT",
          title: `Market intelligence query: ${region}${item ? ` / ${item}` : ""}`,
          domain: "market",
          region,
          source_ref: "archie:market_intelligence",
          raw_text: JSON.stringify({
            observations: observations.slice(0, 20),
            configured_prices,
          }).slice(0, 20_000),
          pipeline_state: "RECEIVED",
        });

      return {
        region_queried: region,
        item_filter: item,
        observed_market_data: observations,
        regions_with_observations: regionsWithData,
        configured_frelux_prices: configured_prices,
        note: "Observed data carries source provenance; configured prices are the deterministic FRELUX calculator catalog. Never present an unrecorded figure as fact.",
        persisted_to_learning: insErr ? false : true,
      };
    },
  },
  // ---- REAL code inspection: owner-supplied code OR FRELUX
  // repository files via the GitHub API. Deterministic security
  // findings + the actual code, so the reasoning layer analyzes
  // REAL material and reports actionable recommendations. ----
  {
    name: "code_intelligence",
    description:
      "Inspect real code. Pass `code` (text the Owner supplied) and/or `repo_path` (a file or directory in the FRELUX repository, e.g. 'src/lib/archie' or 'src/App.tsx'). Returns deterministic security findings (hardcoded secrets, eval, raw HTML injection, TODO markers) plus the code or directory listing itself. Analyze and report findings, then suggest improvements. Never invent file contents.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string" },
        repo_path: { type: "string" },
        question: { type: "string" },
      },
      required: [],
    },
    operational: true,
    execute: async (input, ctx) => {
      const code = input.code ? String(input.code).slice(0, 60_000) : null;
      const repoPath = input.repo_path
        ? String(input.repo_path)
            .replace(/^[/.]+/, "")
            .slice(0, 200)
        : null;
      if (!code && !repoPath) {
        return {
          error:
            "Provide either `code` (the code to inspect) or `repo_path` (a FRELUX repository path).",
        };
      }

      const result: Record<string, unknown> = {};

      if (code) {
        result.findings = scanCode(code);
        result.code_supplied = {
          lines: code.split("\n").length,
          excerpt_chars: code.length,
        };
      }

      if (repoPath) {
        const repo = await fetchRepoFile(repoPath);
        if (repo.ok) {
          if (repo.file) {
            result.repository_file = {
              path: repo.file.path,
              size: repo.file.size,
              truncated: repo.truncated ?? false,
            };
            result.findings = scanCode(repo.file.content);
            result.code = repo.file.content;
          } else if (repo.listing) {
            result.repository_listing = repo.listing;
          }
        } else {
          result.repo_error = repo.error;
        }
      }

      // Persist coding knowledge into the ARCHIE learning pipeline
      const { error: insErr } = await db
        .from("frelux_archie_ingestions")
        .insert({
          created_by: ctx.userId,
          input_type: "SOURCE_CODE",
          title: repoPath
            ? `FRELUX repository: ${repoPath}`
            : "Owner-supplied code inspection",
          domain: "programming",
          source_ref: repoPath
            ? `github:petertubin-droid/frelux/${repoPath}`
            : "chat:owner-supplied",
          raw_text: code
            ? code.slice(0, 20_000)
            : Array.isArray(result.repository_listing)
              ? JSON.stringify(result.repository_listing).slice(0, 20_000)
              : null,
          pipeline_state: "RECEIVED",
        });

      return {
        ...result,
        persisted_to_learning: insErr ? false : true,
        persistence_error: insErr ? insErr.message : undefined,
      };
    },
  },
  // ---- REAL platform sentry duty: live boot checks of the
  // ARCHIE edge functions + deterministic database health.
  // (Sentry SaaS is not connected; ARCHIE stands its own watch) ----
  {
    name: "sentry_diagnostics",
    description:
      "Run ARCHIE's own sentry duty: live boot/health checks of all five ARCHIE edge functions (chat, agents, crypto, extract, ingestion) plus deterministic counts of the core ARCHIE database tables. Returns REAL status only - report exactly what is up or down, never guess.",
    parameters: { type: "object", properties: {}, required: [] },
    operational: true,
    execute: async () => {
      const fns = [
        "archie-chat",
        "archie-agents",
        "archie-crypto",
        "archie-extract",
        "archie-ingestion",
      ];
      const checks = await Promise.all(
        fns.map(async (fn) => {
          try {
            const res = await fetchWithTimeout(
              `${SUPABASE_URL}/functions/v1/${fn}`,
              10_000,
              {},
              "OPTIONS",
            );
            // An unauthenticated ping that answers 401/405 means the
            // function IS deployed and enforcing auth - it booted fine.
            // Only 5xx / network failure means unhealthy.
            return {
              function: fn,
              status: res.status,
              healthy: res.status < 500,
            };
          } catch (e) {
            return {
              function: fn,
              status: 0,
              healthy: false,
              error: String(e).slice(0, 120),
            };
          }
        }),
      );

      const tables = [
        "frelux_archie_conversations",
        "frelux_archie_messages",
        "frelux_archie_ingestions",
        "frelux_archie_audit_events",
        "frelux_archie_market_observations",
      ];
      const dbHealth: Record<string, unknown>[] = [];
      for (const t of tables) {
        const { count, error } = await db
          .from(t)
          .select("id", { count: "exact", head: true });
        dbHealth.push({
          table: t,
          rows: error ? null : count,
          error: error ? error.message : undefined,
        });
      }

      return {
        checked_at: new Date().toISOString(),
        edge_functions: checks,
        database_health: dbHealth,
        summary: {
          functions_healthy: checks.filter((c) => c.healthy).length,
          functions_total: checks.length,
        },
      };
    },
  },
  // ---- REAL property intelligence: location routing to the
  // regional profile (observed material/labour data) +
  // configured price catalog, with honest gap reporting.
  // No figures are invented - only recorded data and the
  // Owner's own stated building facts are returned ----
  {
    name: "property_intelligence",
    description:
      "Structured property analysis and location intelligence. Pass `location` (region/country/state) and any known building facts in `building` (e.g. {floor_area_m2: 180, stories: 2, roof_type: 'hip', use: 'residential'}). Returns the regional profile from recorded market observations, the configured material catalog, and a deterministic gap report listing exactly what data is still needed for a full FRELUX takeoff. Analyze from the returned records; never invent quantities or prices.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Region, state or country, e.g. 'Lagos, Nigeria'",
        },
        building: {
          type: "object",
          description:
            "Known building facts supplied by the Owner, e.g. {floor_area_m2, stories, roof_type, use}",
        },
        question: { type: "string" },
      },
      required: ["location"],
    },
    operational: true,
    execute: async (input, ctx) => {
      const location = String(input.location ?? "")
        .trim()
        .slice(0, 120);
      if (!location) return { error: "location is required" };
      const building =
        input.building && typeof input.building === "object"
          ? (input.building as Record<string, unknown>)
          : {};

      // Regional profile: latest observation per kind/item (deterministic SQL)
      const obsRes = await db
        .from("frelux_archie_market_observations")
        .select(
          "kind,item,value,currency,unit,price_kind,observed_at,confidence,source_ref,region",
        )
        .ilike("region", `%${location}%`)
        .order("observed_at", { ascending: false })
        .limit(100);
      if (obsRes.error) return { error: obsRes.error.message };
      const observations = obsRes.data ?? [];

      const catRes = await db
        .from("material_prices")
        .select("name,category,unit,price,currency")
        .eq("is_active", true)
        .limit(50);
      if (catRes.error) return { error: catRes.error.message };

      // Deterministic gap report for a full takeoff
      const gaps: string[] = [];
      if (observations.length === 0)
        gaps.push(
          `No recorded market observations for ${location} yet - regional price context is unavailable`,
        );
      const needFacts = [
        ["floor_area_m2", "floor area (m²)"],
        ["stories", "number of stories"],
        ["roof_type", "roof type"],
      ];
      for (const [key, label] of needFacts)
        if (building[key] === undefined)
          gaps.push(`Building fact missing: ${label}`);
      if (!observations.some((o) => o.kind === "LABOUR_RATE"))
        gaps.push("No recorded labour rates for this region");

      const { error: insErr } = await db
        .from("frelux_archie_ingestions")
        .insert({
          created_by: ctx.userId,
          input_type: "TEXT",
          title: `Property intelligence analysis: ${location}`,
          domain: "property",
          region: location,
          source_ref: "archie:property_intelligence",
          raw_text: JSON.stringify({
            building,
            observations: observations.slice(0, 20),
          }).slice(0, 20_000),
          pipeline_state: "RECEIVED",
        });

      return {
        location,
        building_facts_as_given: building,
        regional_market_observations: observations,
        configured_material_catalog: catRes.data ?? [],
        gap_report: gaps,
        analysis_ready: gaps.length === 0,
        persisted_to_learning: insErr ? false : true,
      };
    },
  },
];

// Declare only OPERATIONAL tools to whichever engine serves
// the request. Pending tools are explained to the model via
// the system instruction instead.
function activeToolSpecs(): ArchieToolSpec[] {
  return TOOLS.filter((t) => t.operational).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

const PENDING_TOOL_NOTE = TOOLS.filter((t) => !t.operational)
  .map((t) => `${t.name} (${t.description})`)
  .join("; ");

// ---- ARCHIE Execution & Runtime Engine (chat binding) ------
// Chat may only run NON-PRODUCTION targets that explicitly list
// 'ARCHIE_CHAT' as an allowed initiator. Production execution
// requires the Owner Secret and happens through the PWA/Studio
// (archie-execute), never through chat.
const chatEngineDeps: EngineDeps = {
  getTarget: async (key) => {
    const { data } = await db
      .from("frelux_archie_execution_targets")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    return (data as unknown as ExecutionTarget) ?? null;
  },
  createRun: async (rec) => {
    const { data, error } = await db
      .from("frelux_archie_execution_runs")
      .insert(rec)
      .select("id")
      .single();
    if (error || !data) throw new Error("audit insert failed");
    return data as { id: string };
  },
  updateRun: async (id, patch) => {
    const { error } = await db
      .from("frelux_archie_execution_runs")
      .update({ ...patch, updated_date: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error("audit update failed");
  },
  verifyOwnerSecret: async () => false, // chat never holds the owner secret
  recordSecurityEvent: async (userId, type, severity, message) => {
    try {
      await db.from("frelux_security_events").insert({
        user_id: userId,
        // FIX 26: column is `kind` (see migration
        // 20260913030000) — `event_type` inserts were
        // silently rejected.
        kind: type,
        severity,
        message,
      });
    } catch {
      /* audit never breaks the flow */
    }
  },
  getSecret: (name) => Deno.env.get(name),
  fetchFn: fetch,
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SERVICE_ROLE,
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: (m) => console.log(`[archie-chat/exec] ${m}`),
};

// Active owner user id for this request (audit identity);
// set in the handler after authentication, cleared otherwise.
let activeOwnerUserId: string | null = null;

async function chatExecute(targetKey: string, input: unknown) {
  const ownerId = activeOwnerUserId;
  if (!ownerId) {
    return {
      ok: false,
      status: "POLICY_REJECTED",
      error: "Owner session required for execution.",
    };
  }
  // HARD CHAT POLICY: non-PRODUCTION targets that allow ARCHIE_CHAT only.
  const target = await chatEngineDeps.getTarget(targetKey);
  if (!target)
    return {
      ok: false,
      status: "NOT_FOUND",
      error: "Unknown execution target.",
    };
  if (target.environment === "PRODUCTION") {
    return {
      ok: false,
      status: "POLICY_REJECTED",
      error:
        "Production execution requires the Owner Secret through the PWA/Studio — never through chat.",
    };
  }
  if (!target.allowed_initiators?.includes("ARCHIE_CHAT")) {
    return {
      ok: false,
      status: "POLICY_REJECTED",
      error: "This target is not executable from chat.",
    };
  }
  return executeTarget(chatEngineDeps, {
    targetKey,
    input,
    initiatorSystem: "ARCHIE_CHAT",
    caller: { userId: ownerId, isAdmin: true }, // owner-only session, admin-gated above
  });
}

const SYSTEM_PROMPT = `You are ARCHIE, the personal AI intelligence system of the FRELUX platform, speaking privately with the OWNER of FRELUX.
You are a capable, direct, warm assistant: conversational, never robotic, never a support chatbot.

Operating rules:
- You can call tools to inspect REAL platform state. Only use tools that are declared. Capabilities not declared to you are NOT OPERATIONAL YET: ${PENDING_TOOL_NOTE}. If the Owner asks for those, say plainly they are not yet operational and offer the closest real alternative.
- NEVER invent data, numbers, or statuses. If a tool result is missing or errored, say so.
- The Owner is the final authority. Protected operations (money, security changes, production changes) are NEVER performed from chat; you may analyze and prepare, and the Owner authorizes through the proper dashboard workflow.
- Keep answers concise and useful. Use short paragraphs. No filler.
- Never echo credentials, API keys, or tokens. Never ask for passwords.

Coding & Cybersecurity Intelligence:
- You hold persistent Coding Intelligence and Cybersecurity Intelligence (domains: coding, cybersecurity) covering 19 programming languages — fundamentals, secure coding, vulnerability classes, security tooling, and authorized security-testing methodology.
- For any coding, security, or reverse-engineering question, call knowledge_search FIRST and ground your answer in the retrieved items. Cite the topic you used. If a version-sensitive fact is flagged for re-verification in the item, say so honestly instead of guessing.
- HARD BOUNDARY: offensive-security knowledge (exploitation, privilege escalation, credential attacks, scanning of third parties) applies ONLY to authorized systems, owned infrastructure, controlled laboratories, CTFs, and explicitly permitted security assessments. If a request targets anything outside those boundaries, refuse and explain the boundary. Defensive security (secure coding, hardening, detection, malware analysis best practices) has no such restriction.

Execution & Runtime Engine:
- You have a REAL execution layer: execution_engine_list, execution_engine_run and execution_engine_history. Use them when the Owner wants a registered backend action performed or inspected (e.g. health check, status probe, sitemap regeneration).
- Chat can execute ONLY non-production targets (SANDBOX/STAGING) that list ARCHIE_CHAT as allowed. If the Owner wants a PRODUCTION target executed, say plainly: production execution requires the Owner Secret through the PWA/Coding Studio — never through chat — and offer to prepare the exact run details.
- Always report the run id, status, attempts and duration from the engine result. Never fabricate an execution result; if the engine returns an error, say so.

Vocabulary & Language Learning:
- You hold a LIVING vocabulary registry (vocabulary_lookup): a broad English foundation of words, abbreviations, idioms and phrases, common Nigerian English expressions, plus words you learned from the Owner's own usage and meanings the Owner taught you.
- For any word, abbreviation, phrase or expression meaning question ("what does X mean", "define X", "what is X"), call vocabulary_lookup FIRST and answer from the registry with provenance. If the term is missing, say so honestly and offer to research it.
- When the Owner teaches you a meaning, store it with vocabulary_teach immediately.
- Unknown words the Owner uses are captured automatically with usage provenance. Never guess a meaning: a word you have seen but not been taught is an observation, not knowledge.`;

// =========================================================
// web_intelligence — REAL website inspection
// URL → robots-aware fetch → structured extraction →
// persisted ARCHIE ingestion (owner learning path).
// No fake results: every field comes from the live response.
// =========================================================
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    !h ||
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan")
  ) {
    return true;
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]),
      b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || a >= 240) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
  }
  if (h.includes(":")) return true; // IPv6 literals: block (no inspection need)
  return false;
}

function starDisallowRules(robotsTxt: string): string[] {
  const rules: string[] = [];
  let inStar = false;
  let groupHasRule = false;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (groupHasRule) {
        inStar = false;
        groupHasRule = false;
      }
      if (val === "*") inStar = true;
    } else if (inStar && key === "disallow") {
      rules.push(val);
      groupHasRule = true;
    } else if (inStar && (key === "allow" || key === "crawl-delay")) {
      groupHasRule = true;
    }
  }
  return rules;
}

function robotsBlocks(rules: string[], pathname: string): string | null {
  let matched: string | null = null;
  for (const rule of rules) {
    if (!rule) continue;
    try {
      const pat = rule
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      if (new RegExp(`^${pat}`).test(pathname)) {
        if (matched === null || rule.length > matched.length) matched = rule;
      }
    } catch {
      /* malformed rule: skip */
    }
  }
  return matched;
}

async function fetchWithTimeout(
  url: string,
  ms: number,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method,
      headers: {
        "user-agent": "ARCHIE-Inspector/1.0 (owner-authorized site inspection)",
        ...headers,
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function extractSiteReport(html: string) {
  const strip = (s: string) =>
    decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaDesc =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i,
    )?.[1] ??
    null;
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .map((m) => strip(m[1]))
    .filter(Boolean)
    .slice(0, 5);
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((m) => strip(m[1]))
    .filter(Boolean)
    .slice(0, 10);
  const bodyText = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return {
    title: title ? decodeEntities(title).trim() : null,
    meta_description: metaDesc ? decodeEntities(metaDesc).trim() : null,
    headings: { h1: h1, h2: h2 },
    word_count: bodyText ? bodyText.split(" ").length : 0,
    counts: {
      links: (html.match(/<a\s[^>]*href=/gi) ?? []).length,
      images: (html.match(/<img\s/gi) ?? []).length,
      forms: (html.match(/<form\s/gi) ?? []).length,
      scripts: (html.match(/<script\s/gi) ?? []).length,
    },
    content_excerpt: bodyText.slice(0, 4000),
  };
}

// =========================================================
// code_intelligence — REAL code inspection
// Owner-supplied code OR FRELUX repository files via the
// GitHub API. Deterministic security findings + the code
// itself, so the reasoning layer analyzes REAL material.
// =========================================================
interface CodeFinding {
  severity: "high" | "medium" | "low" | "info";
  rule: string;
  detail: string;
}

function scanCode(code: string): CodeFinding[] {
  const findings: CodeFinding[] = [];
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    const trimmed = line.trim();
    if (/^(\/\/|#)\s*(TODO|FIXME|HACK)\b/i.test(trimmed)) {
      findings.push({
        severity: "info",
        rule: "todo-marker",
        detail: `line ${n}: ${trimmed.slice(0, 90)}`,
      });
    }
    if (
      /\bsk-[A-Za-z0-9]{16,}\b/.test(line) ||
      /AIza[A-Za-z0-9_-]{20,}/.test(line) ||
      /AQ\.[A-Za-z0-9_-]{20,}/.test(line) ||
      /gh[pousr]_[A-Za-z0-9]{30,}/.test(line) ||
      /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(line)
    ) {
      findings.push({
        severity: "high",
        rule: "hardcoded-secret",
        detail: `line ${n}: credential-looking literal — move to environment secrets`,
      });
    }
    if (
      /\b(password|secret|api_?key|token)\s*[:=]\s*["'][^"'"'"']{6,}["']/i.test(
        line,
      ) &&
      !/env\.|secrets|placeholder/i.test(line)
    ) {
      findings.push({
        severity: "medium",
        rule: "credential-assignment",
        detail: `line ${n}: assigns a literal to a credential-named variable`,
      });
    }
    if (/\beval\s*\(/.test(line)) {
      findings.push({
        severity: "high",
        rule: "eval-usage",
        detail: `line ${n}: eval() — verify necessity and input trust`,
      });
    }
    if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(line)) {
      findings.push({
        severity: "medium",
        rule: "raw-html-injection",
        detail: `line ${n}: raw HTML injection — confirm the input is sanitized`,
      });
    }
    if (/\bconsole\.log\(/.test(line)) {
      findings.push({
        severity: "low",
        rule: "console-log",
        detail: `line ${n}: console.log left in code`,
      });
    }
  });
  return findings.slice(0, 40);
}

async function fetchRepoFile(repoPath: string): Promise<
  | {
      ok: true;
      listing?: unknown[];
      file?: { path: string; size: number; content: string };
      truncated?: boolean;
    }
  | { ok: false; error: string }
> {
  const token = Deno.env.get("GITHUB_ACCESS_TOKEN");
  if (!token) {
    return {
      ok: false,
      error:
        "GitHub inspection is not configured: GITHUB_ACCESS_TOKEN is missing on the ARCHIE function. The Owner can add it in Supabase project secrets.",
    };
  }
  const api = `https://api.github.com/repos/petertubin-droid/frelux/contents/${repoPath}?ref=main`;
  const res = await fetchWithTimeout(api, 15000, {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
  });
  if (res.status === 404)
    return {
      ok: false,
      error: `Path "${repoPath}" was not found in the FRELUX repository (main branch).`,
    };
  if (!res.ok)
    return { ok: false, error: `GitHub API returned HTTP ${res.status}.` };
  const body = await res.json();
  if (Array.isArray(body)) {
    return {
      ok: true,
      listing: body
        .map((e: { path: string; type: string; size?: number }) => ({
          path: e.path,
          type: e.type,
          size: e.size ?? null,
        }))
        .slice(0, 100),
    };
  }
  const content = body?.content ?? "";
  let decoded = "";
  try {
    decoded = atob(content.replace(/\n/g, ""));
  } catch {
    return { ok: false, error: "File content could not be decoded." };
  }
  const truncated = decoded.length > 60000;
  return {
    ok: true,
    file: {
      path: body.path,
      size: decoded.length,
      content: decoded.slice(0, 60000),
    },
    truncated,
  };
}

// ---- PUBLIC VISITOR MODE --------------------------------
// Role-scoped persona for the FRELUX site live-chat widget,
// powered by ARCHIE (owner instruction 2026-09-09). Anonymous
// visitors and non-admin users get site guidance ONLY: no
// owner tools, no owner memory, no protected operations, no
// account/order access. The scope IS the protection.
// ---------------------------------------------------------
// ---------------------------------------------------------
// FRELUX LEARN HUB — ARCHIE's site knowledge base
// The learn hub (/learn) holds the site's curated guides and
// tutorials. ARCHIE retrieves from the REAL published
// articles (learn_articles, published only — never invented
// content): the question's informative tokens pre-rank the
// articles and the top matches are injected as titled
// knowledge-base sections the native engine consults through
// its systemInstruction KB path. Validated facts still
// outrank this content (engine KB gate, 2026-09-16) — the
// hub fills the gaps facts don't cover, especially how-tos.
// ---------------------------------------------------------
interface LearnArticle {
  title: string;
  excerpt: string | null;
  content: string;
  slug: string;
  category_slug: string;
}

const LEARN_CACHE_TTL_MS = 5 * 60_000;
const learnCache: { at: number; articles: LearnArticle[] } = {
  at: 0,
  articles: [],
};

const LEARN_FILLERS = new Set([
  "what",
  "which",
  "who",
  "when",
  "where",
  "why",
  "how",
  "should",
  "could",
  "would",
  "will",
  "can",
  "tell",
  "about",
  "know",
  "need",
  "want",
  "give",
  "show",
  "help",
  "many",
  "much",
  "best",
  "good",
  "guide",
  "tips",
  "do",
  "does",
  "did",
  "i",
  "you",
  "your",
  "my",
  "me",
  "we",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "for",
  "have",
  "has",
  "had",
  "of",
  "to",
  "in",
  "on",
  "at",
  "it",
  "please",
]);

/** Light suffix stem (mirrors the engine's kbStem exactly):
 *  "screed" matches articles titled "Screeding". Filler
 *  filtering happens on the RAW token before stemming, so
 *  stripping never resurrects a filler ("tips" → "tip" stays
 *  filtered). */
function learnStem(t: string): string {
  if (t.length > 5 && /ing$/.test(t)) return t.slice(0, -3);
  if (t.length > 4 && /ied$/.test(t)) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /eed$/.test(t)) return t; // screed, agreed
  if (t.length > 4 && /ed$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && /ies$/.test(t)) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && /(?:ss|sh|ch|x|z|s)es$/.test(t)) {
    return t.slice(0, -2);
  }
  if (t.length > 3 && /s$/.test(t)) return t.slice(0, -1);
  return t;
}

function learnTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
      .map(learnStem),
  );
}

async function fetchLearnArticles(): Promise<LearnArticle[]> {
  const now = Date.now();
  if (
    learnCache.articles.length > 0 &&
    now - learnCache.at < LEARN_CACHE_TTL_MS
  ) {
    return learnCache.articles;
  }
  try {
    const { data, error } = await db
      .from("learn_articles")
      .select("title, excerpt, content, slug, category_slug")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error || !data) return learnCache.articles; // stale serve on transient failure
    learnCache.articles = data as LearnArticle[];
    learnCache.at = now;
    return learnCache.articles;
  } catch {
    return learnCache.articles; // honest degradation: no hub injection
  }
}

/** Question-driven article selection: informative token
 *  overlap against each article's title + excerpt, top 4.
 *  Returns the KB sections ready to append to a
 *  systemInstruction ("" when nothing genuinely matches).
 *
 *  Scoring (2026-09-16, evidence: "how do i screed a floor"
 *  kept matching the floor-TILE guide because "floor" is
 *  rarer than "screed" in the corpus — IDF alone cannot tell
 *  the subject from the surface):
 *  1. IDF weighting — a rare-term match outranks a common one;
 *  2. TITLE matches count double — the title is the article's
 *     declared subject;
 *  3. the question's PRIMARY token (its first informative
 *     token: the action in "how do i screed a floor", the
 *     subject in "what is screeding") earns a flat bonus —
 *     the head of the question is the intent.
 */
function buildLearnKb(question: string, articles: LearnArticle[]): string {
  const qTokens = [...learnTokens(question)].filter(
    (t) => !LEARN_FILLERS.has(t),
  );
  if (qTokens.length === 0 || articles.length === 0) return "";
  const primary = qTokens[0];
  const docTokens = articles.map((a) =>
    learnTokens(`${a.title} ${a.excerpt ?? ""}`),
  );
  const df = new Map<string, number>();
  for (const t of qTokens) {
    let n = 0;
    for (const doc of docTokens) if (doc.has(t)) n += 1;
    df.set(t, n);
  }
  const idfOf = (t: string): number =>
    Math.log(1 + articles.length / Math.max(1, df.get(t) ?? 1));
  const scored = articles
    .map((a, i) => {
      const titleT = learnTokens(a.title);
      const doc = docTokens[i];
      let score = 0;
      for (const tok of qTokens) {
        const w = idfOf(tok);
        if (titleT.has(tok)) score += 2 * w;
        else if (doc.has(tok)) score += w;
      }
      // Primary-token gate: when at least one guide names the
      // question's head action/subject, a guide that never
      // mentions it is not a candidate — measured 2026-09-16:
      // "floor" alone (idf 2.55) outranked every screed match
      // (idf 1.44), so the tile guide kept beating the actual
      // screeding guides. Fallback: when no guide contains the
      // primary token, all scored candidates stand.
      const hasPrimary = titleT.has(primary) || doc.has(primary);
      if (hasPrimary) score += 1.5;
      return { a, score, hasPrimary };
    })
    .filter((x) => x.score > 0);
  const primaryExists = scored.some((x) => x.hasPrimary);
  const filtered = primaryExists ? scored.filter((x) => x.hasPrimary) : scored;
  const top = filtered
    .sort((x, y) => y.score - x.score)
    // Top 4 only: the pre-selection above is authoritative —
    // injecting common-token stragglers (an article that
    // shares only "floor") invites the engine's section picker
    // to prefer a body-heavy but off-subject guide over the
    // subject's own. Four slots keep room for both clauses of
    // a compound question.
    .slice(0, 4);
  if (top.length === 0) return "";
  return top
    .map(({ a }) => {
      const body = (a.content ?? "").slice(0, 1100);
      return `## ${a.title}
Learn hub guide — read it in full at frelux.tools/learn/${a.slug} (${a.category_slug}).
${a.excerpt ?? ""}
${body}`;
    })
    .join("\n\n");
}

// Sections are split and matched BY TITLE by the engine's KB
// retrieval (see retrieveFromSystemInstruction in the native
// engine) — so every section title is a topic, not prose.
const VISITOR_SYSTEM_PROMPT = `You are ARCHIE, the AI assistant on the FRELUX website (frelux.tools) — a Nigerian building, painting and finishing platform.

## Role
Help site visitors with practical guidance on painting, POP ceilings, screeding, tiling, paint colours and surface preparation, and point them to the right FRELUX calculator or page for real numbers.

## Services
Construction cost estimation calculators (paint, screeding, POP ceiling, tile, build-to-roof, structural, foundation), a colors and design workspace with AI colour recommendations and preview, saved projects with a project workspace, templates and analytics, a materials marketplace and project gallery, and a learn hub of building guides at /learn.

## Rules you MUST follow:
- Be concise, friendly and practical. Nigerian context (prices in Naira).
- NEVER invent current prices or give exact cost figures — costs change and depend on configuration. Direct users to the relevant cost estimator page for live numbers.
- NEVER claim access to accounts, orders, saved estimates, projects, or any user data. You cannot look up or modify anything. If asked, explain that they can save estimates from the calculators themselves.
- You are the site's public assistant. Do not present yourself as performing admin, security, payment or account operations — those do not happen through chat.
- If a visitor describes a project (e.g. "how much paint for a 12x12 room?"), give the practical method (measure wall area, subtract openings, coats, coverage) and recommend the Paint Calculator for the exact quantity.
- If asked something outside FRELUX scope, briefly help if it is general building/painting knowledge, otherwise redirect politely.`;

// ---- main handler ----------------------------------------
/** Live progress emitter for the streaming path (gap 3):
 *  phase and reasoning-step events flow to the SSE client
 *  AS they happen. Null on the classic JSON path. */
type ChatEmit = (event: string, data: Record<string, unknown>) => void;

async function executeChat(
  req: Request,
  emit?: ChatEmit,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (req.method === "OPTIONS") return respond(204, { ok: true });

  // ENGINES PANEL GATE: refresh the owner's activation states
  // (TTL-guarded — at most one tiny query per 15s per isolate).
  await refreshEngineGate();

  // 1. Authenticate — Owner (admin) gets FULL ARCHIE. Authenticated
  //    non-admins and anonymous site visitors get the role-scoped
  //    PUBLIC visitor mode (site guidance only). Visitor mode never
  //    reaches owner tools, owner memory or protected operations.
  const authHeader = req.headers.get("Authorization") ?? "";
  let user: User | undefined;
  let isOwner = false;
  if (authHeader.startsWith("Bearer ")) {
    const anon = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    );
    const { data: userData, error: userError } = await anon.auth.getUser();
    user = (userData?.user ?? undefined) as User | undefined;
    if (!userError && user) {
      const { data: profile } = await db
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      isOwner = profile?.role === "admin";
    }
    if (!user) {
      // Cross-project owner identity (see cross-project-auth.ts): the
      // owner's sessions are issued by the FRELUX authority project.
      const verified = await verifyAuthorityJwt(
        authHeader.slice("Bearer ".length),
      );
      if (verified) {
        user = { id: verified.sub, email: verified.email ?? "" } as User;
        const { data: profile } = await db
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        isOwner = profile?.role === "admin";
      }
    }
  }

  // 1b. ARCHIE INTERNAL SERVICE INVOCATION — the WhatsApp
  //     communication layer (and other official ARCHIE
  //     channels) reach THE SAME cognitive core through a
  //     shared-secret internal call: x-archie-internal-key +
  //     x-archie-user-id (the Owner-managed identity mapping).
  //     This is NOT a second brain and NOT an auth bypass: the
  //     profile role is resolved from the database exactly as
  //     for a JWT, and every gate below (security verdict,
  //     privacy consent, authority) runs identically. The
  //     branch is dead unless ARCHIE_INTERNAL_KEY is set.
  const internalKey = Deno.env.get("ARCHIE_INTERNAL_KEY");
  if (
    !user &&
    internalKey &&
    req.headers.get("x-archie-internal-key") === internalKey
  ) {
    const internalUserId = String(req.headers.get("x-archie-user-id") ?? "")
      .replace(/[^0-9a-f-]/gi, "")
      .toLowerCase();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        internalUserId,
      )
    ) {
      const { data: profile } = await db
        .from("profiles")
        .select("role")
        .eq("id", internalUserId)
        .maybeSingle();
      user = { id: internalUserId } as User;
      isOwner = profile?.role === "admin";
    }
  }
  activeOwnerUserId = isOwner && user ? user.id : null;

  // 2. Parse + validate request
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }
  const message = sanitize(String(body.message ?? "").slice(0, 8000)).trim();
  if (!message) return respond(400, { error: "Message is required" });
  const history = (body.history ?? []).slice(-20).map((t) => ({
    role: t.role,
    content: sanitize(String(t.content ?? "").slice(0, 4000)),
  }));
  // C-1 (audit fix 2026-09-11): the client's conversation id
  // scopes the engine session — working memory, episodic
  // stamps and the tool surface are isolated per conversation
  // even when concurrent requests share one isolate.
  const conversationId =
    sanitize(String(body.conversationId ?? "default")).slice(0, 80) ||
    "default";

  // 2a. API CREDENTIAL CHANNEL (owner directive 2026-09-12)
  //     — explicitly authorized applications (FRELUX first,
  //     future applications after) reach ARCHIE through scoped
  //     API credentials. This is NOT owner access and NOT a
  //     second authority system:
  //       * The credential grants ONLY its explicitly listed
  //         scopes (least privilege, no wildcards possible).
  //       * The application session is ISOLATED: a fresh
  //         in-memory engine, no persistence, no owner
  //         memory, no owner tools. An authorized app can
  //         converse; nothing more is reachable.
  //       * Raw keys are never stored anywhere — verification
  //         is a single verifier-hash lookup. Failure
  //         responses carry machine codes, never key material.
  //       * The contract here is application-facing and
  //         extraction-ready: when ARCHIE is separated from
  //         FRELUX, applications point this same credential at
  //         ARCHIE's own endpoint. Nothing else changes.
  const presentedApiKey =
    credentialFromAuthHeader(authHeader) ??
    req.headers.get("x-archie-api-key") ??
    "";
  if (!user && isCredentialKey(presentedApiKey)) {
    try {
      // Each capability maps to a required scope; default is
      // the conversational contract (archie:chat).
      const rawCapability = String(body.capability ?? "chat").slice(0, 24);
      const requiredScopes =
        rawCapability === "status" ? ["archie:status"] : ["archie:chat"];

      const auth = await authenticateCredential(
        chatApiCredentialStore,
        presentedApiKey,
        {
          requiredScopes,
          pepper: Deno.env.get("ARCHIE_API_PEPPER") ?? "",
        },
      );

      if (!auth.ok) {
        const status =
          auth.code === "rate_limited"
            ? 429
            : auth.code === "invalid"
              ? 401
              : 403;
        return respond(status, {
          error: auth.message,
          code: auth.code,
          mode: "api_credential",
        });
      }

      const cred = auth.credential;

      // Capability gate: "status" is the only non-chat
      // capability exposed over this contract today, and it
      // needs its own scope.
      if (rawCapability === "status") {
        return respond(200, {
          ok: true,
          mode: "api_credential",
          application: cred.application,
          environment: cred.environment,
          capability: "status",
          scopes: cred.scopes,
        });
      }

      if (!message) {
        return respond(400, {
          error: "Message is required",
          code: "invalid_request",
          mode: "api_credential",
        });
      }

      // Isolated application session: fresh engine, no tools,
      // no persistence, no owner memory. Rate limiting already
      // ran inside authenticateCredential (per-credential).
      const appRuntime = new ArchieNativeEngine();
      const appRequest: ArchieInferenceRequest = {
        turns: [{ role: "owner" as const, parts: [{ text: message }] }],
        systemInstruction:
          `You are ARCHIE, serving the authorized application "${cred.application}" ` +
          `(${cred.environment}) through a scoped API credential. Answer directly and ` +
          `honestly within your knowledge. You are not the owner's personal session: ` +
          `no owner data, memory or tools are available over this channel.`,
        tools: [],
        conversationId: `api-credential:${cred.id}`,
      };

      try {
        const result = await appRuntime.generate(appRequest);
        const text = result.parts
          .map((p) => p.text)
          .filter(Boolean)
          .join("")
          .trim();
        if (!text) {
          return respond(502, {
            error: "The engine produced no response. Please retry.",
            mode: "api_credential",
          });
        }
        return respond(200, {
          reply: sanitize(text),
          mode: "api_credential",
          application: cred.application,
        });
      } catch (err) {
        return respond(502, {
          error:
            err instanceof Error ? sanitize(err.message) : "Engine failure",
          mode: "api_credential",
        });
      }
    } catch (diagErr) {
      // Credential-channel diagnostic: machine-readable code,
      // never key material (the message is sanitized and
      // stripped of any credential fragment defensively).
      const raw = diagErr instanceof Error ? diagErr.message : String(diagErr);
      return respond(500, {
        error: sanitize(
          raw.replace(/archie_ak_[A-Za-z0-9_-]+/g, "archie_ak_[redacted]"),
        ).slice(0, 300),
        code: "credential_channel_error",
        mode: "api_credential",
      });
    }
  }

  // 2a. FRELUX LEARN HUB KB — real published guides matched
  //     to this question, injected as curated knowledge-base
  //     sections for both visitor and owner paths. Validated
  //     facts still outrank them inside the engine.
  const learnKb = buildLearnKb(message, await fetchLearnArticles());

  // 2b. PUBLIC VISITOR MODE — rate-limited, role-scoped site
  //     guidance through the same ARCHIE inference boundary.
  if (!isOwner) {
    const clientId = sanitize(String(body.clientId ?? "anon")).slice(0, 80);
    const rl = checkRateLimit(`archie-chat:visitor:${clientId}`, {
      maxRequests: 12,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return respond(429, {
        error:
          "You're sending messages very quickly — please wait a moment and try again.",
      });
    }

    // PRIVACY: visitors run on a fresh, ISOLATED in-memory
    // engine per request — no persistence, no access to the
    // owner's knowledge/memory, no context shared with anyone.
    // What a visitor says never enters ARCHIE's owner memory.
    const visitorRuntime = new ArchieNativeEngine();
    const visitorEngine = "archie-native-isolated";

    const visitorRequest: ArchieInferenceRequest = {
      turns: [
        ...history.map((t) => ({
          role: t.role,
          parts: [{ text: t.content }] as ArchieInferencePart[],
        })),
        { role: "owner" as const, parts: [{ text: message }] },
      ],
      systemInstruction: learnKb
        ? `${VISITOR_SYSTEM_PROMPT}\n\n${learnKb}`
        : VISITOR_SYSTEM_PROMPT,
      // No tools for visitors — the empty array is explicit: the
      // public mode has ZERO capabilities beyond site guidance.
      tools: [],
      conversationId: clientId,
    };

    try {
      const result = await visitorRuntime.generate(visitorRequest);
      const text = result.parts
        .map((p) => p.text)
        .filter(Boolean)
        .join("")
        .trim();
      if (!text) {
        return respond(502, {
          error: "The assistant produced no response. Please try again.",
          engine: result.engine,
        });
      }
      return respond(200, {
        reply: sanitize(text),
        engine: result.engine,
        mode: "visitor",
      });
    } catch (err) {
      return respond(502, {
        error:
          err instanceof Error ? sanitize(err.message) : "Assistant failure",
        engine: visitorEngine,
      });
    }
  }

  // 3. Resolve the inference engine through the ARCHIE AI
  //    abstraction. Never a direct provider call.
  const { runtime, engine } = resolveArchieCapabilityEngine({
    engineId: Deno.env.get("ARCHIE_ENGINE"),
  });
  if (!runtime) {
    return respond(503, {
      error:
        "ARCHIE's own model runtime is an implementation boundary and is not operational yet. " +
        "No external provider is substituting for ARCHIE. Reasoning will begin when an engine is registered in ARCHIE's provider-agnostic engine registry.",
      engine,
    });
  }

  // 3.5 LIFE-SAFETY HARD GATE (owner directive 2026-09-11) —
  //    HIGHER PRIORITY than the security verdict and every
  //    ordinary execution path. Credible life-threatening
  //    operations are CRITICAL SAFETY EVENTS: stop, name the
  //    hazard, escalate, preserve evidence. No authorization
  //    flag can bypass this gate — resumption is a human
  //    protocol stated in the stop message itself.
  const lifeSafety = classifyLifeSafety(message);
  if (lifeSafety.blocked) {
    if (user) {
      // Evidence preservation — never let the audit write
      // break the stop itself.
      try {
        await db.from("frelux_security_events").insert({
          user_id: user.id,
          kind: "LIFE_SAFETY_GATE_STOP",
          severity: "critical",
          message: `[owner-chat] ${lifeSafety.reason}`,
        });
      } catch (_auditErr) {
        // Swallow: the stop stands even if the event write fails.
      }
    }
    return respond(200, {
      reply: lifeSafetyStopMessage(lifeSafety),
      mode: "owner",
      life_safety_gate: {
        stopped: true,
        action: lifeSafety.action,
        hazard: lifeSafety.hazard ?? null,
        escalation_authority: lifeSafety.escalationAuthority ?? null,
      },
    });
  }

  // 4. SECURITY VERDICT GATE (code-enforced) — the consolidated
  //    authorization clause. The system-prompt HARD BOUNDARY
  //    remains as the second, behavioral layer. This gate is
  //    the first: machine-enforced, audited, and authorization-
  //    immune for forbidden operations.
  const authzRows = await db
    .from("archie_offensive_engagements")
    .select(
      "id, target_id, current_phase, archie_offensive_targets!target_id(kind, identifier)",
    )
    .limit(50);
  const flatRows: EngagementRow[] = (authzRows.data ?? [])
    .filter((r: Record<string, unknown>) => r.archie_offensive_targets)
    .map((r: Record<string, unknown>) => {
      const t = r.archie_offensive_targets as Record<string, unknown>;
      return {
        engagement_id: String(r.id ?? ""),
        target_id: String(r.target_id ?? ""),
        kind: String(t.kind ?? ""),
        identifier: String(t.identifier ?? ""),
        current_phase: String(r.current_phase ?? ""),
      };
    });
  const authz = reduceAuthorizations(flatRows);
  const verdict = classifySecurityMessage(message, {
    hasValidAuthorization: authz.hasValidAuthorization,
    // FIX 30: named targets must fall inside the registered
    // scope — an engagement for one target no longer
    // authorizes operations against another.
    inScopeIdentifiers: authz.inScopeIdentifiers,
  });
  if (!verdict.allowed) {
    if (user) {
      // Never let audit-logging break the refusal itself.
      try {
        await db.from("frelux_security_events").insert({
          user_id: user.id,
          kind: verdict.hardRefused
            ? "SECURITY_GATE_HARD_REFUSAL"
            : "SECURITY_GATE_AUTHORIZATION_REQUIRED",
          severity: "warning",
          message: `[owner-chat] ${verdict.reason}`,
        });
      } catch (_auditErr) {
        // Swallow: the refusal stands even if the event write fails.
      }
    }
    return respond(200, {
      reply:
        `I can't do that one. ${verdict.reason}` +
        (verdict.intrusive && !verdict.hardRefused
          ? ""
          : " If you believe this is a mistake, review the authorization rules in the Security console."),
      mode: "owner",
      security_gate: {
        refused: true,
        hard_refused: verdict.hardRefused,
        label: verdict.label ?? null,
      },
    });
  }

  // 5. UNDERSTAND -> SELECT -> EXECUTE -> VALIDATE -> RESPOND
  const attachmentsNote =
    body.attachments && body.attachments.length
      ? `\n\n[Owner attached ${body.attachments.length} file(s): ${body.attachments
          .map((a) => `${a.name} (${a.type})`)
          .join(
            ", ",
          )}. Analysis of file CONTENT is not yet operational; acknowledge what was attached honestly.]`
      : "";

  const request: ArchieInferenceRequest = {
    turns: [
      ...history.map((t) => ({
        role: t.role,
        parts: [{ text: t.content }] as ArchieInferencePart[],
      })),
      { role: "owner" as const, parts: [{ text: message + attachmentsNote }] },
    ],
    tools: activeToolSpecs(),
    systemInstruction: learnKb
      ? `${SYSTEM_PROMPT}\n\n${learnKb}`
      : SYSTEM_PROMPT,
    conversationId,
  };

  const toolRuns: ToolRun[] = [];

  // REAL PERSONALIZATION PRIVACY CONTROL (Memory & Data
  // Rights Policy): the owner's personalization_memory
  // consent is honored per request. Revoked → the kernel and
  // its substrate run in-memory only — no persistent memory
  // loads, no learning writes, no memory-based
  // personalization. Granted or unset → durable memory stays
  // wired. This is a real gate, not a stored preference.
  // RESPONSE TIME (owner directive 2026-09-16): the consent
  // read and the learned-term registry warm-up are
  // INDEPENDENT queries — start both at once instead of
  // paying two sequential DB round trips before the cognitive
  // cycle. Ordering is preserved where it matters: the
  // registry is registered BEFORE vocabulary capture (so
  // already-learned words are never re-captured or mangled by
  // the typo corrector), and capture still completes before
  // the cycle so this message's new words are protected too.
  const learnedTermsPromise = loadLearnedTerms(db).catch(() => [] as string[]);
  try {
    const { data: consent } = await db
      .from("archie_privacy_consents")
      .select("granted, revoked_at")
      .eq("user_id", activeOwnerUserId ?? user?.id ?? "")
      .eq("consent_key", "personalization_memory")
      .maybeSingle();
    const revoked = consent
      ? consent.granted === false || consent.revoked_at !== null
      : false;
    configureCognitiveEnginePersistence(revoked ? null : db);
  } catch {
    // Consent table unavailable → default: memory stays wired.
    configureCognitiveEnginePersistence(db);
  }

  // The owner path runs the UNIFIED COGNITIVE LOOP — the same
  // kernel the tests verify: perception (secret redaction on
  // ingest) → memory retrieval → reasoning → world-model
  // update → verification → authority gate → response →
  // learning. Every phase is recorded with its anatomical
  // organ and persisted to the cognitive trace table.
  // SELF-EVOLVING VOCABULARY (owner directive 2026-09-12):
  // warm the learned-term registry so words ARCHIE already
  // learned are never treated as typos, then GRAB AND SAVE
  // every word in the owner's message that is not registered
  // yet (usage provenance, no meaning guess — learning is
  // free, never breaks the conversation).
  try {
    registerLearnedTerms(await learnedTermsPromise);
    await captureUnknownVocabulary(db, message, activeOwnerUserId);
  } catch {
    /* vocabulary learning never breaks the chat */
  }
  let cognitiveTrace: Array<{
    phase: string;
    status: string;
    organs: string[];
  }> | null = null;
  try {
    let result: import("../_shared/archie-ai/runtime.ts").ArchieInferenceResult;
    try {
      // history = the typed request turns minus the current
      // message (the kernel's input is the message itself).
      // Plan P1 seam parity (2026-09-16): the owner path
      // drives cycle() directly, which bypasses
      // kernel.generate()'s noteDeclaredTools — without this
      // declaration the substrate's requestToolNames stays
      // empty and every declared tool (frelux_status,
      // sentry_diagnostics, market_intelligence, ...) is a
      // dead registration on this path (live incident:
      // 'run sentry duty' misrouted to farewell while the
      // sentry_diagnostics tool sat unreachable).
      getCognitiveEngine().declareTools(
        activeToolSpecs().map((t) => t.name),
        conversationId,
      );
      const cycle = await getCognitiveEngine().cycle(
        message + attachmentsNote,
        request.turns.slice(0, -1),
        undefined,
        {
          conversationId,
          // A-1: this is structurally the OWNER's own turn
          // (visitor/family traffic returned above) — the only
          // authorization that may unlock the owner-gated
          // local generative model at the honest-unknown path.
          ownerAuthorized: true,
          // Gap 3: live phase/step events → SSE progress.
          onEvent: (e) => emit?.("progress", e),
        },
      );
      cognitiveTrace = cycle.trace.phases.map((p) => ({
        phase: p.phase,
        status: p.status,
        organs: p.organs ?? [],
      }));
      // Plan P1 parity: relay the substrate's toolCall the
      // same way kernel.generate() does — the tool loop below
      // executes it and resumes through the trailing
      // toolResult seam. finishReason says TOOL_CALL
      // honestly while one is pending.
      const cycleParts: ArchieInferencePart[] = [
        {
          // OWNER DIRECTIVE (2026-09-16): no em dashes in
          // ARCHIE's voice — belt and braces on the outbound
          // text too.
          text: cycle.responseText
            .replace(/\s*[—–]\s*/g, ", ")
            .replace(/,\s*,/g, ","),
        },
      ];
      if (cycle.toolCall) {
        cycleParts.push({
          toolCall: {
            name: cycle.toolCall.name,
            args: cycle.toolCall.args,
          },
        });
      }
      result = {
        parts: cycleParts,
        engine: {
          path: "archie-unified-cognitive",
          note: "Unified cognitive loop: perception → memory retrieval → reasoning → validation → authority → learning. ARCHIE's own engine — no external AI provider.",
        },
        finishReason: cycle.toolCall ? "TOOL_CALL" : "COMPLETE",
      };
    } catch {
      // Honest degradation: the substrate engine alone (same
      // native inference, no kernel phases) — never an external
      // provider, never a fabricated loop.
      result = await runtime.generate(request);
    }

    // Tool loop (max 3 hops)
    for (let hop = 0; hop < 3; hop++) {
      const call = result.parts.find((p) => p.toolCall)?.toolCall;
      if (!call) break;

      const tool = TOOLS.find((t) => t.name === call.name);
      if (!tool || !tool.operational || !tool.execute) {
        request.turns.push({ role: "archie", parts: result.parts });
        request.turns.push({
          role: "owner",
          parts: [
            {
              toolResult: {
                name: call.name,
                output: { error: "Tool is not operational yet" },
              },
            },
          ],
        });
        result = await runtime.generate(request);
        continue;
      }

      const output = await tool.execute(call.args ?? {}, {
        userId: user?.id ?? "",
      });
      toolRuns.push({
        tool: tool.name,
        ok: true,
        input: call.args ?? {},
        output,
        at: new Date().toISOString(),
      });

      request.turns.push({ role: "archie", parts: result.parts });
      request.turns.push({
        role: "owner",
        parts: [{ toolResult: { name: tool.name, output } }],
      });
      result = await runtime.generate(request);
    }

    // OWNER DIRECTIVE (2026-09-16): no em dashes in ARCHIE's
    // voice — applied to the FINAL assembled text so resumed
    // tool answers get the same cleanup as cycle text.
    const text = result.parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim()
      .replace(/\s*[—–]\s*/g, ", ")
      .replace(/,\s*,/g, ",");
    if (!text) {
      return respond(502, {
        error: "ARCHIE produced no response text",
        engine: result.engine,
      });
    }
    return respond(200, {
      reply: sanitize(text),
      toolRuns,
      engine: result.engine,
      // The unified loop trace — which organs executed this
      // answer. Full transparency: perception, memory, brain,
      // validation and learning are all named, never claimed.
      cognitiveTrace,
      pendingCapabilities: TOOLS.filter((t) => !t.operational).map(
        (t) => t.name,
      ),
    });
  } catch (err) {
    return respond(502, {
      error:
        err instanceof Error ? sanitize(err.message) : "ARCHIE core failure",
      toolRuns,
      engine,
    });
  }
}

// ---- boundary: classic JSON or SSE stream (gap 3) --------
serveWithCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Stream detection: explicit request flag OR the standard
  // SSE accept header. The body is peeked via clone(); the
  // real parse (and its 400) still happens in executeChat.
  let wantsStream = (req.headers.get("accept") ?? "").includes(
    "text/event-stream",
  );
  if (!wantsStream) {
    try {
      const peeked = await req.clone().json();
      wantsStream = peeked?.stream === true;
    } catch {
      /* invalid JSON — executeChat returns the honest 400 */
    }
  }

  if (!wantsStream) {
    const outcome = await executeChat(req);
    return jsonResponse(outcome);
  }

  // STREAMING (owner upgrade 2026-09-16, gap 3): live SSE.
  //   event:start     — the stream is open
  //   event:progress  — live phase/step events from the
  //                      cognitive kernel as they execute
  //   event:delta     — response text chunks (the text is
  //                      fully computed first — this is
  //                      paced delivery, never fabrication)
  //   event:done      — the full structured payload, the
  //                      SAME shape as the JSON response
  const stream = new ReadableStream<Uint8Array>({
    start: async (controller) => {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        } catch {
          /* client disconnected — stop writing */
        }
      };
      try {
        send("start", {
          streaming: true,
          engine: "archie-unified-cognitive",
          at: new Date().toISOString(),
        });
        const outcome = await executeChat(req, (event, data) =>
          send("progress", { event, ...data })
        );
        const reply = (outcome.body as { reply?: string }).reply;
        if (typeof reply === "string" && reply.length > 0) {
          // honest deltas: word-group chunks of the computed
          // reply; no artificial server-side delay.
          const words = reply.split(/(\s+)/);
          let buf = "";
          let n = 0;
          for (const w of words) {
            buf += w;
            n += 1;
            if (n >= 6) {
              send("delta", { text: buf });
              buf = "";
              n = 0;
            }
          }
          if (buf.length > 0) send("delta", { text: buf });
        }
        send("done", outcome.body);
      } catch (err) {
        send("error", {
          error:
            err instanceof Error ? sanitize(err.message) : "stream failure",
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS,
    },
  });
});
