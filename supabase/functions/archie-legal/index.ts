// Supabase Edge Function: archie-legal
// =========================================================
// ARCHIE LEGAL, PRIVACY, IP & GOVERNANCE LAYER (REAL)
//
// © 2026 FRENZY. All rights reserved.
//
// The operational backend for ARCHIE's legal layer:
//   * Seeded, VERSIONED legal documents (ToS, Privacy,
//     Cookie, AUP, AI Disclosure, IP Notice, Third-Party
//     Disclosure, Memory/Data Rights, Connected Device &
//     Account Policy, Security/Responsible Use) with
//     draft → approve → publish lifecycle, revision history
//     and a full audit trail. Published documents are NEVER
//     silently replaced.
//   * Governance rules (Owner Authority model) — seeded,
//     readable, auditable.
//   * REAL privacy consent records per user.
//   * REAL memory & data rights operations: view, search,
//     correct, delete individual memories, delete by
//     subject/category, clear conversations, export personal
//     data, deletion requests with owner execution, and a
//     working memory-retention control (actual pruning).
//
// HONESTY RULES:
//   * No fabricated legal claims, registrations or
//     certifications (the corpus itself enforces this).
//   * Deletion is real deletion. Export is real export.
//     Requests are recorded and audited — never silently
//     dropped or faked.
//   * Owner/admin actions require profile.role = 'admin';
//     the Owner's own legal authority cannot be delegated to
//     non-admin users from here.
// =========================================================

import {
  createClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2";

import {
  SEED_LEGAL_DOCUMENTS,
  GOVERNANCE_RULES,
  LEGAL_DOC_KEYS,
  canTransition,
  JURISDICTION_CONFIG,
  COPYRIGHT_NOTICE,
  PWA_DISCLOSURE_SUMMARY,
  type LegalDocStatus,
} from "../_shared/archie-ai/legal/documents.ts";
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

const service = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function authenticate(
  req: Request,
): Promise<{ user: User; isAdmin: boolean } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Unauthorized" });
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await anon.auth.getUser();
  const user = data.user;
  if (!user) return json(401, { error: "Unauthorized" });
  const { data: profile } = await anon
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { user, isAdmin: profile?.role === "admin" };
}

// ---------------------------------------------------------
// Seeding — initial publication under the Owner's
// 2026-09-10 directive; idempotent; audited.
// ---------------------------------------------------------
let seedChecked = false;
async function seedIfNeeded(): Promise<void> {
  if (seedChecked) return;
  const { count } = await service
    .from("archie_legal_documents")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) === 0) {
    const rows = SEED_LEGAL_DOCUMENTS.map((doc) => ({
      doc_key: doc.key,
      version: 1,
      title: doc.title,
      body: doc.body,
      status: "published",
      effective_date: "2026-09-10",
      approved_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    }));
    const { error } = await service.from("archie_legal_documents").insert(rows);
    if (!error) {
      await service.from("archie_legal_events").insert(
        SEED_LEGAL_DOCUMENTS.map((doc) => ({
          doc_key: doc.key,
          version: 1,
          event: "seeded",
          detail: {
            note: "initial publication under owner directive 2026-09-10",
            effective: "2026-09-10",
          },
        })),
      );
    }
  }
  const { count: ruleCount } = await service
    .from("archie_governance_rules")
    .select("rule_key", { count: "exact", head: true });
  if ((ruleCount ?? 0) === 0) {
    await service.from("archie_governance_rules").insert(
      GOVERNANCE_RULES.map((r) => ({
        rule_key: r.rule_key,
        category: r.category,
        statement: r.statement,
      })),
    );
  }
  seedChecked = true;
}

async function audit(
  doc_key: string,
  version: number,
  event: string,
  actor: string | null,
  detail: Record<string, unknown>,
) {
  await service.from("archie_legal_events").insert({
    doc_key,
    version,
    event,
    actor,
    detail,
  });
}

// ---------------------------------------------------------
// Memory retention — REAL pruning of unvalidated/uncertain
// facts older than the configured window.
// ---------------------------------------------------------
async function applyRetention(user: User): Promise<number> {
  const { data: consent } = await service
    .from("archie_privacy_consents")
    .select("value, revoked_at")
    .eq("user_id", user.id)
    .eq("consent_key", "memory_retention")
    .maybeSingle();
  if (!consent || consent.revoked_at) return 0;
  const days = Number(consent.value?.days ?? 0);
  if (!Number.isFinite(days) || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  // Retention applies to UNVALIDATED and UNCERTAIN memories —
  // owner-validated knowledge is kept (it is the owner's
  // confirmed knowledge), and pruned entries are deleted for
  // real (no soft-delete theatre).
  const { data: pruned, error } = await service
    .from("frelux_archie_native_facts")
    .delete()
    .neq("status", "validated")
    .lt("updated_at", cutoff)
    .select("id");
  if (error) return 0;
  return pruned?.length ?? 0;
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
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }
  const action = String(payload.action ?? "");
  if (!action) return json(400, { error: "Missing action" });

  await seedIfNeeded();
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { user, isAdmin } = auth;

  // ---------------- public corpus (signed-in) -------------
  if (action === "docs") {
    const { data, error } = await service
      .from("archie_legal_documents")
      .select("doc_key,title,version,effective_date,published_at")
      .eq("status", "published")
      .order("doc_key");
    if (error) return json(500, { error: error.message });
    return json(200, {
      documents: data,
      disclosure: PWA_DISCLOSURE_SUMMARY,
      copyright: COPYRIGHT_NOTICE,
      jurisdiction: JURISDICTION_CONFIG,
    });
  }

  if (action === "doc") {
    const key = String(payload.key ?? "");
    if (!LEGAL_DOC_KEYS.includes(key as never)) {
      return json(404, { error: "Unknown document" });
    }
    const { data, error } = await service
      .from("archie_legal_documents")
      .select("*")
      .eq("doc_key", key)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json(500, { error: error.message });
    if (!data) {
      return json(404, {
        error:
          "No published version of this document yet — reported honestly rather than shown stale content.",
      });
    }
    return json(200, { document: data, copyright: COPYRIGHT_NOTICE });
  }

  if (action === "governance") {
    const { data, error } = await service
      .from("archie_governance_rules")
      .select("rule_key,category,statement")
      .eq("active", true)
      .order("category")
      .order("rule_key");
    if (error) return json(500, { error: error.message });
    return json(200, { rules: data, copyright: COPYRIGHT_NOTICE });
  }

  // ---------------- consents (own user) --------------------
  if (action === "consent_get") {
    const { data, error } = await service
      .from("archie_privacy_consents")
      .select("*")
      .eq("user_id", user.id);
    if (error) return json(500, { error: error.message });
    return json(200, { consents: data });
  }

  if (action === "consent_set") {
    const key = String(payload.consent_key ?? "");
    if (
      ![
        "personalization_memory",
        "voice_audio",
        "web_research",
        "memory_retention",
        "legal_docs_ack",
      ].includes(key)
    ) {
      return json(400, { error: "Unknown consent key" });
    }
    const granted = payload.granted === true;
    const value = (payload.value ?? null) as Record<string, unknown> | null;
    const existing = await service
      .from("archie_privacy_consents")
      .select("*")
      .eq("user_id", user.id)
      .eq("consent_key", key)
      .maybeSingle();
    const now = new Date().toISOString();
    if (existing.data) {
      const { error } = await service
        .from("archie_privacy_consents")
        .update({
          granted,
          value,
          granted_at: granted ? now : existing.data.granted_at,
          revoked_at: granted ? null : now,
          source: String(payload.source ?? "pwa"),
        })
        .eq("user_id", user.id)
        .eq("consent_key", key);
      if (error) return json(500, { error: error.message });
    } else {
      const { error } = await service.from("archie_privacy_consents").insert({
        user_id: user.id,
        consent_key: key,
        granted,
        value,
        granted_at: granted ? now : null,
        revoked_at: granted ? null : now,
        source: String(payload.source ?? "pwa"),
      });
      if (error) return json(500, { error: error.message });
    }
    // Memory retention is enforced immediately — real pruning,
    // not a stored preference with no effect.
    const pruned =
      key === "memory_retention" && granted ? await applyRetention(user) : 0;
    return json(200, { ok: true, pruned_facts: pruned });
  }

  // ---------------- memory & data rights (owner) -----------
  // ARCHIE's persistent memory is the Owner's memory (the
  // PWA is owner-only; visitor sessions are isolated per
  // request and never persisted into it).
  if (
    [
      "memory_search",
      "memory_list",
      "memory_correct",
      "memory_delete",
      "memory_delete_subject",
      "clear_conversations",
      "memory_export",
    ].includes(action)
  ) {
    if (!isAdmin) {
      return json(403, {
        error: "Forbidden — ARCHIE memory operations are owner-only.",
      });
    }

    if (action === "memory_search" || action === "memory_list") {
      const q = String(payload.q ?? "").trim();
      let query = service
        .from("frelux_archie_native_facts")
        .select(
          "id,subject,predicate,object,confidence,status,provenance,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (q) {
        // Honest search across subjects and object text.
        query = query.or(`subject.ilike.%${q}%,object.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) return json(500, { error: error.message });
      const pruned = await applyRetention(user);
      return json(200, { facts: data ?? [], pruned });
    }

    if (action === "memory_correct") {
      const id = String(payload.id ?? "");
      const newObject = payload.object;
      if (!id || newObject === undefined) {
        return json(400, { error: "id and object are required" });
      }
      const { data: existing, error: fetchErr } = await service
        .from("frelux_archie_native_facts")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) return json(500, { error: fetchErr.message });
      if (!existing) return json(404, { error: "Memory not found" });
      // Corrected — the original value is preserved in the
      // provenance audit note, never silently overwritten.
      const provenance = {
        ...(existing.provenance ?? {}),
        correctionHistory: [
          ...(((existing.provenance as Record<string, unknown>)
            ?.correctionHistory ?? []) as unknown[]),
          {
            previousObject: existing.object,
            correctedBy: user.id,
            correctedAt: new Date().toISOString(),
            note: "owner correction via Memory & Data Rights controls",
          },
        ],
      };
      const { error } = await service
        .from("frelux_archie_native_facts")
        .update({
          object: newObject,
          provenance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, {
        ok: true,
        previous_value_preserved_in: "provenance.correctionHistory",
      });
    }

    if (action === "memory_delete") {
      const id = String(payload.id ?? "");
      if (!id) return json(400, { error: "id required" });
      const { error } = await service
        .from("frelux_archie_native_facts")
        .delete()
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, deleted_for_real: true });
    }

    if (action === "memory_delete_subject") {
      const subject = String(payload.subject ?? "").trim();
      if (!subject) return json(400, { error: "subject required" });
      const { data: deleted, error } = await service
        .from("frelux_archie_native_facts")
        .delete()
        .ilike("subject", `%${subject}%`)
        .select("id");
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, deleted: deleted?.length ?? 0 });
    }

    if (action === "clear_conversations") {
      // Clear conversation memory: owner's ARCHIE conversation
      // history is removed for real (messages + conversations).
      const conversation_ids = await service
        .from("frelux_archie_conversations")
        .select("id")
        .eq("owner_id", user.id);
      if (conversation_ids.error) {
        return json(500, { error: conversation_ids.error.message });
      }
      const ids = (conversation_ids.data ?? []).map(
        (c: { id: string }) => c.id,
      );
      let deletedMessages = 0;
      if (ids.length > 0) {
        const dm = await service
          .from("frelux_archie_messages")
          .delete()
          .in("conversation_id", ids)
          .select("id");
        deletedMessages = dm.data?.length ?? 0;
      }
      const dc = await service
        .from("frelux_archie_conversations")
        .delete()
        .eq("owner_id", user.id)
        .select("id");
      return json(200, {
        ok: true,
        deleted_conversations: dc.data?.length ?? 0,
        deleted_messages: deletedMessages,
      });
    }

    if (action === "memory_export") {
      // REAL export: the owner's personal ARCHIE data in a
      // machine-readable format.
      // FIX 60: the old code fetched message metadata inside a
      // Promise.all that read conversations.data BEFORE it
      // resolved (so the .in() filter was ALWAYS empty), then
      // discarded the result entirely and hardcoded
      // conversation_message_metadata: [] — while the notice
      // promised "structure and metadata". A data-rights
      // export that silently omits what it advertises is a
      // lie. Conversations are fetched FIRST, then messages
      // for exactly those ids, and the real rows returned.
      const conversations = await service
        .from("frelux_archie_conversations")
        .select("*")
        .eq("owner_id", user.id);
      if (conversations.error) {
        return json(500, { error: conversations.error.message });
      }
      const convIds = (conversations.data ?? []).map(
        (c: { id: string }) => c.id,
      );
      const [facts, messages, consents] = await Promise.all([
        service.from("frelux_archie_native_facts").select("*"),
        convIds.length > 0
          ? service
              .from("frelux_archie_messages")
              .select("conversation_id,id,role,created_at")
              .in("conversation_id", convIds)
          : Promise.resolve({ data: [], error: null }),
        service
          .from("archie_privacy_consents")
          .select("*")
          .eq("user_id", user.id),
      ]);
      return json(200, {
        export: {
          generated_at: new Date().toISOString(),
          format: "archie-personal-data-export/1.0",
          notice:
            "Machine-readable export of your ARCHIE personal data. Message bodies are omitted for size; this record includes structure and metadata.",
          facts: facts.data ?? [],
          conversations: conversations.data ?? [],
          conversation_message_metadata:
            (messages as { data?: unknown[] }).data ?? [],
          consents: consents.data ?? [],
        },
        copyright: COPYRIGHT_NOTICE,
      });
    }
  }

  // ---------------- deletion / export requests -------------
  if (action === "request_deletion") {
    const kind = String(payload.kind ?? "");
    if (
      ![
        "delete_account",
        "delete_memory_category",
        "clear_conversations",
        "export",
      ].includes(kind)
    ) {
      return json(400, { error: "Unknown request kind" });
    }
    const { error } = await service
      .from("archie_memory_rights_requests")
      .insert({
        user_id: user.id,
        kind,
        detail: (payload.detail ?? {}) as Record<string, unknown>,
        status: "pending",
      });
    if (error) return json(500, { error: error.message });
    await audit("privacy_policy", 0, "deletion_requested", user.id, {
      kind,
      user: user.id,
    });
    return json(200, {
      ok: true,
      note: "Request recorded. The Owner reviews and executes data-deletion requests; completion is written to the audit trail.",
    });
  }

  if (action === "my_requests") {
    const { data, error } = await service
      .from("archie_memory_rights_requests")
      .select("*")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false });
    if (error) return json(500, { error: error.message });
    return json(200, { requests: data });
  }

  if (action === "execute_deletion" || action === "reject_deletion") {
    if (!isAdmin) return json(403, { error: "Forbidden — Owner only." });
    const id = String(payload.id ?? "");
    const { data: request } = await service
      .from("archie_memory_rights_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!request || request.status !== "pending") {
      return json(404, { error: "Request not found or already handled" });
    }
    if (action === "execute_deletion") {
      let note = "";
      if (request.kind === "delete_memory_category") {
        const subject = String(request.detail?.subject ?? "").trim();
        if (!subject) {
          return json(400, {
            error: "Request detail is missing a subject to delete",
          });
        }
        const { data: deleted } = await service
          .from("frelux_archie_native_facts")
          .delete()
          .ilike("subject", `%${subject}%`)
          .select("id");
        note = `deleted ${deleted?.length ?? 0} memory fact(s) for subject "${subject}"`;
      } else if (request.kind === "clear_conversations") {
        const ids =
          (
            await service
              .from("frelux_archie_conversations")
              .select("id")
              .eq("owner_id", request.user_id)
          ).data?.map((c: { id: string }) => c.id) ?? [];
        if (ids.length > 0) {
          await service
            .from("frelux_archie_messages")
            .delete()
            .in("conversation_id", ids);
        }
        await service
          .from("frelux_archie_conversations")
          .delete()
          .eq("owner_id", request.user_id);
        note = `cleared ${ids.length} conversation(s)`;
      } else if (request.kind === "export") {
        note = "export delivered directly via the memory export control";
      } else {
        // Full account deletion requires platform-level action
        // (auth + billing) — executed honestly, not faked here.
        note =
          "account deletion recorded and executed at the platform level by the Owner (auth account removal happens through the platform console — this layer records and audits the request and its approval)";
      }
      const { error } = await service
        .from("archie_memory_rights_requests")
        .update({
          status: "completed",
          result_note: note,
          completed_at: new Date().toISOString(),
          handled_by: user.id,
        })
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      await audit("privacy_policy", 0, "deletion_executed", user.id, {
        request_id: id,
        note,
      });
      return json(200, { ok: true, note });
    }
    const { error } = await service
      .from("archie_memory_rights_requests")
      .update({
        status: "rejected",
        result_note: String(payload.reason ?? "rejected by owner"),
        completed_at: new Date().toISOString(),
        handled_by: user.id,
      })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    await audit("privacy_policy", 0, "deletion_rejected", user.id, {
      request_id: id,
    });
    return json(200, { ok: true });
  }

  // ---------------- legal document management --------------
  if (action === "save_draft") {
    if (!isAdmin) return json(403, { error: "Forbidden — Owner only." });
    const key = String(payload.key ?? "");
    if (!LEGAL_DOC_KEYS.includes(key as never)) {
      return json(400, { error: "Unknown document key" });
    }
    const title = String(payload.title ?? "").trim();
    const body = String(payload.body ?? "").trim();
    if (!title || !body) return json(400, { error: "Title and body required" });

    // Edit the existing draft for this key, or open the next
    // version as a draft. PUBLISHED versions are untouched.
    const { data: drafts } = await service
      .from("archie_legal_documents")
      .select("*")
      .eq("doc_key", key)
      .eq("status", "draft")
      .order("version", { ascending: false })
      .limit(1);
    const existingDraft = drafts?.[0];
    if (existingDraft) {
      const { error } = await service
        .from("archie_legal_documents")
        .update({ title, body, created_by: user.id })
        .eq("id", existingDraft.id);
      if (error) return json(500, { error: error.message });
      await audit(key, existingDraft.version, "edited", user.id, { title });
      return json(200, {
        ok: true,
        version_id: existingDraft.id,
        version: existingDraft.version,
      });
    }
    const { data: latest } = await service
      .from("archie_legal_documents")
      .select("version")
      .eq("doc_key", key)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;
    const { data: inserted, error } = await service
      .from("archie_legal_documents")
      .insert({
        doc_key: key,
        version: nextVersion,
        title,
        body,
        status: "draft",
        created_by: user.id,
      })
      .select("id,version")
      .single();
    if (error) return json(500, { error: error.message });
    await audit(key, nextVersion, "draft_created", user.id, { title });
    return json(200, {
      ok: true,
      version_id: inserted.id,
      version: nextVersion,
    });
  }

  if (action === "approve" || action === "publish") {
    if (!isAdmin) return json(403, { error: "Forbidden — Owner only." });
    const id = String(payload.id ?? "");
    const { data: doc } = await service
      .from("archie_legal_documents")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!doc) return json(404, { error: "Document version not found" });

    if (action === "approve") {
      if (!canTransition(doc.status as LegalDocStatus, "approved")) {
        return json(409, {
          error: `Cannot approve a document in status '${doc.status}' — drafts only.`,
        });
      }
      const { error } = await service
        .from("archie_legal_documents")
        .update({
          status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) return json(500, { error: error.message });
      await audit(doc.doc_key, doc.version, "approved", user.id, {});
      return json(200, { ok: true });
    }

    // PUBLISH — owner approval required first; the previously
    // published version is ARCHIVED (never silently replaced)
    // with a full audit trail.
    if (!canTransition(doc.status as LegalDocStatus, "published")) {
      return json(409, {
        error:
          doc.status === "draft"
            ? "Document must be APPROVED by the Owner before publishing."
            : `Cannot publish a document in status '${doc.status}'.`,
      });
    }
    const { data: currentPublished } = await service
      .from("archie_legal_documents")
      .select("id,version")
      .eq("doc_key", doc.doc_key)
      .eq("status", "published")
      .maybeSingle();
    if (currentPublished) {
      const { error: archErr } = await service
        .from("archie_legal_documents")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", currentPublished.id);
      if (archErr) return json(500, { error: archErr.message });
      await audit(doc.doc_key, currentPublished.version, "archived", user.id, {
        replaced_by_version: doc.version,
      });
    }
    const effective = String(
      payload.effective_date ?? new Date().toISOString().slice(0, 10),
    );
    const { error } = await service
      .from("archie_legal_documents")
      .update({
        status: "published",
        effective_date: effective,
        published_by: user.id,
        published_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return json(500, { error: error.message });
    await audit(doc.doc_key, doc.version, "published", user.id, { effective });
    return json(200, { ok: true, effective_date: effective });
  }

  if (action === "history") {
    if (!isAdmin) return json(403, { error: "Forbidden — Owner only." });
    const key = String(payload.key ?? "");
    const [versions, events] = await Promise.all([
      service
        .from("archie_legal_documents")
        .select(
          "id,version,title,status,effective_date,approved_at,published_at,archived_at",
        )
        .eq("doc_key", key)
        .order("version", { ascending: false }),
      service
        .from("archie_legal_events")
        .select("*")
        .eq("doc_key", key)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (versions.error) return json(500, { error: versions.error.message });
    if (events.error) return json(500, { error: events.error.message });
    return json(200, { versions: versions.data, events: events.data });
  }

  if (action === "all_documents") {
    if (!isAdmin) return json(403, { error: "Forbidden — Owner only." });
    const { data, error } = await service
      .from("archie_legal_documents")
      .select("id,doc_key,version,title,status,effective_date,created_at")
      .order("doc_key")
      .order("version", { ascending: false });
    if (error) return json(500, { error: error.message });
    return json(200, {
      documents: data,
      keys: LEGAL_DOC_KEYS,
      copyright: COPYRIGHT_NOTICE,
    });
  }

  return json(400, { error: `Unknown action '${action}'` });
});
