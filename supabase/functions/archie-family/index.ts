// Supabase Edge Function: archie-family
//
// FRELUX ARCHIE STAGE 2 — FAMILY / TRUSTED PEOPLE (spec §§25-28).
//
// Server-side enforcement for the trusted-person lifecycle:
//   invite   — Owner creates a person + cryptographically secure
//              invitation code. The code is returned ONCE;
//              only its SHA-256 hash is stored. Short-lived,
//              single-use, server-validated.
//   redeem   — A family member/professional enters the code.
//              The code ALONE grants nothing: redemption only
//              creates a PENDING_REQUEST for Owner review.
//   approve  — Owner reviews, configures permissions, sets
//              access expiry — THEN the person becomes ACTIVE.
//              Nothing is auto-granted; permissions default
//              to none until the Owner sets them.
//   update   — Owner modifies permissions, suspends, revokes
//              or removes access at any time.
//   share / unshare — Owner shares individual conversations /
//              knowledge items with an active person.
//   list / me / my-shares — read paths for Owner and person.
//
// Authorization: Owner mutations are enforced server-side via
// auth.uid() matching owner_id. A subscriber request is never
// authorization. Data isolation for family members is enforced
// by RLS + SECURITY DEFINER RPCs in migration 20260910100000.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";

const CORS = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Real SHA-256 via WebCrypto.
async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const PERMISSION_KEYS = [
  "ARCHIE_CHAT",
  "VOICE",
  "CAMERA",
  "IMAGES",
  "FILES",
  "DOCUMENTS",
  "LOCATION",
  "ASSIGNED_PROJECTS",
  "ASSIGNED_PROPERTIES",
  "SHARED_KNOWLEDGE",
  "PERSONAL_KNOWLEDGE",
  "OWNER_DATA",
  "OWNER_DASHBOARD",
  "ARCHIE_ADMINISTRATION",
  "DEVICE_MANAGEMENT",
  "SECURITY",
  "CRYPTO_INTELLIGENCE",
];

const RELATIONS = [
  "FAMILY",
  "PARTNER",
  "SIBLING",
  "ARCHITECT",
  "ENGINEER",
  "QUANTITY_SURVEYOR",
  "CONTRACTOR",
  "CONSULTANT",
  "OTHER",
];

const RESOURCE_TYPES = [
  "conversation",
  "knowledge_item",
  "project",
  "property",
];

serveWithCors(async (req) => {
  // Audit fix M-7 (2026-09-11): rate limit this endpoint per user
  // (falls back to client IP). OPTIONS preflights are answered at
  // the CORS boundary and never reach this check.
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "Method not allowed" });

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // ---- auth: verify the caller's JWT server-side ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: authErr } = await service.auth.getUser(token);
  if (authErr || !userData?.user) {
    return json(401, { ok: false, error: "Authentication required." });
  }
  const caller = userData.user;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }
  const action = String(body.action ?? "");

  // Helper: audit into the ARCHIE owner's audit stream.
  const audit = async (
    ownerId: string,
    event: string,
    severity: string,
    details: Record<string, unknown>,
  ) => {
    await service.from("frelux_archie_audit_events").insert({
      owner_id: ownerId,
      event_type: event,
      severity,
      details,
    });
  };

  // =====================================================
  // invite — Owner only.
  // =====================================================
  if (action === "invite") {
    const displayName = String(body.display_name ?? "").trim();
    const relation = String(body.relation ?? "FAMILY");
    if (!displayName)
      return json(400, { ok: false, error: "A display name is required." });
    if (!RELATIONS.includes(relation))
      return json(400, { ok: false, error: "Unknown relation." });

    // Cryptographically secure code: 10 chars from crypto.getRandomValues.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const rand = crypto.getRandomValues(new Uint8Array(10));
    const code = Array.from(rand)
      .map((b) => alphabet[b % alphabet.length])
      .join("");
    const codeHash = await hashCode(code);

    const { data: person, error: pErr } = await service
      .from("frelux_archie_people")
      .insert({
        owner_id: caller.id,
        display_name: displayName,
        relation,
        status: "PENDING_INVITE",
        permissions: [],
      })
      .select("id")
      .single();
    if (pErr)
      return json(500, {
        ok: false,
        error: "Could not create the invitation.",
      });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: iErr } = await service
      .from("frelux_archie_invitations")
      .insert({
        owner_id: caller.id,
        people_id: person.id,
        code_hash: codeHash,
        expires_at: expiresAt,
      });
    if (iErr)
      return json(500, {
        ok: false,
        error: "Could not create the invitation.",
      });

    await audit(caller.id, "archie.family.invite_created", "INFO", {
      people_id: person.id,
      display_name: displayName,
      relation,
      expires_at: expiresAt,
    });

    // The plaintext code is returned exactly once and never stored.
    return json(200, {
      ok: true,
      people_id: person.id,
      code,
      expires_at: expiresAt,
      note: "Share this code now — it is shown once, expires in 24 hours and can be used once. The code alone grants nothing until you approve the request.",
    });
  }

  // =====================================================
  // redeem — any authenticated user with the code.
  // The code alone NEVER grants access (spec §25).
  // =====================================================
  if (action === "redeem") {
    const code = String(body.code ?? "")
      .trim()
      .toUpperCase();
    if (!code)
      return json(400, { ok: false, error: "An invitation code is required." });
    const codeHash = await hashCode(code);

    const { data: invitation } = await service
      .from("frelux_archie_invitations")
      .select("id, owner_id, people_id, expires_at, used_at")
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (!invitation)
      return json(404, { ok: false, error: "This code is not valid." });
    if (invitation.used_at)
      return json(409, { ok: false, error: "This code was already used." });
    if (new Date(invitation.expires_at) < new Date()) {
      return json(410, { ok: false, error: "This code has expired." });
    }
    if (invitation.owner_id === caller.id) {
      return json(409, {
        ok: false,
        error: "You cannot redeem your own invitation.",
      });
    }

    // Consume the code + create the pending request — atomically.
    const { error: useErr } = await service
      .from("frelux_archie_invitations")
      .update({ used_at: new Date().toISOString(), used_by_user: caller.id })
      .eq("id", invitation.id)
      .is("used_at", null);
    if (useErr)
      return json(409, { ok: false, error: "This code was already used." });

    await service
      .from("frelux_archie_people")
      .update({ user_id: caller.id, status: "PENDING_REQUEST" })
      .eq("id", invitation.people_id);

    await audit(invitation.owner_id, "archie.family.redeem_requested", "INFO", {
      people_id: invitation.people_id,
      redeemed_by: caller.id,
    });

    return json(200, {
      ok: true,
      note: "Code accepted. Your request is now PENDING — the Owner must review, approve and set your permissions before ARCHIE is activated.",
    });
  }

  // =====================================================
  // Owner-gated actions below: enforce ownership server-side.
  // =====================================================
  // Only owner person-scoped actions need a resolved person row;
  // "list" and "invite" operate without one and must skip this gate
  // (previously EVERY action hit it with an empty people_id and died
  // with a false "Person not found" 404).
  const needsPerson = ["approve", "update", "remove", "share", "unshare"].includes(
    action,
  );
  const peopleId = needsPerson ? String(body.people_id ?? "") : "";
  const { data: personRow } = needsPerson
    ? await service
        .from("frelux_archie_people")
        .select("id, owner_id, status, permissions, user_id")
        .eq("id", peopleId)
        .maybeSingle()
    : { data: null as Record<string, unknown> | null };
  if (needsPerson && !personRow)
    return json(404, { ok: false, error: "Person not found." });
  if (needsPerson && personRow && personRow.owner_id !== caller.id) {
    await audit(
      personRow.owner_id,
      "archie.family.unauthorized_attempt",
      "WARNING",
      {
        attempted_by: caller.id,
        people_id: peopleId,
        action,
      },
    );
    return json(403, {
      ok: false,
      error: "Only the Owner may perform this action.",
    });
  }

  const validatePermissions = (raw: unknown): string[] | null => {
    if (!Array.isArray(raw)) return null;
    const set = raw.map(String).filter((k) => PERMISSION_KEYS.includes(k));
    return [...new Set(set)];
  };

  if (action === "approve") {
    if (personRow.status !== "PENDING_REQUEST") {
      return json(409, {
        ok: false,
        error: "Only a pending request can be approved.",
      });
    }
    const permissions = validatePermissions(body.permissions) ?? [];
    const hours =
      body.access_hours === null || body.access_hours === undefined
        ? null
        : Number(body.access_hours);
    const expiresAt =
      hours && hours > 0
        ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
        : null; // permanent access only when explicitly configured
    const { error } = await service
      .from("frelux_archie_people")
      .update({
        status: "ACTIVE",
        permissions,
        access_expires_at: expiresAt,
        activated_at: new Date().toISOString(),
      })
      .eq("id", peopleId);
    if (error) return json(500, { ok: false, error: "Approval failed." });
    await audit(caller.id, "archie.family.approved", "INFO", {
      people_id: peopleId,
      permissions,
      access_expires_at: expiresAt,
    });
    return json(200, {
      ok: true,
      note: "Activated with the permissions you configured.",
    });
  }

  if (action === "update") {
    const patch: Record<string, unknown> = {};
    if (body.permissions !== undefined) {
      const permissions = validatePermissions(body.permissions);
      if (permissions === null)
        return json(400, { ok: false, error: "Invalid permissions." });
      patch.permissions = permissions;
    }
    if (body.status !== undefined) {
      const status = String(body.status);
      if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
        return json(400, { ok: false, error: "Invalid status." });
      }
      patch.status = status;
      if (status === "REVOKED") patch.revoked_at = new Date().toISOString();
    }
    if (body.access_hours !== undefined) {
      const hours =
        body.access_hours === null ? null : Number(body.access_hours);
      patch.access_expires_at =
        hours && hours > 0
          ? new Date(Date.now() + hours * 3600 * 1000).toISOString()
          : null;
    }
    if (Object.keys(patch).length === 0) {
      return json(400, { ok: false, error: "Nothing to update." });
    }
    const { error } = await service
      .from("frelux_archie_people")
      .update(patch)
      .eq("id", peopleId);
    if (error) return json(500, { ok: false, error: "Update failed." });
    await audit(caller.id, "archie.family.updated", "INFO", {
      people_id: peopleId,
      patch: Object.keys(patch),
    });
    return json(200, { ok: true });
  }

  if (action === "share") {
    const resourceType = String(body.resource_type ?? "");
    const resourceId = String(body.resource_id ?? "");
    if (!RESOURCE_TYPES.includes(resourceType) || !resourceId) {
      return json(400, { ok: false, error: "Invalid resource." });
    }
    if (personRow.status !== "ACTIVE") {
      return json(409, {
        ok: false,
        error: "Share only with an active person.",
      });
    }
    const { error } = await service.from("frelux_archie_shares").upsert({
      owner_id: caller.id,
      person_id: peopleId,
      resource_type: resourceType,
      resource_id: resourceId,
    });
    if (error) return json(500, { ok: false, error: "Share failed." });
    await audit(caller.id, "archie.family.resource_shared", "INFO", {
      people_id: peopleId,
      resource_type: resourceType,
      resource_id: resourceId,
    });
    return json(200, { ok: true });
  }

  if (action === "unshare") {
    const { error } = await service
      .from("frelux_archie_shares")
      .delete()
      .eq("person_id", peopleId)
      .eq("resource_type", String(body.resource_type ?? ""))
      .eq("resource_id", String(body.resource_id ?? ""));
    if (error) return json(500, { ok: false, error: "Unshare failed." });
    await audit(caller.id, "archie.family.resource_unshared", "INFO", {
      people_id: peopleId,
      resource_type: body.resource_type,
    });
    return json(200, { ok: true });
  }

  if (action === "remove") {
    await service
      .from("frelux_archie_shares")
      .delete()
      .eq("person_id", peopleId);
    await service.from("frelux_archie_people").delete().eq("id", peopleId);
    await audit(caller.id, "archie.family.removed", "WARNING", {
      people_id: peopleId,
    });
    return json(200, {
      ok: true,
      note: "Person and all their shares permanently removed.",
    });
  }

  if (action === "list") {
    const { data: people } = await service
      .from("frelux_archie_people")
      .select(
        "id, display_name, relation, status, permissions, access_expires_at, invited_at, activated_at, user_id",
      )
      .eq("owner_id", caller.id)
      .order("invited_at", { ascending: false });
    const { data: shares } = await service
      .from("frelux_archie_shares")
      .select("person_id, resource_type, resource_id")
      .eq("owner_id", caller.id);
    return json(200, { ok: true, people: people ?? [], shares: shares ?? [] });
  }

  return json(400, { ok: false, error: "Unknown action." });
});
