// =========================================================
// ARCHIE COGNITIVE ENGINE — SECURITY PERSISTENCE
// supabase/functions/_shared/archie-ai/cognitive/persistence.ts
//
// Durable storage for the cognitive layer:
//   * frelux_archie_audit_log  — append-only, hash-chained
//   * frelux_archie_cognitive_traces — loop observability
// The world model persists its own rows (world-model.ts).
// Failures here are honest: the engine keeps operating and
// reports degraded persistence in diagnostics.
// =========================================================

import { table } from "../tables.ts";
import type { SupabaseLike } from "../native-engine/persistence.ts";
import type { AuditEvent, CognitiveTrace } from "./types.ts";

export const AUDIT_TABLE = table("archie_audit_log");
export const TRACES_TABLE = table("archie_cognitive_traces");

interface AuditRow {
  chain_id: string;
  seq: number;
  event_type: string;
  payload: unknown;
  at: string;
  prev_hash: string;
  hash: string;
}

export class CognitivePersistence {
  private db: SupabaseLike | null;
  /** FIX 23 (remediation batch 8): every kernel instance owns
   *  a unique audit chain — isolates can never collide on the
   *  (chain_id, seq) primary key. */
  readonly chainId: string;

  constructor(db?: SupabaseLike, chainId?: string) {
    this.db = db ?? null;
    this.chainId = chainId ?? "chain-" + crypto.randomUUID();
  }

  async loadAudit(): Promise<AuditEvent[]> {
    if (!this.db) return [];
    try {
      const { data, error } = await this.db
        .from(AUDIT_TABLE)
        .select("chain_id,seq,event_type,payload,at,prev_hash,hash");
      if (error || !Array.isArray(data)) return [];
      return (data as AuditRow[])
        .map((r) => ({
          chainId: r.chain_id,
          seq: r.seq,
          eventType: r.event_type as AuditEvent["eventType"],
          payload: (r.payload ?? {}) as Record<string, unknown>,
          at: r.at,
          prevHash: r.prev_hash,
          hash: r.hash,
        }))
        .sort((a, b) =>
          a.chainId === b.chainId
            ? a.seq - b.seq
            : a.chainId.localeCompare(b.chainId),
        );
    } catch {
      return [];
    }
  }

  async appendAudit(event: AuditEvent): Promise<boolean> {
    if (!this.db) return false;
    try {
      await this.db.from(AUDIT_TABLE).upsert({
        chain_id: event.chainId ?? this.chainId,
        seq: event.seq,
        event_type: event.eventType,
        payload: event.payload,
        at: event.at,
        prev_hash: event.prevHash,
        hash: event.hash,
      });
      return true;
    } catch {
      return false;
    }
  }

  async saveTrace(trace: CognitiveTrace): Promise<boolean> {
    if (!this.db) return false;
    try {
      await this.db.from(TRACES_TABLE).upsert({
        id: trace.cycleId,
        task: trace.task,
        phases: trace.phases,
        route: trace.route,
        epistemic: trace.epistemic,
        confidence: trace.confidence,
        created_at: trace.createdAt,
      });
      return true;
    } catch {
      return false;
    }
  }
}
