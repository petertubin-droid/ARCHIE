// AI feature access control.
//
// Identity model:
// - Anonymous user: identified by a random UUID stored in localStorage
//   (client_hash). Usage is tracked by client_hash + date.
// - Authenticated user: identified by their Supabase Auth user ID.
//   Usage is tracked by user_id + date.
//
// SECURITY: The client can only READ usage. It can no longer write usage
// records (INSERT/UPDATE removed via RLS). Usage consumption happens
// exclusively server-side in the edge function after a successful AI
// generation. This prevents users from manipulating their own usage
// count from the browser.
//
// Usage flow:
// 1. fetchAiAccessConfig(), get the configured access mode + daily limit
// 2. getAiUsageStatus(), check remaining uses for today (read-only)
// 3. The edge function consumes usage server-side on success only

import { supabase } from '@/lib/supabase';
import type { AiAccessMode } from '@/types/database';

const CLIENT_ID_KEY = 'frelux_ai_client_id';

export interface AiAccessConfig {
  aiEnabled: boolean;
  accessMode: AiAccessMode;
  dailyFreeUses: number;
  rewardedEnabled: boolean;
  paidEnabled: boolean;
  paidPrice: number;
  paidCurrency: string;
  resetPeriod: string;
  adminOverride: boolean;
}

export interface AiUsageStatus {
  usedToday: number;
  remaining: number;
  limit: number;
  resetPeriod: string;
  hasRemaining: boolean;
  /** true if usage is tracked by user_id, false if by anonymous client_hash */
  isAuthenticated: boolean;
}

export type AiAccessDecision =
  | { allowed: true; reason: 'free' | 'rewarded' | 'paid' | 'admin_override' }
  | { allowed: false; reason: 'disabled' | 'limit_reached' | 'not_configured'; nextAction?: 'rewarded' | 'paid' | 'login' | 'none' };

export function getClientId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function fetchAiAccessConfig(): Promise<AiAccessConfig | null> {
  const { data, error } = await supabase
    .from('site_settings')
    .select('ai_enabled, ai_access_mode, ai_daily_free_uses, ai_rewarded_enabled, ai_paid_enabled, ai_paid_price, ai_paid_currency, ai_reset_period, ai_admin_override')
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    aiEnabled: data.ai_enabled ?? true,
    accessMode: data.ai_access_mode ?? 'free',
    dailyFreeUses: data.ai_daily_free_uses ?? 0,
    rewardedEnabled: data.ai_rewarded_enabled ?? false,
    paidEnabled: data.ai_paid_enabled ?? false,
    paidPrice: Number(data.ai_paid_price) || 0,
    paidCurrency: data.ai_paid_currency ?? 'NGN',
    resetPeriod: data.ai_reset_period ?? 'daily',
    adminOverride: data.ai_admin_override ?? true,
  };
}

// Read-only usage status. For authenticated users, looks up by user_id.
// For anonymous users, looks up by client_hash.
export async function getAiUsageStatus(config: AiAccessConfig, userId?: string | null): Promise<AiUsageStatus> {
  const today = todayStr();
  const isAuthenticated = !!userId;

  let query;
  if (isAuthenticated) {
    query = supabase
      .from('ai_usage_daily')
      .select('uses_consumed')
      .eq('user_id', userId!)
      .eq('usage_date', today)
      .maybeSingle();
  } else {
    const clientId = getClientId();
    query = supabase
      .from('ai_usage_daily')
      .select('uses_consumed')
      .eq('client_hash', clientId)
      .eq('usage_date', today)
      .maybeSingle();
  }

  const { data } = await query;
  const usedToday = data?.uses_consumed ?? 0;
  const remaining = Math.max(0, config.dailyFreeUses - usedToday);

  return {
    usedToday,
    remaining,
    limit: config.dailyFreeUses,
    resetPeriod: config.resetPeriod,
    hasRemaining: remaining > 0,
    isAuthenticated,
  };
}

// Check whether the user can make an AI request right now.
export function checkAiAccess(config: AiAccessConfig, usage: AiUsageStatus, isAdmin = false): AiAccessDecision {
  if (!config.aiEnabled) return { allowed: false, reason: 'disabled' };
  if (config.accessMode === 'disabled') return { allowed: false, reason: 'disabled' };

  if (isAdmin && config.adminOverride) return { allowed: true, reason: 'admin_override' };

  if (config.accessMode === 'free') {
    return usage.hasRemaining ? { allowed: true, reason: 'free' } : { allowed: false, reason: 'limit_reached', nextAction: 'none' };
  }

  if (config.accessMode === 'rewarded') {
    if (usage.hasRemaining) return { allowed: true, reason: 'free' };
    return config.rewardedEnabled
      ? { allowed: false, reason: 'limit_reached', nextAction: 'rewarded' }
      : { allowed: false, reason: 'limit_reached', nextAction: 'none' };
  }

  if (config.accessMode === 'paid') {
    return config.paidEnabled
      ? { allowed: false, reason: 'limit_reached', nextAction: 'paid' }
      : { allowed: false, reason: 'not_configured', nextAction: 'none' };
  }

  if (config.accessMode === 'free_rewarded') {
    if (usage.hasRemaining) return { allowed: true, reason: 'free' };
    return config.rewardedEnabled
      ? { allowed: false, reason: 'limit_reached', nextAction: 'rewarded' }
      : { allowed: false, reason: 'limit_reached', nextAction: 'none' };
  }

  return { allowed: false, reason: 'disabled' };
}

// Rewarded access: the server must verify the reward before granting access.
// This is a placeholder architecture, when a real rewarded ad provider is
// configured, the verification call goes here. For now, it always returns
// false because no provider is configured.
export async function requestRewardedAccess(): Promise<{ granted: boolean; reason: string }> {
  return { granted: false, reason: 'No rewarded access provider is currently configured.' };
}
