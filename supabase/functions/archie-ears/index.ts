// Supabase Edge Function: archie-ears
// =========================================================
// FRELUX ARCHIE — EARS / AUDITED TRANSCRIPTION INTAKE
// (OWNER-ONLY, NATIVE, PROVIDER-FREE)
//
// ARCHIE understands speech through the browser/OS native
// recognition engine — on the owner's device, with NO cloud
// provider, NO API key and NO OpenAI (OpenAI Separation
// Rule, owner-directed 2026-09-10). This function performs
// NO transcription: it is the audited intake for real native
// transcripts.
//
//   MICROPHONE → NATIVE SPEECH RECOGNITION (on-device)
//     → TRANSCRIPT + VOICE PRINT (owner's voice bank, pure
//       math) → THIS FUNCTION → OWNER GATE → AUDIT
//     → ARCHIE PERCEPTION → COGNITIVE ENGINE
//
// Rules:
//   * Owner-only: JWT + profiles.role = 'admin' verified on
//     EVERY call. Non-admins get 403 — no fallback.
//   * HONESTY: an empty transcript is audited as
//     speech_detected:false. Nothing is invented here, and
//     nothing is claimed that the native engine did not
//     really produce (spec §§3,16,19).
//   * LANGUAGE: the provided hint is validated against the
//     LIVE ARCHIE language registry (frelux_archie_languages)
//     — the audit records whether it is registered, honestly.
//   * VOICE PRINT: deterministic pitch comparison against
//     the owner's voice-bank profile — real math on the
//     owner's own samples, not a forensic biometric claim.
//   * Every call is audited to frelux_archie_audit_events;
//     the anatomy health runner reports the ears subsystem
//     HEALTHY only once a REAL transcription exists there.
//   * Rate-limited per owner (abuse protection).
// =========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { validateEarsIntake } from "../_shared/archie-ai/native-engine/ears.ts";
import { serveWithCors } from "../_shared/serve.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const service = createClient(SUPABASE_URL, SERVICE_ROLE);

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

function earsError(status: number, code: string, message: string) {
  return json(status, { ok: false, code, error: message });
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
): Promise<{ ok: false; res: Response } | { ok: true; userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, res: earsError(401, "UNAUTHORIZED", "Unauthorized") };
  }
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data } = await anon.auth.getUser();
  const user = data.user;
  if (!user) {
    return { ok: false, res: earsError(401, "UNAUTHORIZED", "Unauthorized") };
  }
  const { data: profile } = await anon
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    await service.from("frelux_archie_audit_events").insert({
      owner_id: user.id,
      event_type: "archie.ears.access_denied",
      severity: "WARNING",
      detail: { reason: "non-admin attempted ARCHIE ears access" },
    });
    return {
      ok: false,
      res: earsError(403, "FORBIDDEN", "Forbidden — ARCHIE is Owner-only."),
    };
  }
  // REAL voice-privacy consent gate (Memory & Data Rights
  // Policy): the voice_audio consent governs whether ARCHIE
  // processes audio for this owner. Revoked → honest refusal,
  // no processing. Unset → the feature is used as requested
  // (the PWA privacy settings make the control discoverable).
  const { data: consent } = await service
    .from("archie_privacy_consents")
    .select("granted, revoked_at")
    .eq("user_id", user.id)
    .eq("consent_key", "voice_audio")
    .maybeSingle();
  if (consent && (consent.granted === false || consent.revoked_at !== null)) {
    return {
      ok: false,
      res: earsError(
        403,
        "VOICE_CONSENT_REVOKED",
        "Voice processing is disabled in Privacy settings (voice_audio consent revoked). Re-enable it there to use this feature.",
      ),
    };
  }
  return { ok: true, userId: user.id };
}

serveWithCors(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return earsError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  }

  // ---- Owner gate ----
  const auth = await requireOwner(req);
  if (!auth.ok) return auth.res;
  const userId = auth.userId;

  // ---- Rate limit (abuse protection, per owner) ----
  const rl = checkRateLimit(`ears:${userId}`, {
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    await audit(userId, "archie.ears.rate_limited", "WARNING", {
      reset_at: new Date(rl.resetAt).toISOString(),
    });
    return earsError(
      429,
      "RATE_LIMITED",
      "Too many audio reports — try again shortly.",
    );
  }

  // ---- Parse + validate the native transcript payload ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return earsError(400, "BAD_REQUEST", "Expected a JSON body.");
  }

  const intake = validateEarsIntake(body);
  if (!intake.ok) {
    await audit(userId, "archie.ears.rejected_input", "WARNING", {
      code: intake.code,
    });
    return earsError(
      400,
      intake.code ?? "BAD_REQUEST",
      "ARCHIE's ears could not accept this transcript.",
    );
  }

  // ---- Language hint validated against the LIVE registry ----
  let languageRegistered: boolean | null = null;
  if (intake.languageHint) {
    try {
      const { data: lang } = await service
        .from("frelux_archie_languages")
        .select("code")
        .eq("code", intake.languageHint)
        .limit(1);
      languageRegistered = (lang?.length ?? 0) > 0;
    } catch {
      languageRegistered = null; // registry unreachable — honest null
    }
  }

  // ---- Audit the REAL native transcription ----
  await audit(userId, "archie.ears.transcription", "INFO", {
    engine: "native-web-speech", // on-device recognition, no provider
    speech_detected: intake.speechDetected,
    transcript_chars: intake.transcript?.length ?? 0,
    language_hint: intake.languageHint,
    language_registered: languageRegistered,
    duration_sec: intake.durationSec,
    voice_print: intake.voicePrint
      ? {
          utterance_pitch_hz: intake.voicePrint.utterancePitchHz,
          bank_pitch_hz: intake.voicePrint.bankPitchHz,
          match: intake.voicePrint.match,
          method: "deterministic pitch vs voice-bank profile",
        }
      : null,
  });

  // speechDetected === false is an HONEST result: recognition
  // ran, nothing intelligible was found. We say exactly that —
  // we never invent a transcript.
  return json(200, {
    ok: true,
    audited: true,
    speech_detected: intake.speechDetected,
    language_registered: languageRegistered,
  });
});
