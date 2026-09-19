// =========================================================
// FRELUX PHASE 7, DEVELOPER PORTAL CLIENT (in-app)
//
// Key management for the Developer Portal and the admin API
// keys page. Uses the SAME §3 key contract as the gateway:
// crypto-random 32-char FLX- keys, SHA-256 hash stored, raw key
// returned to the caller exactly once.
//
// All queries go through the user-scoped Supabase client and
// are protected by RLS:
//   frelux_api_keys  , owner_all + admin policies
//   frelux_api_usage , owner_read + admin_read
//   frelux_api_plans , authenticated read + admin manage
//
// key_hash is NEVER selected for display anywhere.
// =========================================================

import { supabase } from "@/lib/supabase";
import {
  generateFreluxApiKey,
  hashApiKey,
  apiKeyDisplayPrefix,
} from "@/lib/frelix-api/key-format";

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  permissions: string[];
  plan_key: string;
  rate_limit_per_minute: number;
  daily_quota: number;
  monthly_quota: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKeyPlan {
  key: string;
  name: string;
  config: Record<string, unknown> | null;
  active: boolean;
  sort_order: number;
}

export interface UsageSummary {
  today: number;
  thisMonth: number;
  perKeyThisMonth: Record<string, number>;
  recentStatusCodes: Record<string, number>;
}

export interface CreatedKey {
  row: ApiKeyRow;
  /** Shown exactly once, never stored raw, never retrievable again. */
  rawKey: string;
}

const KEY_COLUMNS =
  "id,name,key_prefix,status,permissions,plan_key,rate_limit_per_minute,daily_quota,monthly_quota,expires_at,last_used_at,created_at,updated_at";

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase
    .from("frelux_api_keys")
    .select(KEY_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...r,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
  }));
}

export async function createApiKey(
  name: string,
  plan_key = "free",
  permissions: string[] = ["*"],
): Promise<CreatedKey> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new Error("Key name must be 1–100 characters.");
  }
  const rawKey = generateFreluxApiKey(); // §3 contract, same as the gateway
  const keyHash = await hashApiKey(rawKey); // WebCrypto, raw key never stored
  const { data, error } = await supabase
    .from("frelux_api_keys")
    .insert({
      name: trimmed,
      key_prefix: apiKeyDisplayPrefix(rawKey),
      key_hash: keyHash,
      permissions,
      plan_key,
    })
    .select(KEY_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Key creation failed.");
  return {
    row: {
      ...data,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    },
    rawKey,
  };
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from("frelux_api_keys")
    .update({ status: "revoked" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restoreApiKey(id: string): Promise<void> {
  const { error } = await supabase
    .from("frelux_api_keys")
    .update({ status: "active" })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function rotateApiKey(id: string): Promise<CreatedKey> {
  const rawKey = generateFreluxApiKey();
  const keyHash = await hashApiKey(rawKey);
  const { data, error } = await supabase
    .from("frelux_api_keys")
    .update({
      key_hash: keyHash,
      key_prefix: apiKeyDisplayPrefix(rawKey),
      status: "active",
    })
    .eq("id", id)
    .select(KEY_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Rotation failed.");
  return {
    row: {
      ...data,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    },
    rawKey,
  };
}

export async function updateApiKeyLimits(
  id: string,
  patch: Partial<
    Pick<
      ApiKeyRow,
      | "name"
      | "plan_key"
      | "rate_limit_per_minute"
      | "daily_quota"
      | "monthly_quota"
      | "expires_at"
      | "permissions"
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from("frelux_api_keys")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const monthStart = new Date();
  monthStart.setUTCHours(0, 0, 0, 0);
  monthStart.setUTCDate(1);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("frelux_api_usage")
    .select("api_key_id,status_code,created_at")
    .gte("created_at", monthStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const perKeyThisMonth: Record<string, number> = {};
  const recentStatusCodes: Record<string, number> = {};
  let today = 0;
  for (const row of data ?? []) {
    perKeyThisMonth[row.api_key_id] =
      (perKeyThisMonth[row.api_key_id] ?? 0) + 1;
    recentStatusCodes[String(row.status_code)] =
      (recentStatusCodes[String(row.status_code)] ?? 0) + 1;
    if (new Date(row.created_at) >= dayStart) today += 1;
  }
  return {
    today,
    thisMonth: data?.length ?? 0,
    perKeyThisMonth,
    recentStatusCodes,
  };
}

export async function getPlans(): Promise<ApiKeyPlan[]> {
  const { data, error } = await supabase
    .from("frelux_api_plans")
    .select("key,name,config,active,sort_order")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// =========================================================
// Phase 7 §17, API plan purchase
//
// The plan price is ALWAYS resolved server-side from
// frelux_api_plans by the paystack-checkout edge function; the
// client cannot influence it. The entitlement itself is granted
// ONLY by the signed payment webhook (reference-idempotent) :
// this call merely starts a payment session.
// =========================================================
export async function initializeApiPlanCheckout(
  planKey: string,
): Promise<{ authorization_url: string } | { error: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) {
    return { error: "Sign in to purchase an API plan." };
  }

  const { data, error: fnError } = await supabase.functions.invoke(
    "paystack-checkout",
    {
      body: {
        purpose: "api_plan",
        plan: planKey,
        user_id: session.user.id,
        email: session.user.email,
        callback_url: `${window.location.origin}/developers?plan_purchase=verify&plan=${planKey}`,
      },
    },
  );

  if (fnError) {
    return { error: fnError.message || "Could not start checkout." };
  }
  if (!data?.data?.authorization_url) {
    return {
      error:
        (data as { error?: string })?.error ??
        "Checkout is unavailable for this plan.",
    };
  }
  return { authorization_url: data.data.authorization_url };
}
