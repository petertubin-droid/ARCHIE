// Supabase Edge Function: archie-voice-enroll
// =========================================================
// ARCHIE VOICE INTELLIGENCE — OWNER VOICE ENROLLMENT
// (OWNER-ONLY, DELIBERATE, AUDITED)
//
// The ONLY server that can create, change or delete the
// Owner's enrolled speaker profile. Rules:
//
//   * Owner-only: JWT + profiles.role = 'admin' on EVERY
//     call. Non-admins get 403 — no fallback. RLS keeps
//     other users away from the row as well.
//   * DELIBERATE enrollment: samples arrive ONLY when the
//     owner explicitly records them in the enrollment UI.
//     This function never enrolls from chat utterances.
//   * PRIVACY: the client extracts the voiceprint vector
//     ON-DEVICE (deterministic DSP) and sends ONLY the
//     derived vector. Raw microphone recordings are NEVER
//     uploaded here.
//   * AUTHORITY: the voiceprint is a speaker-similarity
//     signal for personalization. It authorizes NOTHING —
//     protected operations always require the existing
//     archie-owner-auth workflow. This is stated in every
//     response and audit record.
//   * Enrolled vectors are private biometric-style data:
//     never returned raw to any client, never logged.
//   * Rate-limited per owner; every action audited.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  DEFAULT_ENROLLMENT_SAMPLES,
  DEFAULT_MATCH_THRESHOLD,
  VOICEPRINT_DIM,
  VOICEPRINT_SECURITY_LABEL,
  enrollVoiceprint,
  verifySpeaker,
  type VoiceprintVector,
} from "../_shared/archie-ai/native-engine/voiceprint.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const service = createClient(SUPABASE_URL, SERVICE_ROLE);
const anon = createClient(SUPABASE_URL, ANON_KEY);

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

function fail(status: number, code: string, error: string) {
  return json(status, { ok: false, code, error });
}

async function audit(
  userId: string,
  eventType: string,
  severity: "INFO" | "WARNING" | "CRITICAL",
  detail: Record<string, unknown>,
) {
  await service.from("frelux_archie_audit_events").insert({
    owner_id: userId,
    event_type: eventType,
    severity,
    detail,
  });
}

async function requireOwner(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const auth = req.headers.get("Authorization");
  if (!auth)
    return { ok: false, res: fail(401, "UNAUTHORIZED", "Sign in required.") };
  const token = auth.replace("Bearer ", "");
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user)
    return { ok: false, res: fail(401, "UNAUTHORIZED", "Invalid session.") };
  // The profiles lookup runs under RLS: without the caller's JWT the
  // anon client sees zero rows and every owner gets a false 403.
  const authedClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: profile } = await authedClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return {
      ok: false,
      res: fail(
        403,
        "FORBIDDEN",
        "Owner access only — voice enrollment is owner-gated.",
      ),
    };
  }
  return { ok: true, userId: userData.user.id };
}

function isValidVector(v: unknown): v is VoiceprintVector {
  if (!v || typeof v !== "object") return false;
  const vector = v as Record<string, unknown>;
  return (
    Array.isArray(vector.features) &&
    vector.features.length === VOICEPRINT_DIM &&
    vector.features.every((f) => typeof f === "number" && Number.isFinite(f)) &&
    typeof vector.voicedFrames === "number" &&
    vector.voicedFrames >= 0
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "METHOD", "POST only.");

  const owner = await requireOwner(req);
  if (!owner.ok) return owner.res;
  const userId = owner.userId;

  const rl = checkRateLimit(`voice-enroll:${userId}`, {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed)
    return fail(
      429,
      "RATE_LIMITED",
      "Too many enrollment requests — try again shortly.",
    );

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD_BODY", "Malformed request body.");
  }
  const action = String(body.action ?? "");

  // ---- current row (owner-scoped by RLS through service? no:
  //      service bypasses RLS — ALWAYS filter by user_id) ----
  const { data: row } = await service
    .from("frelux_archie_speaker_profile")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  async function upsert(patch: Record<string, unknown>) {
    if (row) {
      await service
        .from("frelux_archie_speaker_profile")
        .update({ ...patch, updated_date: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
    } else {
      await service
        .from("frelux_archie_speaker_profile")
        .insert({ user_id: userId, ...patch });
    }
  }

  function statusPayload(extra: Record<string, unknown> = {}) {
    return json(200, {
      ok: true,
      enrollment_state: (row?.enrollment_state as string | undefined) ?? "NONE",
      sample_count: (row?.sample_count as number | undefined) ?? 0,
      required_samples: DEFAULT_ENROLLMENT_SAMPLES,
      threshold:
        (row?.match_threshold as number | undefined) ?? DEFAULT_MATCH_THRESHOLD,
      security_label: VOICEPRINT_SECURITY_LABEL,
      ...extra,
    });
  }

  switch (action) {
    case "status": {
      return statusPayload();
    }

    case "enroll-sample": {
      // A deliberate, owner-recorded enrollment sample. Only
      // the derived vector arrives — never raw audio.
      if (row?.enrollment_state === "COMPLETE") {
        return fail(
          409,
          "ALREADY_ENROLLED",
          "Voice profile is complete. Re-enroll from settings to replace it (disable first).",
        );
      }
      const vector = body.vector;
      if (!isValidVector(vector)) {
        return fail(
          400,
          "INVALID_VECTOR",
          "The voiceprint sample is invalid — insufficient voiced audio or malformed data. Nothing was stored.",
        );
      }
      const pending = [
        ...((row?.pending_samples as unknown[]) ?? []),
        {
          features: vector.features,
          voicedFrames: vector.voicedFrames,
          sampleRate: vector.sampleRate,
          durationSec: vector.durationSec,
        },
      ];
      await upsert({
        enrollment_state: "ENROLLING",
        pending_samples: pending,
      });
      await audit(userId, "archie.voice.enroll_sample", "INFO", {
        pending_samples: pending.length,
        duration_sec: vector.durationSec,
        note: "deliberate owner enrollment sample — derived vector only, raw audio never uploaded",
      });
      return json(200, {
        ok: true,
        enrollment_state: "ENROLLING",
        sample_count: pending.length,
        required_samples: DEFAULT_ENROLLMENT_SAMPLES,
        security_label: VOICEPRINT_SECURITY_LABEL,
      });
    }

    case "finalize": {
      const pending = (row?.pending_samples as unknown[]) ?? [];
      const samples = pending
        .map((s) => s as VoiceprintVector)
        .filter(isValidVector);
      const result = enrollVoiceprint({
        samples,
        now: new Date().toISOString(),
        threshold:
          (row?.match_threshold as number | undefined) ??
          DEFAULT_MATCH_THRESHOLD,
      });
      if (!result.ok) {
        return fail(
          400,
          "SILENCE",
          "No usable enrollment samples exist yet. Record samples first.",
        );
      }
      if (!result.complete) {
        return fail(
          409,
          "TOO_FEW_SAMPLES",
          `Enrollment needs at least ${DEFAULT_ENROLLMENT_SAMPLES} deliberate samples (have ${samples.length}).`,
        );
      }
      await upsert({
        enrollment_state: "COMPLETE",
        features: result.profile.features,
        // Sensory periphery (audit re-assessment 2026-09-19):
        // persist the owner's measured within-speaker spreads
        // so verification scores against evidence, not a
        // fixed tolerance. Undefined for single-sample legacy
        // profiles — the classic metric still applies.
        feature_spreads: result.profile.spreads ?? null,
        sample_count: result.profile.sampleCount,
        pending_samples: [],
        languages: Array.isArray(body.languages)
          ? (body.languages as string[]).slice(0, 8)
          : [],
      });
      await audit(userId, "archie.voice.enrolled", "INFO", {
        sample_count: result.profile.sampleCount,
        threshold: result.profile.threshold,
        note: VOICEPRINT_SECURITY_LABEL,
      });
      return json(200, {
        ok: true,
        enrollment_state: "COMPLETE",
        sample_count: result.profile.sampleCount,
        threshold: result.profile.threshold,
        security_label: VOICEPRINT_SECURITY_LABEL,
      });
    }

    case "verify": {
      // Check an utterance vector against the enrolled
      // profile — SERVER-SIDE, so a client can never forge a
      // match result. Used by the chat voice loop.
      const vector = body.vector;
      if (!isValidVector(vector)) {
        return fail(400, "INVALID_VECTOR", "Utterance voiceprint is invalid.");
      }
      if (row?.enrollment_state !== "COMPLETE" || !row?.features) {
        return json(200, {
          ok: true,
          enrollment_state: row?.enrollment_state ?? "NONE",
          speaker: {
            determinable: false,
            match: false,
            score: 0,
            security_label: VOICEPRINT_SECURITY_LABEL,
          },
        });
      }
      const rawSpreads = row.feature_spreads;
      const spreads =
        Array.isArray(rawSpreads) &&
        (rawSpreads as unknown[]).every(
          (x) => typeof x === "number" && Number.isFinite(x),
        )
          ? (rawSpreads as number[])
          : undefined;
      const speaker = verifySpeaker(vector as VoiceprintVector, {
        features: row.features as number[],
        spreads,
        sampleCount: row.sample_count as number,
        updatedAt: String(row.updated_date),
        threshold: (row.match_threshold as number) ?? DEFAULT_MATCH_THRESHOLD,
      });
      await audit(userId, "archie.voice.speaker_check", "INFO", {
        match: speaker.match,
        score: Math.round(speaker.score * 1000) / 1000,
        determinable: speaker.determinable,
        note: speaker.securityLabel,
      });
      return json(200, {
        ok: true,
        enrollment_state: "COMPLETE",
        speaker: {
          determinable: speaker.determinable,
          match: speaker.match,
          score: Math.round(speaker.score * 1000) / 1000,
          security_label: VOICEPRINT_SECURITY_LABEL,
        },
      });
    }

    case "disable": {
      await upsert({ enrollment_state: "DISABLED" });
      await audit(userId, "archie.voice.enrollment_disabled", "WARNING", {
        note: "owner disabled speaker recognition — profile kept, matching refuses",
      });
      return json(200, {
        ok: true,
        enrollment_state: "DISABLED",
        security_label: VOICEPRINT_SECURITY_LABEL,
      });
    }

    case "re-enroll": {
      // clears samples + features, back to fresh enrollment
      await upsert({
        enrollment_state: "NONE",
        pending_samples: [],
        features: null,
        sample_count: 0,
      });
      await audit(userId, "archie.voice.enrollment_reset", "WARNING", {
        note: "owner reset enrollment — vectors cleared",
      });
      return json(200, {
        ok: true,
        enrollment_state: "NONE",
        security_label: VOICEPRINT_SECURITY_LABEL,
      });
    }

    case "delete": {
      if (row) {
        await service
          .from("frelux_archie_speaker_profile")
          .delete()
          .eq("id", row.id)
          .eq("user_id", userId);
      }
      await audit(userId, "archie.voice.enrollment_deleted", "WARNING", {
        note: "owner deleted the speaker profile entirely (data-retention right)",
      });
      return json(200, {
        ok: true,
        enrollment_state: "NONE",
        security_label: VOICEPRINT_SECURITY_LABEL,
      });
    }

    default:
      return fail(400, "BAD_ACTION", `Unknown action "${action}".`);
  }
});
