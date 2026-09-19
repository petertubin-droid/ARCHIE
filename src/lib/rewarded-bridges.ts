import type { DbAdProvider } from "@/types/database";
import {
  getMonetagZone,
  getMonetagSdkUrl,
  showMonetagRewardedAd,
} from "@/lib/monetag-rewarded";
import { showAdsenseRewardedAd } from "@/lib/adsense-rewarded";
import { supportsOfferwall } from "@/lib/offerwall";

/**
 * Rewarded ad bridges, one entry per provider with a working client-side
 * rewarded implementation. A bridge shows the real ad and reports how it
 * completed; the unlock is then granted server-side with a client
 * attestation token (att_<slug>_<mode>_<timestamp>) that the edge
 * function validates against the active providers in the database.
 *
 * To support a new provider (of the 35+ in ad_providers, or a future one):
 * 1. Implement its rewarded flow (see src/lib/monetag-rewarded.ts).
 * 2. Register it here. No edge-function or database change is needed.
 * Providers without a bridge honestly fail, the unlock is never
 * granted without a real ad being shown.
 */
export interface RewardedAdBridgeResult {
  mode: string;
  valued: boolean | null;
  estimatedPrice: number | null;
}

export type RewardedAdBridge = (
  provider: DbAdProvider,
  opts: { ymid: string; toolKey: string },
) => Promise<RewardedAdBridgeResult>;

export const REWARDED_AD_BRIDGES: Record<string, RewardedAdBridge> = {
  // Monetag, website tag / SDK bridge (src/lib/monetag-rewarded.ts)
  monetag: async (provider, opts) => {
    const zone = getMonetagZone(provider);
    if (!zone)
      throw new Error("The ad zone is not configured. Please try again later.");
    return showMonetagRewardedAd({
      zone,
      ymid: opts.ymid,
      requestVar: opts.toolKey,
      sdkUrl: getMonetagSdkUrl(provider),
      minWatchTimeMs: 5000,
    });
  },
  // Google AdSense, H5 Games Ads adBreak bridge (src/lib/adsense-rewarded.ts)
  google_adsense: async (provider, opts) => {
    const settings = (provider.settings ?? {}) as Record<string, unknown>;
    const creds = (provider.credentials ?? {}) as Record<string, unknown>;
    if (settings.rewarded_ads !== true) {
      throw new Error(
        "AdSense rewarded ads are disabled. Enable Rewarded Ads in Admin → Ads → Google AdSense.",
      );
    }
    const publisherId =
      typeof creds.publisher_id === "string" ? creds.publisher_id : "";
    return showAdsenseRewardedAd({
      publisherId,
      requestVar: opts.toolKey,
    }).then((res) => ({
      mode: "adsense_h5_rewarded",
      valued: res.viewed,
      estimatedPrice: null,
    }));
  },
};

/**
 * All active providers that can actually serve a rewarded experience,
 * in priority order (lower `priority` first, matching fetchAdConfig's
 * ordering). A provider qualifies when it has a real client-side bridge
 * OR is an offerwall provider served via iframe + server postback.
 *
 * This is the multi-provider candidate chain: every consumer (credit
 * earning in Rewards, tool unlocks in rewarded-access) walks these in
 * order and falls through to the next candidate when one fails, so the
 * system never depends on a single provider (e.g. only Monetag).
 */
export function getRewardedAdCandidates(
  providers: DbAdProvider[],
): DbAdProvider[] {
  return providers
    .filter(
      (p) =>
        p.is_active && (!!REWARDED_AD_BRIDGES[p.slug] || supportsOfferwall(p)),
    )
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

/**
 * Providers with a real client-side bridge only (no offerwall), in
 * priority order. These are the ones a direct "Watch Ad" tap can
 * invoke from the user gesture.
 */
export function getBridgedAdCandidates(
  providers: DbAdProvider[],
): DbAdProvider[] {
  return providers
    .filter((p) => p.is_active && !!REWARDED_AD_BRIDGES[p.slug])
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

/**
 * Ordered unlock chain for a specific tool: the configured primary and
 * fallback providers first (admin's explicit choice), then every other
 * active bridged provider by priority. Deduped by id.
 */
export function getUnlockProviderChain(
  providers: DbAdProvider[],
  primary: DbAdProvider | null,
  fallback: DbAdProvider | null,
): DbAdProvider[] {
  const chain: DbAdProvider[] = [];
  const seen = new Set<string>();
  for (const p of [primary, fallback, ...getBridgedAdCandidates(providers)]) {
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      chain.push(p);
    }
  }
  return chain;
}
