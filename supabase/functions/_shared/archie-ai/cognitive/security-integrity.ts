// =========================================================
// ARCHIE COGNITIVE ENGINE — SECURITY & INTEGRITY ENGINE
// supabase/functions/_shared/archie-ai/cognitive/security-integrity.ts
//
// Protects ARCHIE's identity, memory, source code, data,
// credentials, infrastructure, permissions, trusted devices
// and audit history:
//   * append-only, hash-chained audit log (tamper-evident)
//   * secret/credential redaction on every ingest and store
//   * audit chain integrity verification
//   * core-identity protection hooks (used by the kernel)
// Real production security — no simulated checks.
// =========================================================

import { table } from "../tables.ts";
import { sha256 } from "./sha256.ts";
import type { SupabaseLike } from "../native-engine/persistence.ts";
import { CognitivePersistence } from "./persistence.ts";
import type { AuditEvent } from "./types.ts";

/** Patterns that indicate a credential in free text. Found
 *  secrets are REDACTED before any storage or processing. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{16,}\b/g, // OpenAI-style key
  /\bsk-ant-[a-zA-Z0-9-]{16,}\b/g, // Anthropic-style key
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(?:api[_-]?key|secret|password|token|credential)\s*[:=]\s*["']?[^\s"']{8,}/gi,
  /\bghp_[A-Za-z0-9]{30,}\b/g, // GitHub PAT
  /\bpk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, // Stripe key
  /\bsupabase[_-]?(?:service[_-]?role|anon)[_-]?key\s*[:=]\s*["']?[^\s"']{20,}/gi,
];

export function redactSecrets(text: string): {
  redacted: string;
  foundCount: number;
} {
  let foundCount = 0;
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (m) => {
      foundCount += 1;
      return `[redacted-credential:${m.slice(0, 6)}…]`;
    });
  }
  return { redacted, foundCount };
}

function hashEvent(input: string): string {
  return sha256(input);
}

export const GENESIS_HASH = "0".repeat(64);

export class SecurityIntegrityEngine {
  private chain: AuditEvent[] = [];
  /** Tampered/damaged chain preserved for diagnostics —
   *  never re-appended to, never silently discarded. */
  private quarantinedChain: AuditEvent[] = [];
  private persistence: CognitivePersistence;
  private dbRef: SupabaseLike | null;
  private seqCounter = 0;
  private lastHash = GENESIS_HASH;
  private hydrated = false;
  private persistenceHealthy = true;

  constructor(db?: SupabaseLike, chainId?: string) {
    this.persistence = new CognitivePersistence(db, chainId);
    this.dbRef = db ?? null;
  }

  /** FIX 23: this instance's chain id (for diagnostics). */
  chainId(): string {
    return this.persistence.chainId;
  }

  /** Load the persisted chain and verify its integrity. */
  async hydrate(): Promise<{
    events: number;
    chainValid: boolean;
  }> {
    if (this.hydrated) {
      return { events: this.chain.length, chainValid: true };
    }
    this.hydrated = true;
    const stored = await this.persistence.loadAudit();
    if (stored.length > 0) {
      // FIX 23 (remediation batch 8, Level 5 execution audit
      // 2026-09-13): the log is partitioned into independent
      // per-instance chains (chain_id). Previously ALL rows
      // were verified as ONE sequence — two concurrent
      // isolates each chaining from genesis interleaved
      // rows, the verify failed, and a FALSE
      // "audit_chain_compromised" critical fired. Each chain
      // is now verified independently; only a genuine break
      // inside a chain compromises.
      const groups = new Map<string, AuditEvent[]>();
      for (const ev of stored) {
        const key = ev.chainId ?? "legacy";
        const list = groups.get(key) ?? [];
        list.push(ev);
        groups.set(key, list);
      }
      const broken: AuditEvent[] = [];
      for (const [chainKey, group] of groups) {
        const ok = this.verifyChain(group);
        if (!ok) broken.push(...group);
        if (chainKey === this.persistence.chainId) {
          // Our own previous instance chain (same id is only
          // possible on an unclean restart): continue it.
          this.chain = group;
          this.seqCounter = group[group.length - 1].seq;
          this.lastHash = group[group.length - 1].hash;
        }
      }
      if (broken.length > 0) {
        // TAMPER RESPONSE (audit fix K-1): broken chains are
        // quarantined for diagnostics, an owner-visible
        // security event is recorded, and new events continue
        // from a fresh genesis. Never silently discarded.
        this.quarantinedChain = broken;
        await this.recordChainCompromise(broken.length);
      }
      return { events: stored.length, chainValid: broken.length === 0 };
    }
    return { events: 0, chainValid: true };
  }

  /** Append a tamper-evident audit event. */
  async audit(
    eventType: AuditEvent["eventType"],
    payload: Record<string, unknown>,
  ): Promise<AuditEvent> {
    // Never allow a credential into the audit log itself.
    const safePayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      safePayload[k] = typeof v === "string" ? redactSecrets(v).redacted : v;
    }
    this.seqCounter += 1;
    const at = new Date().toISOString();
    const prevHash = this.lastHash;
    const hash = hashEvent(
      `${this.seqCounter}|${eventType}|${JSON.stringify(safePayload)}|${at}|${prevHash}`,
    );
    const event: AuditEvent = {
      seq: this.seqCounter,
      eventType,
      payload: safePayload,
      at,
      prevHash,
      hash,
    };
    this.chain.push(event);
    this.lastHash = hash;
    this.persistenceHealthy = await this.persistence.appendAudit(event);
    return event;
  }

  /** Verify the full hash chain of the given events. */
  verifyChain(events: AuditEvent[]): boolean {
    let prev = GENESIS_HASH;
    for (const e of events) {
      if (e.prevHash !== prev) return false;
      const recomputed = hashEvent(
        `${e.seq}|${e.eventType}|${JSON.stringify(e.payload)}|${e.at}|${e.prevHash}`,
      );
      if (recomputed !== e.hash) return false;
      prev = e.hash;
    }
    return true;
  }

  /** The quarantined (tampered/damaged) chain, if hydrate
   *  found one — for owner diagnostics. Read-only. */
  quarantined(): AuditEvent[] {
    return [...this.quarantinedChain];
  }

  /** Persist an owner-visible compromise event. Best effort:
   *  recording must never break the boot path. */
  private async recordChainCompromise(events: number): Promise<void> {
    if (!this.dbRef) return;
    try {
      await this.dbRef.from(table("security_events")).insert({
        // FIX 26: the column is `kind`, not `event_type`, and
        // user_id is now nullable for SYSTEM events — both
        // defects made this critical event impossible to
        // record (silently). A chain compromise is the one
        // event this engine exists to raise.
        user_id: null,
        kind: "audit_chain_compromised",
        severity: "critical",
        message:
          `ARCHIE audit chain failed integrity verification on hydrate: ` +
          `${events} event(s) quarantined, new events continue from genesis. ` +
          `Inspect the quarantined chain via ARCHIE diagnostics.`,
      });
    } catch {
      /* recording is best-effort; the chainValid:false flag
       * already surfaces the compromise in diagnostics. */
    }
  }

  /** Current integrity state — surfaced in diagnostics. */
  integrity(): {
    events: number;
    chainValid: boolean;
    persistenceHealthy: boolean;
    /** Quarantined events from a compromised hydrate. */
    quarantinedEvents: number;
  } {
    return {
      events: this.chain.length,
      chainValid: this.verifyChain(this.chain),
      persistenceHealthy: this.persistenceHealthy,
      quarantinedEvents: this.quarantinedChain.length,
    };
  }

  /** Core identity protection: ARCHIE's permanent core
   *  principles are immutable. Any write path that would
   *  touch them is flagged as owner-gated and refused. */
  guardCoreIdentity(target: string): {
    allowed: boolean;
    reason: string;
  } {
    const protectedTargets = [
      table("archie_core_principles"),
      "archie-identity",
      "core-principles",
    ];
    const hit = protectedTargets.find((p) => target.toLowerCase().includes(p));
    if (hit) {
      return {
        allowed: false,
        reason: `"${hit}" is a permanent core-identity store — changes require explicit Owner Authority and cannot be executed autonomously`,
      };
    }
    return { allowed: true, reason: "" };
  }
}
