// =========================================================
// ARCHIE TRADING CLIENT (batch 20, fix 66, 2026-09-15)
//
// Browser-facing calls for the owner-only trading console
// (edge function: archie-trading). All authorization is
// verified server-side (JWT -> admin profile). The client
// sends intent; the server enforces the trade-gate and the
// venue boot contract. No trading math, gate evaluation or
// credential handling ever happens client-side.
//
// Contracts mirror supabase/functions/archie-trading/index.ts
// and the native-engine crypto modules (source of truth).
// =========================================================

import { supabase } from "@/lib/supabase";

export interface TradingVenueStatus {
  configured: boolean;
  venue: string | null;
  mode: string | null;
  reason: string | null;
}

export interface TradingCredentialFlags {
  api_key_provisioned: boolean;
  api_secret_provisioned: boolean;
  mode: string;
  mainnet_authorized_by_secret: boolean;
}

export interface TradingStateStatus {
  emergency_stop: boolean;
  trading_enabled: boolean;
  limits: Record<string, number | boolean>;
}

export interface TradingPortfolioSummary {
  total_positions: number;
  open_positions: number;
  closed_positions: number;
  stats: Record<string, number | null>;
  exposure: Record<string, unknown>;
}

export interface TradingStatus {
  venue: TradingVenueStatus;
  credentials: TradingCredentialFlags;
  state: TradingStateStatus;
  portfolio: TradingPortfolioSummary;
}

export interface GateCheckView {
  id: string;
  passed: boolean;
  detail: string;
}

export interface GateDecisionView {
  eligible: boolean;
  checks: GateCheckView[];
  decidedAt: string;
}

export interface DryRunResult {
  dry_run: true;
  eligible: boolean;
  decision: GateDecisionView;
  report: string;
  note: string;
}

export interface ExecuteResult {
  executed: boolean;
  reason: string | null;
  position: Record<string, unknown> | null;
  events: Array<{ atMs: number; id: string; detail: string }>;
  venue_mode?: string;
  report?: string;
  decision?: GateDecisionView;
  warning?: string;
  position_id?: string;
}

export interface TradingPositionView {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  positionSizeQuote: number;
  portfolioValueQuote: number;
  openedAtMs: number;
  state: "OPEN" | "CLOSED";
  status: string;
  exitPrice: number | null;
  closedAtMs: number | null;
  realizedPnlQuote: number | null;
  realizedPnlPct: number | null;
  feesPaidQuote: number;
}

export interface PositionsResult {
  positions: TradingPositionView[];
  stats: Record<string, number | null>;
  exposure: Record<string, unknown>;
}

/** Typed invocation helper for the archie-trading function. */
export async function invokeTrading<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("archie-trading", {
    body,
  });
  if (error) {
    // FIX 63 pattern: surface the real edge-function error
    // context, never a generic non-2xx message.
    const ctx = (error as { context?: { message?: string } }).context;
    const detail = ctx?.message ?? error.message;
    throw new Error(`archie-trading: ${detail}`);
  }
  return data as T;
}

export async function fetchTradingStatus(): Promise<TradingStatus> {
  return invokeTrading<TradingStatus>({ action: "status" });
}

export async function setTradingState(patch: {
  emergency_stop?: boolean;
  trading_enabled?: boolean;
}): Promise<{ ok: true; state: TradingStateStatus }> {
  return invokeTrading<{ ok: true; state: TradingStateStatus }>({
    action: "set_state",
    ...patch,
  });
}

export async function dryRunTrade(input: {
  request: Record<string, unknown>;
  evidence: Record<string, unknown>;
}): Promise<DryRunResult> {
  return invokeTrading<DryRunResult>({
    action: "dry_run",
    ...input,
  });
}

export async function executeTrade(input: {
  request: Record<string, unknown>;
  evidence: Record<string, unknown>;
  mainnet_execution_authorized?: boolean;
}): Promise<ExecuteResult> {
  return invokeTrading<ExecuteResult>({
    action: "execute",
    ...input,
  });
}

export async function emergencyCancel(symbols: string[]): Promise<{
  ok: true;
  emergency_stop_engaged: boolean;
  events: Array<{ atMs: number; id: string; detail: string }>;
  venue_mode: string;
}> {
  return invokeTrading<{
    ok: true;
    emergency_stop_engaged: boolean;
    events: Array<{ atMs: number; id: string; detail: string }>;
    venue_mode: string;
  }>({
    action: "emergency_cancel",
    symbols,
  });
}

export async function fetchTradingPositions(): Promise<PositionsResult> {
  return invokeTrading<PositionsResult>({ action: "positions" });
}
