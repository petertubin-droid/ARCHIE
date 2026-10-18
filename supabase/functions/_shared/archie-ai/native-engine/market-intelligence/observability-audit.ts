// ============================================================================
// ARCHIE MARKET INTELLIGENCE — OBSERVABILITY & AUDIT ENGINE
// supabase/functions/_shared/archie-ai/native-engine/market-intelligence/observability-audit.ts
//
// Component Q / Section 20 & 23:
// Structured audit trails, secret redaction, event logging, and telemetry tracking.
// ============================================================================

import type {
  AuditEventType,
  AuditLogEntry,
  TelemetryMetrics,
} from "./types.ts";

export class SecretRedactor {
  private static readonly SENSITIVE_KEYS = [
    "apikey",
    "api_key",
    "secret",
    "password",
    "token",
    "auth",
    "authorization",
    "bearer",
    "private_key",
    "privatekey",
  ];

  public static redact(payload: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      const lower = key.toLowerCase();
      const isSensitive = this.SENSITIVE_KEYS.some((k) => lower.includes(k));

      if (isSensitive) {
        clean[key] = "[REDACTED_SECRET]";
      } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        clean[key] = this.redact(value as Record<string, unknown>);
      } else if (typeof value === "string" && (value.startsWith("ghp_") || value.startsWith("sbp_") || value.startsWith("sk-"))) {
        clean[key] = "[REDACTED_TOKEN]";
      } else {
        clean[key] = value;
      }
    }

    return clean;
  }
}

export class MarketAuditLogger {
  private logs: AuditLogEntry[] = [];
  private telemetry: TelemetryMetrics[] = [];
  private maxLogs = 5000;

  public logEvent(
    eventType: AuditEventType,
    actor: string,
    payload: Record<string, unknown>,
    severity: "INFO" | "WARNING" | "CRITICAL" = "INFO",
  ): AuditLogEntry {
    const sanitized = SecretRedactor.redact(payload);
    const entry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      timestamp: Date.now(),
      eventType,
      actor,
      severity,
      payloadSanitized: sanitized,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    return entry;
  }

  public recordTelemetry(stage: string, latencyMs: number, throughput?: number): void {
    this.telemetry.push({
      stage,
      latencyMs,
      throughputCandlesPerSec: throughput,
      timestamp: Date.now(),
    });
    if (this.telemetry.length > 2000) {
      this.telemetry.shift();
    }
  }

  public getRecentLogs(limit = 100, eventType?: AuditEventType): AuditLogEntry[] {
    const filtered = eventType ? this.logs.filter((l) => l.eventType === eventType) : this.logs;
    return filtered.slice(-limit);
  }

  public getStageAverages(): Record<string, { avgLatencyMs: number; count: number }> {
    const map: Record<string, { sum: number; count: number }> = {};
    for (const t of this.telemetry) {
      if (!map[t.stage]) map[t.stage] = { sum: 0, count: 0 };
      map[t.stage].sum += t.latencyMs;
      map[t.stage].count++;
    }

    const res: Record<string, { avgLatencyMs: number; count: number }> = {};
    for (const [stage, data] of Object.entries(map)) {
      res[stage] = {
        avgLatencyMs: Math.round((data.sum / data.count) * 10) / 10,
        count: data.count,
      };
    }
    return res;
  }
}

export const globalMarketAudit = new MarketAuditLogger();
