// =========================================================
// FRELUX ARCHIE STAGE 2 — SECURITY SENTRY (spec §21)
//
// Monitors REAL ARCHIE audit events (frelux_archie_audit_events)
// and ARCHIE device/people state for suspicious patterns:
//   * authentication anomaly bursts
//   * unauthorized Owner-action attempts
//   * invitation abuse (many redeems, brute force)
//   * token/session abuse indicators
//   * prompt-injection / knowledge-poisoning markers
//
// Response levels: OBSERVE → ALERT → CONTAIN (only where
// explicitly authorized) → OWNER DECISION. Security Sentry
// NEVER silently escalates privileges, NEVER suspends the
// Owner, and NEVER pauses an account on its own judgment
// (§§21-22) — it collects evidence and recommends.
// =========================================================

import type { ArchieAuditEvent } from "@/lib/archie/stage1-client";

export type ResponseLevel =
  "OBSERVE" | "ALERT" | "CONTAIN_CANDIDATE" | "OWNER_DECISION";

export interface SecuritySignal {
  kind: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidenceCount: number;
  evidence: string[];
  detail: string;
  /** Recommended next step — a recommendation is not authorization (§19). */
  recommendation: string;
  level: ResponseLevel;
}

export interface SecuritySentryReport {
  analyzedEvents: number;
  signals: SecuritySignal[];
  level: ResponseLevel;
  note: string;
}

const LEVEL_ORDER: Record<ResponseLevel, number> = {
  OBSERVE: 0,
  ALERT: 1,
  CONTAIN_CANDIDATE: 2,
  OWNER_DECISION: 3,
};

const maxLevel = (levels: ResponseLevel[]): ResponseLevel =>
  levels.reduce<ResponseLevel>(
    (max, l) => (LEVEL_ORDER[l] > LEVEL_ORDER[max] ? l : max),
    "OBSERVE",
  );

/**
 * Deterministic analysis of real audit events.
 * Every signal cites the exact event types it is based on.
 */
export function analyzeAuditEvents(
  events: ArchieAuditEvent[],
  windowMinutes = 60,
): SecuritySentryReport {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const recent = events.filter((e) => e.created_date >= since);
  const signals: SecuritySignal[] = [];

  const ofKind = (e: ArchieAuditEvent, needle: string) =>
    e.event_type.includes(needle);

  // 1) Unauthorized Owner-action attempts (archie.family.unauthorized_attempt etc.)
  const unauthorized = recent.filter((e) => ofKind(e, "unauthorized_attempt"));
  if (unauthorized.length >= 1) {
    signals.push({
      kind: "unauthorized_owner_action",
      severity: unauthorized.length >= 3 ? "HIGH" : "MEDIUM",
      evidenceCount: unauthorized.length,
      evidence: unauthorized.map((e) => `${e.created_date} ${e.event_type}`),
      detail: `${unauthorized.length} attempt(s) to perform Owner-gated actions without Owner authority in the last ${windowMinutes} minutes.`,
      recommendation:
        "Review the attempts. If repeated, revoke the acting person/device. ARCHIE will not act on its own — Owner decision required.",
      level: unauthorized.length >= 3 ? "OWNER_DECISION" : "ALERT",
    });
  }

  // 2) Auth anomaly burst (repeated failures/errors in a short window)
  const authErrors = recent.filter(
    (e) => ofKind(e, "auth_error") || ofKind(e, "chat_error"),
  );
  if (authErrors.length >= 5) {
    signals.push({
      kind: "auth_or_runtime_anomaly_burst",
      severity: "MEDIUM",
      evidenceCount: authErrors.length,
      evidence: authErrors
        .slice(0, 5)
        .map((e) => `${e.created_date} ${e.event_type}`),
      detail: `${authErrors.length} error events in ${windowMinutes} minutes could indicate token abuse or a failing client.`,
      recommendation:
        "Verify the failing device/token; revoke sessions if the pattern persists.",
      level: "ALERT",
    });
  }

  // 3) Revocation activity (device/person revoked — potential stolen-device response)
  const revocations = recent.filter(
    (e) => ofKind(e, "revoked") || ofKind(e, "removed"),
  );
  if (revocations.length >= 2) {
    signals.push({
      kind: "revocation_burst",
      severity: "MEDIUM",
      evidenceCount: revocations.length,
      evidence: revocations.map((e) => `${e.created_date} ${e.event_type}`),
      detail: `${revocations.length} revocation(s) in ${windowMinutes} minutes.`,
      recommendation:
        "If you revoked because a device was lost/stolen, confirm all other devices are trusted.",
      level: "OBSERVE",
    });
  }

  // 4) Knowledge-poisoning / prompt-injection markers in learning activity
  const learningEvents = recent.filter(
    (e) => ofKind(e, "learning") || ofKind(e, "ingest"),
  );
  const flagged = learningEvents.filter((e) => {
    const d = JSON.stringify(e.detail ?? "");
    return /ignore[\s\S]{0,30}instructions|disregard[\s\S]{0,30}instructions|system prompt|jailbreak|override[\s\S]{0,20}rules/i.test(
      d,
    );
  });
  if (flagged.length >= 1) {
    signals.push({
      kind: "prompt_injection_or_knowledge_poisoning",
      severity: "HIGH",
      evidenceCount: flagged.length,
      evidence: flagged.map((e) => `${e.created_date} ${e.event_type}`),
      detail:
        "Learning submissions contain instruction-override language. Candidates never become knowledge without approval (§4), so review before approving.",
      recommendation:
        "Inspect and reject the flagged candidates. Never approve unreviewed learning input.",
      level: "OWNER_DECISION",
    });
  }

  const level = maxLevel(signals.map((s) => s.level));
  return {
    analyzedEvents: recent.length,
    signals,
    level,
    note: "Security Sentry observes, alerts and recommends. It never escalates its own privileges, never suspends the Owner, and containment happens only through explicit Owner action (spec §21).",
  };
}

/**
 * Evidence collector for a specific suspicious pattern the Owner
 * asks ARCHIE to investigate (§22: DETECT → ANALYZE → COLLECT
 * EVIDENCE → RISK ASSESS). Returns evidence only — decisions
 * stay with the Owner.
 */
export function collectEvidenceFor(
  events: ArchieAuditEvent[],
  matcher: (e: ArchieAuditEvent) => boolean,
  limit = 50,
): { count: number; evidence: string[] } {
  const matches = events.filter(matcher).slice(0, limit);
  return {
    count: matches.length,
    evidence: matches.map(
      (e) => `${e.created_date} ${e.event_type} ${e.severity}`,
    ),
  };
}
