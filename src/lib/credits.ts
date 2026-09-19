/**
 * FRELUX Credits & Rewards, Client-side API
 *
 * All credit operations go through Supabase Edge Functions or RPC functions.
 * The frontend NEVER directly writes to credit_wallets or credit_transactions.
 * All award/deduct operations are server-side with idempotency protection.
 */

import {
  isSupabaseConfigured,
  getSupabase,
  getFunctionErrorMessage,
} from "@/lib/supabase-lazy";

// =========================================================
// Types
// =========================================================

export interface CreditWallet {
  user_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: "earn" | "spend" | "admin_adjust";
  reason: string;
  reference_id: string | null;
  balance_after: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RewardItem {
  id: string;
  reward_key: string;
  name: string;
  description: string;
  credit_cost: number;
  reward_type: "ai_token" | "pdf_export" | "calc_unlock" | "premium_week";
  is_enabled: boolean;
  sort_order: number;
}

export interface RewardRedemption {
  id: string;
  user_id: string;
  reward_key: string;
  credits_spent: number;
  status: "completed" | "failed";
  granted_at: string;
  metadata: Record<string, unknown>;
}

export interface ActivityStreak {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  total_active_days: number;
}

export interface WeeklyMission {
  id: string;
  week_start: string;
  week_end: string;
  mission_config: {
    tasks: MissionTask[];
    reward_credits: number;
  };
  is_active: boolean;
}

export interface MissionTask {
  key: string;
  label: string;
  target: number;
  type: string;
}

export interface MissionProgress {
  id: string;
  task_key: string;
  progress: number;
  completed: boolean;
  updated_at: string;
}

export interface RewardSettings {
  id: number;
  rewards_enabled: boolean;
  weekly_mission_credits: number;
  streak_7_day_credits: number;
  streak_grace_days: number;
}

// =========================================================
// Reward event definitions (client-side tracking for UI feedback)
// =========================================================

export interface RewardEventDef {
  eventType: string;
  amount: number;
  reason: string;
}

export const REWARD_EVENTS = {
  first_calc: {
    eventType: "first_calc",
    amount: 2,
    reason: "Completed first calculator",
  },
  three_different_calcs: {
    eventType: "three_different_calcs",
    amount: 5,
    reason: "Completed 3 different calculators",
  },
  save_estimate: {
    eventType: "save_estimate",
    amount: 3,
    reason: "Saved an estimate",
  },
  return_3_days: {
    eventType: "return_3_days",
    amount: 5,
    reason: "Returned on 3 different days",
  },
  streak_7_day: {
    eventType: "streak_7_day",
    amount: 15,
    reason: "7-day activity streak",
  },
  build_to_roof: {
    eventType: "build_to_roof",
    amount: 10,
    reason: "Completed a Build-to-Roof estimate",
  },
  ai_photo_estimator: {
    eventType: "ai_photo_estimator",
    amount: 5,
    reason: "Successfully used AI Photo Estimator",
  },
  five_estimates: {
    eventType: "five_estimates",
    amount: 15,
    reason: "Completed 5 estimates",
  },
  referral: {
    eventType: "referral",
    amount: 25,
    reason: "Referred a new user to FRELUX",
  },
  // Achievement-linked credit rewards
  ach_builder_10: {
    eventType: "ach_builder_10",
    amount: 25,
    reason: "Achievement: FRELUX Builder (10 estimates)",
  },
  ach_estimator_25: {
    eventType: "ach_estimator_25",
    amount: 50,
    reason: "Achievement: Estimator Pro (25 estimates)",
  },
  ach_master_5: {
    eventType: "ach_master_5",
    amount: 100,
    reason: "Achievement: FRELUX Master (5 categories)",
  },
} as const;

export type RewardEventKey = keyof typeof REWARD_EVENTS;

// =========================================================
// API functions
// =========================================================

/** Get the user's credit wallet */
export async function getCreditWallet(
  userId: string,
): Promise<CreditWallet | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("credit_wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data as CreditWallet | null;
}

/** Get transaction history (paginated) */
export async function getCreditTransactions(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<{ transactions: CreditTransaction[]; hasMore: boolean }> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  if (!isSupabaseConfigured) return { transactions: [], hasMore: false };
  const supabase = await getSupabase();

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return { transactions: [], hasMore: false };
  return {
    transactions: (data ?? []) as CreditTransaction[],
    hasMore: data?.length === limit,
  };
}

/** Get reward catalogue */
export async function getRewardCatalogue(): Promise<RewardItem[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("reward_catalogue")
    .select("*")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as RewardItem[];
}

/** Get reward redemptions */
export async function getRewardRedemptions(
  userId: string,
): Promise<RewardRedemption[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("reward_redemptions")
    .select("*")
    .eq("user_id", userId)
    .order("granted_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as RewardRedemption[];
}

/** Get activity streak */
export async function getActivityStreak(
  userId: string,
): Promise<ActivityStreak | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("activity_streaks")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data as ActivityStreak | null;
}

/** Get current weekly mission */
export async function getCurrentWeeklyMission(): Promise<WeeklyMission | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("weekly_missions")
    .select("*")
    .eq("is_active", true)
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data as WeeklyMission | null;
}

/** Get user mission progress for current mission */
export async function getMissionProgress(
  userId: string,
  missionId: string,
): Promise<MissionProgress[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("user_mission_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("mission_id", missionId);
  if (error) return [];
  return (data ?? []) as MissionProgress[];
}

/** Get reward settings */
export async function getRewardSettings(): Promise<RewardSettings | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("reward_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return data as RewardSettings | null;
}

// =========================================================
// Edge Function calls (server-side operations)
// =========================================================

const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : "";

/** Award credits via edge function (secure, idempotent) */
export async function awardCredits(
  sessionToken: string,
  eventDef: RewardEventDef,
  referenceId: string,
  metadata?: Record<string, unknown>,
): Promise<{
  success: boolean;
  newBalance?: number;
  alreadyAwarded?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured || !EDGE_FUNCTION_URL) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/award-credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        eventType: eventDef.eventType,
        referenceId,
        amount: eventDef.amount,
        reason: eventDef.reason,
        metadata: metadata ?? {},
      }),
    });

    const data = await res.json();
    if (!res.ok)
      return { success: false, error: data.error ?? "Unknown error" };
    return data;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Redeem a reward via edge function (secure, atomic).
 * clientHash is required for reward types (e.g. calc_unlock) that grant
 * access through the ad-based rewarded_unlock_log table, which is keyed
 * by client hash rather than credits balance. */
export async function redeemReward(
  sessionToken: string,
  rewardKey: string,
  idempotencyKey: string,
  clientHash?: string,
): Promise<{
  success: boolean;
  newBalance?: number;
  error?: string;
  reward?: { key: string; name: string; description: string; type: string };
}> {
  if (!isSupabaseConfigured || !EDGE_FUNCTION_URL) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/redeem-reward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        rewardKey,
        idempotencyKey,
        clientHash,
      }),
    });

    const data = await res.json();
    if (!res.ok) return data;
    return data;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/** Count still-unused redeemed grants of a given reward_type for this user
 * (e.g. 'ai_token'). Shows the user their redemption actually did something :
 * these are consumed server-side by the relevant feature's edge function. */
export async function getUnusedRewardGrantCount(
  userId: string,
  rewardType: string,
): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const supabase = await getSupabase();
  const { count, error } = await supabase
    .from("reward_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("reward_type", rewardType)
    .is("consumed_at", null);
  if (error) return 0;
  return count ?? 0;
}

/** Record activity (updates streak + mission progress) */
export async function recordActivity(
  sessionToken: string,
  activityType: string,
  missionTaskType?: string,
  activityData?: Record<string, unknown>,
): Promise<{
  success: boolean;
  streakAwarded?: number;
  missionUpdated?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured || !EDGE_FUNCTION_URL) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const res = await fetch(`${EDGE_FUNCTION_URL}/record-activity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        activityType,
        missionTaskType,
        activityData: activityData ?? {},
      }),
    });

    const data = await res.json();
    if (!res.ok)
      return { success: false, error: data.error ?? "Unknown error" };
    return data;
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// =========================================================
// Admin functions (service role via RPC)
// =========================================================

/** Admin: adjust user credits */
export async function adminAdjustCredits(
  adminId: string,
  targetUserId: string,
  amount: number,
  reason: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!isSupabaseConfigured) return { success: false, error: "Not configured" };
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_adjust_credits", {
    p_admin_id: adminId,
    p_target_user_id: targetUserId,
    p_amount: amount,
    p_reason: reason,
  });
  if (error) return { success: false, error: error.message };
  const result = data?.[0];
  return {
    success: result?.success ?? false,
    newBalance: result?.new_balance,
    error: result?.error,
  };
}

/** Admin: update reward catalogue item */
export async function adminUpdateReward(
  rewardId: string,
  updates: {
    name?: string;
    description?: string;
    credit_cost?: number;
    is_enabled?: boolean;
  },
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("reward_catalogue")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", rewardId);
  return !error;
}

/** Seed the 4 core rewards into the database (admin only, via Edge Function) */
export async function adminSeedRewards(): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  if (!isSupabaseConfigured || !EDGE_FUNCTION_URL)
    return { success: false, error: "Supabase not configured" };
  const supabase = await getSupabase();
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { success: false, error: "Not authenticated" };
    const res = await fetch(`${EDGE_FUNCTION_URL}/seed-rewards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const data = await res.json();
    if (!res.ok)
      return { success: false, error: data.error ?? "Failed to seed rewards" };
    return {
      success: true,
      message: data.message ?? "Rewards seeded successfully",
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function adminGetAllWallets(limit = 50): Promise<CreditWallet[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("credit_wallets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CreditWallet[];
}

/** Admin: get all transactions (for overview) */
export async function adminGetAllTransactions(
  limit = 50,
): Promise<CreditTransaction[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("credit_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CreditTransaction[];
}

/** Admin: update reward settings */
export async function adminUpdateSettings(updates: {
  rewards_enabled?: boolean;
  weekly_mission_credits?: number;
  streak_7_day_credits?: number;
  streak_grace_days?: number;
}): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("reward_settings")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return !error;
}

// =========================================================
// Utility: generate reference IDs
// =========================================================

export function generateReferenceId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Get a date-based reference ID for one-time daily events */
export function getDailyRefId(prefix: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split("T")[0];
  return `${prefix}_${dateStr}`;
}

// =========================================================
// FRELUX Credits, Rewarded Ads & AI Feature Access
// New functions built on top of the existing credit system.
// All operations are server-side verified via edge functions.
// =========================================================

// ───────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────

export interface AiFeatureCost {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  credit_cost: number;
  requires_credits: boolean;
  ad_unlock_enabled: boolean;
  ad_unlock_credits: number;
  daily_usage_limit: number;
  is_enabled: boolean;
  sort_order: number;
}

export interface RewardedAdCreditConfig {
  id: number;
  credits_per_ad: number;
  daily_earn_limit: number;
  cooldown_seconds: number;
  min_interval_seconds: number;
  is_enabled: boolean;
}

export interface RewardedAdCreditEvent {
  id: string;
  user_id: string;
  ad_provider: string;
  ad_event_id: string;
  credits_awarded: number;
  status: "completed" | "failed" | "rejected";
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SpendResult {
  success: boolean;
  error?: string;
  code?: string;
  newBalance?: number;
  cost?: number;
  currentBalance?: number;
  requiredCredits?: number;
  adUnlockEnabled?: boolean;
}

/** Tiered AI credit pricing config */
export const AI_CREDIT_COST = 10;
export const CREDITS_PER_AD = 5;
export const MAX_ADS_PER_DAY = 5;

export interface EarnResult {
  success: boolean;
  error?: string;
  code?: string;
  creditsEarned?: number;
  newBalance?: number;
  message?: string;
}

// ───────────────────────────────────────────────────────
// AI Feature Costs, public read
// ───────────────────────────────────────────────────────

export async function getAiFeatureCosts(): Promise<AiFeatureCost[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("ai_feature_costs")
    .select("*")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as AiFeatureCost[];
}

export async function getAiFeatureCost(
  featureKey: string,
): Promise<AiFeatureCost | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("ai_feature_costs")
    .select("*")
    .eq("feature_key", featureKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as AiFeatureCost;
}

// ───────────────────────────────────────────────────────
// Rewarded Ad Credit Config, public read
// ───────────────────────────────────────────────────────

export async function getRewardedAdConfig(): Promise<RewardedAdCreditConfig | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("rewarded_ad_credit_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as RewardedAdCreditConfig;
}

// ───────────────────────────────────────────────────────
// Rewarded Ad Credit Events, user reads own history
// ───────────────────────────────────────────────────────

export async function getRewardedAdHistory(
  limit = 20,
): Promise<RewardedAdCreditEvent[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("rewarded_ad_credit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as RewardedAdCreditEvent[];
}

// ───────────────────────────────────────────────────────
// AI Feature Usage, user reads own
// ───────────────────────────────────────────────────────

export async function getAiFeatureUsageToday(
  featureKey: string,
): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const supabase = await getSupabase();
  const today = new Date().toISOString().split("T")[0];
  const { count, error } = await supabase
    .from("ai_feature_usage")
    .select("id", { count: "exact", head: true })
    .eq("feature_key", featureKey)
    .gte("created_at", today + "T00:00:00Z");
  if (error) return 0;
  return count ?? 0;
}

// ───────────────────────────────────────────────────────
// Spend Credits for AI Feature, server-side via edge function
// ───────────────────────────────────────────────────────

export async function spendAiCredits(
  featureKey: string,
  idempotencyKey: string,
  metadata?: Record<string, unknown>,
): Promise<SpendResult> {
  if (!isSupabaseConfigured)
    return { success: false, error: "Not configured", code: "CONFIG_ERROR" };
  const supabase = await getSupabase();
  try {
    const { data, error } = await supabase.functions.invoke(
      "spend-ai-credits",
      {
        body: { featureKey, idempotencyKey, metadata },
      },
    );
    if (error)
      return {
        success: false,
        error: await getFunctionErrorMessage(error),
        code: "EDGE_ERROR",
      };
    return data as SpendResult;
  } catch (_e) {
    return {
      success: false,
      error: "Unable to reach credit service",
      code: "NETWORK_ERROR",
    };
  }
}

// ───────────────────────────────────────────────────────
// Verify Rewarded Ad & Earn Credits, server-side via edge function
// ───────────────────────────────────────────────────────

export async function verifyRewardedAd(
  adProvider: string,
  adEventId: string,
  mode: "earn_credits" = "earn_credits",
  metadata?: Record<string, unknown>,
  adToken?: string,
): Promise<EarnResult> {
  if (!isSupabaseConfigured)
    return { success: false, error: "Not configured", code: "CONFIG_ERROR" };
  const supabase = await getSupabase();
  try {
    const { data, error } = await supabase.functions.invoke(
      "verify-rewarded-ad",
      {
        body: { adProvider, adEventId, mode, metadata, adToken },
      },
    );
    if (error)
      return {
        success: false,
        error: await getFunctionErrorMessage(error),
        code: "EDGE_ERROR",
      };
    return data as EarnResult;
  } catch (_e) {
    return {
      success: false,
      error: "Unable to reach ad verification service",
      code: "NETWORK_ERROR",
    };
  }
}

// ───────────────────────────────────────────────────────
// Unlock AI Feature via Ad (no credit spend)
// ───────────────────────────────────────────────────────

export async function unlockFeatureViaAd(
  featureKey: string,
  adProvider: string,
  adEventId: string,
  metadata?: Record<string, unknown>,
  adToken?: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!isSupabaseConfigured) return { success: false, error: "Not configured" };
  const supabase = await getSupabase();
  try {
    const { data, error } = await supabase.functions.invoke(
      "verify-rewarded-ad",
      {
        body: {
          adProvider,
          adEventId,
          mode: "unlock_feature",
          featureKey,
          metadata,
          adToken,
        },
      },
    );
    if (error)
      return { success: false, error: await getFunctionErrorMessage(error) };
    return data as { success: boolean; error?: string; message?: string };
  } catch (_e) {
    return { success: false, error: "Unable to reach unlock service" };
  }
}

// ───────────────────────────────────────────────────────
// Admin: AI Feature Cost management
// ───────────────────────────────────────────────────────

export async function adminGetAllFeatureCosts(): Promise<AiFeatureCost[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("ai_feature_costs")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return [];
  return (data ?? []) as AiFeatureCost[];
}

export async function adminUpdateFeatureCost(
  featureId: string,
  updates: Partial<
    Pick<
      AiFeatureCost,
      | "feature_name"
      | "description"
      | "credit_cost"
      | "requires_credits"
      | "ad_unlock_enabled"
      | "ad_unlock_credits"
      | "daily_usage_limit"
      | "is_enabled"
      | "sort_order"
    >
  >,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("ai_feature_costs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", featureId);
  return !error;
}

export async function adminCreateFeatureCost(
  feature: Omit<AiFeatureCost, "id" | "created_at" | "updated_at">,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = await getSupabase();
  const { error } = await supabase.from("ai_feature_costs").insert(feature);
  return !error;
}

export async function adminUpdateAdConfig(
  updates: Partial<
    Pick<
      RewardedAdCreditConfig,
      | "credits_per_ad"
      | "daily_earn_limit"
      | "cooldown_seconds"
      | "min_interval_seconds"
      | "is_enabled"
    >
  >,
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("rewarded_ad_credit_config")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", 1);
  return !error;
}

export async function adminGetRewardedAdConfig(): Promise<RewardedAdCreditConfig | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("rewarded_ad_credit_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return data as RewardedAdCreditConfig;
}

export async function adminGetAllAdCreditEvents(
  limit = 50,
): Promise<RewardedAdCreditEvent[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("rewarded_ad_credit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as RewardedAdCreditEvent[];
}

export async function adminGetAllAiFeatureUsage(
  limit = 50,
): Promise<
  Array<{
    id: string;
    user_id: string;
    feature_key: string;
    credits_spent: number;
    unlocked_via_ad: boolean;
    created_at: string;
  }>
> {
  if (!isSupabaseConfigured) return [];
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("ai_feature_usage")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as unknown as {
    id: string;
    user_id: string;
    feature_key: string;
    credits_spent: number;
    unlocked_via_ad: boolean;
    created_at: string;
  }[];
}

// ───────────────────────────────────────────────────────
// Admin: enhanced credit adjustment with audit
// ───────────────────────────────────────────────────────

export async function adminAdjustCreditsV2(
  targetUserId: string,
  amount: number,
  reason: string,
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  if (!isSupabaseConfigured) return { success: false, error: "Not configured" };
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  try {
    const { data, error } = await supabase.rpc("admin_adjust_credits_v2", {
      p_admin_id: user.id,
      p_target_user_id: targetUserId,
      p_amount: amount,
      p_reason: reason,
    });
    if (error) return { success: false, error: error.message };
    const row = (data as unknown as Record<string, unknown>[])?.[0];
    if (!row?.success)
      return {
        success: false,
        error: (row?.error as string) ?? "Unknown error",
      };
    return { success: true, newBalance: row.new_balance as number };
  } catch (_e) {
    return { success: false, error: "Failed to adjust credits" };
  }
}
