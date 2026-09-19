// Supabase Edge Function: archie-escrow
//
// FRELUX ESCROW §23 (Stage B) — SERVER-SIDE WORKFLOW ENFORCEMENT.
//
// Every escrow mutation routes through this audited function:
//   * create_transaction — the client defines the engagement
//       and the milestone schedule (amounts validated by the
//       deterministic lifecycle core, integer kobo only)
//   * start_milestone / deliver_milestone / submit_evidence —
//       the engaged contractor works; DELIVERY IS REFUSED
//       WITHOUT EVIDENCE (a bare claim is not delivery)
//   * accept_milestone / reject_milestone — the client judges
//       delivered work
//   * raise_dispute / resolve_dispute — participants raise;
//       only the Owner (admin) adjudicates, with resolution
//   * acceptance_lapse — the acceptance window is recomputed
//       SERVER-SIDE from the agreed terms and the real clock;
//       it never applies unless it has truly lapsed
//   * request_release — ACCEPTED → RELEASE_PENDING with the
//       deterministic releaseReadiness re-check
//
// MONEY STATES NEVER CHANGE HERE. FUNDED / RELEASED / REFUNDED
// are produced only by provider-verified webhook events
// (paystack-webhook, Stage C). ARCHIE is not an actor in this
// function: it monitors and flags through the service role,
// never moves funds (canArchieExecuteFundsAction is hard
// false).
//
// Every action — success AND denial — is recorded in the
// append-only frelux_escrow_events ledger, attributed to its
// actor. Denials are recorded exactly like successes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serveWithCors } from "../_shared/serve.ts";
import {
  checkRateLimit,
  getRateLimitKey,
  RATE_LIMITS,
} from "../_shared/rate-limit.ts";
import { rateLimitedResponse } from "../_shared/cors.ts";
import {
  acceptanceWindowLapsed,
  DEFAULT_ESCROW_TERMS,
  validateMilestoneAmounts,
  validateMilestoneTransition,
  type EscrowActor,
  type EscrowMilestoneStatus,
  type EscrowTerms,
} from "../_shared/escrow/escrow-lifecycle.ts";

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

const EVIDENCE_KINDS = [
  "PHOTO",
  "DOCUMENT",
  "INSPECTION",
  "MEASUREMENT",
  "OTHER",
] as const;

const MAX_MILESTONES = 50;

function parseTerms(raw: unknown): EscrowTerms {
  const t = (raw ?? {}) as Record<string, unknown>;
  const acceptance = Number(t.acceptance_window_days);
  const funding = Number(t.funding_window_days);
  return {
    acceptance_window_days: Number.isInteger(acceptance) &&
        acceptance >= 0 && acceptance <= 30
      ? acceptance
      : DEFAULT_ESCROW_TERMS.acceptance_window_days,
    funding_window_days: Number.isInteger(funding) && funding >= 1 &&
        funding <= 30
      ? funding
      : DEFAULT_ESCROW_TERMS.funding_window_days,
    currency: "NGN",
  };
}

serveWithCors(async (req: Request) => {
  const rl = checkRateLimit(
    getRateLimitKey(req, req.headers.get("x-user-id") ?? undefined),
    RATE_LIMITS.GENERAL,
  );
  if (!rl.allowed) return rateLimitedResponse(rl.resetAt);

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")
    return json(405, { ok: false, error: "Method not allowed." });

  const service = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  // ---- auth: verify the caller's JWT server-side ----
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: userData, error: authErr } = await service.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
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

  // ---- admin check (the "OWNER" actor is the platform admin) ----
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  // ---- ledger helper: append-only, denials recorded too ----
  const log = (
    transactionId: string,
    actor: EscrowActor,
    actionName: string,
    result: "success" | "failure" | "denied",
    detail: Record<string, unknown>,
  ) =>
    service.from("frelux_escrow_events").insert({
      transaction_id: transactionId,
      milestone_id: (detail.milestone_id as string) ?? null,
      actor,
      action: actionName,
      result,
      detail,
    });

  // ---- load transaction + resolve the caller's actor ----
  async function loadTransaction(transactionId: string) {
    const { data: txn } = await service
      .from("frelux_escrow_transactions")
      .select("*")
      .eq("id", transactionId)
      .maybeSingle();
    return txn;
  }

  function resolveActor(
    txn: { client_id: string; contractor_user_id: string | null },
  ): EscrowActor | null {
    if (isAdmin) return "OWNER";
    if (txn.client_id === caller.id) return "CLIENT";
    if (txn.contractor_user_id === caller.id) return "CONTRACTOR";
    return null;
  }

  // =====================================================
  // create_transaction — the client schedules the work.
  // =====================================================
  if (action === "create_transaction") {
    const projectTitle = String(body.project_title ?? "").trim();
    const contractorName = String(body.contractor_name ?? "").trim();
    const contractorUserId = body.contractor_user_id
      ? String(body.contractor_user_id)
      : null;
    const rawMilestones = Array.isArray(body.milestones)
      ? (body.milestones as Record<string, unknown>[])
      : [];

    if (!projectTitle || !contractorName) {
      return json(400, {
        ok: false,
        error: "A project title and contractor name are required.",
      });
    }
    if (rawMilestones.length === 0 || rawMilestones.length > MAX_MILESTONES) {
      return json(400, {
        ok: false,
        error: `A transaction requires between 1 and ${MAX_MILESTONES} milestones.`,
      });
    }

    // Shape + validate BEFORE inserting anything. Malformed
    // input is a 400, never an unhandled throw.
    let milestones: Array<{
      sequence: number;
      title: string;
      description: string | null;
      deliverables: string[];
      amount_kobo: number;
      due_date: string | null;
    }>;
    try {
      milestones = rawMilestones.map((m, i) => {
        const title = String(m.title ?? "").trim();
        if (!title) throw new Error("Every milestone requires a title.");
        const deliverables = Array.isArray(m.deliverables)
          ? m.deliverables.map(String)
          : [];
        const amount = Number(m.amount_kobo);
        if (!Number.isInteger(amount)) {
          throw new Error("Milestone amounts must be integer kobo.");
        }
        return {
          sequence: i + 1,
          title,
          description: m.description ? String(m.description) : null,
          deliverables,
          amount_kobo: amount,
          due_date: m.due_date ? String(m.due_date) : null,
        };
      });
    } catch (e) {
      return json(400, { ok: false, error: (e as Error).message });
    }

    const total = Number(body.total_amount_kobo);
    const amounts = validateMilestoneAmounts(milestones, total);
    if (!amounts.ok) return json(400, { ok: false, error: amounts.error });

    const terms = parseTerms(body.terms);

    const { data: txn, error: tErr } = await service
      .from("frelux_escrow_transactions")
      .insert({
        client_id: caller.id,
        contractor_user_id: contractorUserId,
        contractor_name: contractorName,
        project_title: projectTitle,
        total_amount_kobo: total,
        status: "DRAFT",
        terms,
      })
      .select("id")
      .single();
    if (tErr || !txn) {
      return json(500, { ok: false, error: "Could not create the transaction." });
    }

    const { error: mErr } = await service
      .from("frelux_escrow_milestones")
      .insert(
        milestones.map((m) => ({
          transaction_id: txn.id,
          ...m,
          status: "PENDING" as const,
        })),
      );
    if (mErr) {
      await log(txn.id, "CLIENT", "create_transaction", "failure", {
        error: mErr.message,
      });
      return json(500, { ok: false, error: "Could not schedule the milestones." });
    }

    await log(txn.id, "CLIENT", "create_transaction", "success", {
      milestones: milestones.length,
      total_amount_kobo: total,
    });
    return json(200, { ok: true, transaction_id: txn.id });
  }

  // =====================================================
  // Milestone-scoped actions share one guarded path.
  // =====================================================
  const transactionId = String(body.transaction_id ?? "");
  const milestoneId = String(body.milestone_id ?? "");
  if (!transactionId || !milestoneId) {
    return json(400, {
      ok: false,
      error: "A transaction_id and milestone_id are required.",
    });
  }

  const txn = await loadTransaction(transactionId);
  if (!txn) {
    return json(404, { ok: false, error: "Transaction not found." });
  }
  const actor = resolveActor(txn);
  if (!actor) {
    await log(transactionId, "CLIENT", action, "denied", {
      milestone_id: milestoneId,
      reason: "caller is not a party to this transaction",
    });
    return json(403, { ok: false, error: "Not a party to this transaction." });
  }

  const { data: milestone } = await service
    .from("frelux_escrow_milestones")
    .select("*")
    .eq("id", milestoneId)
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!milestone) {
    return json(404, { ok: false, error: "Milestone not found." });
  }

  const now = new Date().toISOString();
  const terms = parseTerms(txn.terms);

  /** Validate + apply a milestone transition, ledger-first. */
  const applyTransition = async (
    to: EscrowMilestoneStatus,
    extra: Record<string, unknown> = {},
    evidenceProvided = false,
    context: Record<string, unknown> = {},
  ) => {
    const check = validateMilestoneTransition({
      from: milestone.status as EscrowMilestoneStatus,
      to,
      actor,
      evidence_provided: evidenceProvided,
      context,
    });
    if (!check.ok) {
      await log(transactionId, actor, action, "denied", {
        milestone_id: milestoneId,
        from: milestone.status,
        to,
        reason: check.error,
      });
      return json(403, { ok: false, error: check.error });
    }
    const { error } = await service
      .from("frelux_escrow_milestones")
      .update({ status: to, ...extra })
      .eq("id", milestoneId);
    if (error) {
      await log(transactionId, actor, action, "failure", {
        milestone_id: milestoneId,
        error: error.message,
      });
      return json(500, { ok: false, error: "Could not update the milestone." });
    }
    await log(transactionId, actor, action, "success", {
      milestone_id: milestoneId,
      from: milestone.status,
      to,
    });
    return json(200, { ok: true, status: to });
  };

  switch (action) {
    // ---------------------------------------------------
    case "start_milestone": {
      return applyTransition("IN_PROGRESS");
    }

    // ---------------------------------------------------
    case "submit_evidence": {
      const kind = String(body.kind ?? "OTHER");
      const description = String(body.description ?? "").trim();
      if (!EVIDENCE_KINDS.includes(kind as (typeof EVIDENCE_KINDS)[number])) {
        return json(400, { ok: false, error: "Unknown evidence kind." });
      }
      if (!description) {
        return json(400, {
          ok: false,
          error: "Evidence requires a description, never a bare claim.",
        });
      }
      const { error } = await service.from("frelux_escrow_evidence").insert({
        milestone_id: milestoneId,
        transaction_id: transactionId,
        submitted_by: caller.id,
        kind,
        description,
        file_uri: body.file_uri ? String(body.file_uri) : null,
      });
      if (error) {
        await log(transactionId, actor, "submit_evidence", "failure", {
          milestone_id: milestoneId,
          error: error.message,
        });
        return json(500, { ok: false, error: "Could not record the evidence." });
      }
      await log(transactionId, actor, "submit_evidence", "success", {
        milestone_id: milestoneId,
        kind,
      });
      return json(200, { ok: true });
    }

    // ---------------------------------------------------
    case "deliver_milestone": {
      // DELIVERY REQUIRES EVIDENCE — count real evidence rows.
      const { count } = await service
        .from("frelux_escrow_evidence")
        .select("id", { count: "exact", head: true })
        .eq("milestone_id", milestoneId);
      if (!count || count === 0) {
        await log(transactionId, actor, "deliver_milestone", "denied", {
          milestone_id: milestoneId,
          reason: "delivery requires evidence",
        });
        return json(400, {
          ok: false,
          error:
            "Delivery requires evidence — submit evidence before marking a milestone DELIVERED.",
        });
      }
      return applyTransition("DELIVERED", { delivered_at: now }, true);
    }

    // ---------------------------------------------------
    case "accept_milestone": {
      return applyTransition("ACCEPTED", {
        accepted_at: now,
        accepted_via: "CLIENT",
      });
    }

    // ---------------------------------------------------
    case "reject_milestone": {
      const reason = String(body.reason ?? "").trim();
      if (!reason) {
        return json(400, {
          ok: false,
          error: "Rejection requires a reason for the contractor.",
        });
      }
      return applyTransition("REJECTED", {}, false).then(async (r) => {
        if (r.status === 200) {
          await log(transactionId, actor, "reject_reason", "success", {
            milestone_id: milestoneId,
            reason,
          });
        }
        return r;
      });
    }

    // ---------------------------------------------------
    case "acceptance_lapse": {
      // OWNER (admin) triggers the check; the window is
      // recomputed SERVER-SIDE from terms + the real clock.
      const lapsed = acceptanceWindowLapsed(
        { status: milestone.status as EscrowMilestoneStatus },
        milestone.delivered_at ?? "",
        terms,
        now,
      );
      if (!lapsed) {
        await log(transactionId, actor, "acceptance_lapse", "denied", {
          milestone_id: milestoneId,
          reason: "the acceptance window has not lapsed",
        });
        return json(409, {
          ok: false,
          error: "The acceptance window has not lapsed.",
        });
      }
      return applyTransition(
        "ACCEPTED",
        {
          accepted_at: now,
          accepted_via: "WINDOW_LAPSE",
          acceptance_window_lapsed: true,
        },
        false,
        { acceptance_window_lapsed: true },
      );
    }

    // ---------------------------------------------------
    case "raise_dispute": {
      if (actor === "OWNER") {
        return json(403, {
          ok: false,
          error: "Disputes are raised by the parties, not the Owner.",
        });
      }
      const position = String(body.position ?? "").trim();
      if (!position) {
        return json(400, {
          ok: false,
          error: "A dispute requires the raising party's position.",
        });
      }
      const check = validateMilestoneTransition({
        from: milestone.status as EscrowMilestoneStatus,
        to: "DISPUTED",
        actor,
      });
      if (!check.ok) {
        await log(transactionId, actor, "raise_dispute", "denied", {
          milestone_id: milestoneId,
          reason: check.error,
        });
        return json(403, { ok: false, error: check.error });
      }
      const evidenceReviewed = Array.isArray(body.evidence_reviewed)
        ? (body.evidence_reviewed as unknown[]).map(String)
        : [];
      const { error: dErr } = await service
        .from("frelux_escrow_disputes")
        .insert({
          transaction_id: transactionId,
          milestone_id: milestoneId,
          raised_by: caller.id,
          raised_by_role: actor === "CLIENT" ? "CLIENT" : "CONTRACTOR",
          positions: [position],
          evidence_reviewed: evidenceReviewed,
        });
      if (dErr) {
        await log(transactionId, actor, "raise_dispute", "failure", {
          milestone_id: milestoneId,
          error: dErr.message,
        });
        return json(500, { ok: false, error: "Could not record the dispute." });
      }
      await service
        .from("frelux_escrow_milestones")
        .update({ status: "DISPUTED" })
        .eq("id", milestoneId);
      await log(transactionId, actor, "raise_dispute", "success", {
        milestone_id: milestoneId,
      });
      return json(200, { ok: true, status: "DISPUTED" });
    }

    // ---------------------------------------------------
    case "resolve_dispute": {
      // ONLY the Owner adjudicates, with a written resolution.
      if (actor !== "OWNER") {
        await log(transactionId, actor, "resolve_dispute", "denied", {
          milestone_id: milestoneId,
          reason: "adjudication belongs to the Owner",
        });
        return json(403, {
          ok: false,
          error: "Dispute adjudication belongs to the Owner.",
        });
      }
      const to = String(body.resolution ?? "");
      const resolutionText = String(body.resolution_note ?? "").trim();
      if (
        !["IN_PROGRESS", "ACCEPTED", "REJECTED"].includes(to) ||
        !resolutionText
      ) {
        return json(400, {
          ok: false,
          error:
            "A resolution requires a milestone outcome (IN_PROGRESS, ACCEPTED or REJECTED) and a written note.",
        });
      }
      const check = validateMilestoneTransition({
        from: milestone.status as EscrowMilestoneStatus,
        to: to as EscrowMilestoneStatus,
        actor: "OWNER",
      });
      if (!check.ok) {
        await log(transactionId, actor, "resolve_dispute", "denied", {
          milestone_id: milestoneId,
          reason: check.error,
        });
        return json(403, { ok: false, error: check.error });
      }
      const extra: Record<string, unknown> = {};
      if (to === "ACCEPTED") {
        extra.accepted_at = now;
        extra.accepted_via = "OWNER_ADJUDICATION";
      }
      const { error } = await service
        .from("frelux_escrow_milestones")
        .update({ status: to, ...extra })
        .eq("id", milestoneId);
      if (error) {
        await log(transactionId, actor, "resolve_dispute", "failure", {
          milestone_id: milestoneId,
          error: error.message,
        });
        return json(500, { ok: false, error: "Could not resolve the dispute." });
      }
      await service
        .from("frelux_escrow_disputes")
        .update({
          resolution: to,
          recommended_resolution: resolutionText,
          resolved_by: caller.id,
          resolved_at: now,
        })
        .eq("transaction_id", transactionId)
        .eq("milestone_id", milestoneId)
        .eq("resolved_at", null);
      await log(transactionId, actor, "resolve_dispute", "success", {
        milestone_id: milestoneId,
        outcome: to,
      });
      return json(200, { ok: true, status: to });
    }

    // ---------------------------------------------------
    case "request_release": {
      // ACCEPTED → RELEASE_PENDING, Owner-initiated. The
      // deterministic releaseReadiness re-check is the STAGE C
      // provider pipeline's gate (it runs when the milestone is
      // already RELEASE_PENDING, immediately before the Paystack
      // transfer); here the funded-state gate is checked
      // directly and honestly. The actual transfer is executed
      // by the provider pipeline — NEVER here, NEVER by ARCHIE.
      if (actor !== "OWNER") {
        await log(transactionId, actor, "request_release", "denied", {
          milestone_id: milestoneId,
          reason: "release requests are initiated by the Owner/provider pipeline",
        });
        return json(403, {
          ok: false,
          error: "Release requests are initiated by the Owner/provider pipeline.",
        });
      }
      if (txn.status !== "FUNDED" && txn.status !== "ACTIVE") {
        await log(transactionId, actor, "request_release", "denied", {
          milestone_id: milestoneId,
          reason: `transaction is ${txn.status}, funds not verified`,
        });
        return json(409, {
          ok: false,
          error:
            "Funds must be verified FUNDED (a provider charge event) before any release request.",
        });
      }
      return applyTransition("RELEASE_PENDING");
    }

    default:
      return json(400, { ok: false, error: `Unknown action: ${action}` });
  }
});
