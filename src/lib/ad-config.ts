import { getSupabase } from "@/lib/supabase-lazy";
import type { DbAdProvider, DbAdPlacement } from "@/types/database";

// Module-level cache for ad config
let providersCache: DbAdProvider[] | null = null;
let placementsCache: DbAdPlacement[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60_000; // 1 minute

interface AdConfigResult {
  providers: DbAdProvider[];
  placements: DbAdPlacement[];
}

/**
 * Fetch all active ad providers and placements, cached for 1 minute.
 */
export async function fetchAdConfig(force = false): Promise<AdConfigResult> {
  const now = Date.now();
  if (!force && providersCache && placementsCache && now < cacheExpiry) {
    return { providers: providersCache, placements: placementsCache };
  }

  const supabase = await getSupabase();
  const [provRes, placeRes] = await Promise.all([
    supabase
      .from("ad_providers_public")
      .select("*")
      .eq("is_active", true)
      .order("priority"),
    supabase.from("ad_placements").select("*").eq("is_active", true),
  ]);

  providersCache = (provRes.data as DbAdProvider[]) ?? [];
  placementsCache = (placeRes.data as DbAdPlacement[]) ?? [];
  cacheExpiry = now + CACHE_TTL;

  return { providers: providersCache, placements: placementsCache };
}

/**
 * Get the fallback chain of providers for a placement key.
 * Returns providers in priority order. If placement has explicit provider_ids,
 * those are used in order; otherwise all active providers of matching type are used.
 */
export function getProvidersForPlacement(
  placementKey: string,
  providers: DbAdProvider[],
  placements: DbAdPlacement[],
): DbAdProvider[] {
  const placement = placements.find((p) => p.placement_key === placementKey);
  if (!placement) return [];

  if (placement.provider_ids.length > 0) {
    const ordered: DbAdProvider[] = [];
    for (const pid of placement.provider_ids) {
      const prov = providers.find((p) => p.id === pid);
      if (prov) ordered.push(prov);
    }
    return ordered;
  }

  // No explicit provider list, use all active providers sorted by priority
  return providers;
}

/**
 * Get a specific placement by key.
 */
export function getPlacement(
  placementKey: string,
  placements: DbAdPlacement[],
): DbAdPlacement | null {
  return placements.find((p) => p.placement_key === placementKey) ?? null;
}

/**
 * Check if a placement should display on the current device.
 */
export function shouldDisplayPlacement(placement: DbAdPlacement): boolean {
  const isMobile = window.innerWidth < 768;
  const rules = placement.display_rules;
  if (isMobile && !rules.mobile) return false;
  if (!isMobile && !rules.desktop) return false;
  return true;
}

/**
 * Log an ad analytics event.
 */
export async function logAdEvent(event: {
  event_type: string;
  provider_id?: string | null;
  placement_key?: string | null;
  tool_key?: string | null;
  user_id?: string | null;
  client_hash?: string | null;
  revenue_estimated?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      event_type: event.event_type,
      provider_id: event.provider_id ?? null,
      placement_key: event.placement_key ?? null,
      tool_key: event.tool_key ?? null,
      user_id: event.user_id ?? null,
      client_hash: event.client_hash ?? null,
      revenue_estimated: event.revenue_estimated ?? 0,
      metadata: event.metadata ?? {},
    };
    const sb = await getSupabase();
    await sb.from("ad_analytics_events").insert(payload);
  } catch {
    // Silently fail, analytics logging should never break the user experience
  }
}

/**
 * Get the ad unit ID for a specific provider on a placement.
 */
export function getAdUnitId(
  placement: DbAdPlacement,
  providerId: string,
): string | null {
  return placement.ad_unit_ids[providerId] ?? null;
}

/**
 * Check if at least one active rewarded ad provider is configured.
 * Used to gate the "Watch Ad" UI, if no real provider exists, we show
 * "Coming soon" instead of letting users click a button that can't work.
 */
export async function hasRewardedAdProvider(): Promise<boolean> {
  try {
    const { providers } = await fetchAdConfig();
    // Multi-provider (owner directive 2026-09-15): an active provider
    // only counts when we can actually serve a rewarded experience —
    // a real client-side bridge OR an offerwall. Previously a provider
    // that was merely typed "rewarded"/"mixed" with no implementation
    // flipped this to true and users hit a dead "Watch Ad" button.
    const { getRewardedAdCandidates } = await import("@/lib/rewarded-bridges");
    return getRewardedAdCandidates(providers).length > 0;
  } catch {
    return false;
  }
}

/**
 * Clear the ad config cache. Call after admin changes.
 */
export function clearAdConfigCache(): void {
  providersCache = null;
  placementsCache = null;
  cacheExpiry = 0;
}
