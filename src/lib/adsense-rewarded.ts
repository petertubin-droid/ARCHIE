/**
 * Google AdSense, Rewarded ads (H5 Games Ads SDK / adBreak API).
 *
 * AdSense rewarded ads run through the H5 Games Ads SDK: the standard
 * adsbygoogle.js script (loaded with ?client=ca-pub-…) exposes a global
 * `adBreak()` function. The Rewarded format must be enabled for the site in
 * the AdSense dashboard (Ads → By ad unit → Rewarded / H5 games ads).
 *
 * Additive bridge, registered in src/lib/rewarded-access.ts alongside the
 * Monetag bridge; only used when AdSense is active with the rewarded_ads
 * setting enabled.
 */
export interface AdsenseRewardedResult {
  /** true when the user watched the ad to completion (adViewed fired) */
  viewed: boolean;
  /** placement info returned by adBreakDone, best-effort */
  breakStatus: string;
}

interface AdBreakPlacementInfo {
  breakType?: string;
  breakName?: string;
  breakStatus?: string;
}

type AdBreakFn = (opts: Record<string, unknown>) => void;

function loadAdsenseScript(publisherId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="${encodeURIComponent(publisherId)}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("Could not load the AdSense script. Try again later."));
    document.head.appendChild(s);
  });
}

/**
 * Shows an AdSense rewarded ad via the H5 Games adBreak API.
 * Resolves when the ad is fully viewed; rejects when dismissed, unavailable,
 * or not enabled for the site.
 */
export async function showAdsenseRewardedAd(opts: {
  publisherId: string;
  requestVar?: string;
  timeoutMs?: number;
}): Promise<AdsenseRewardedResult> {
  const { publisherId, requestVar, timeoutMs = 120_000 } = opts;
  if (!/^ca-pub-\d{10,20}$/.test(publisherId.trim())) {
    throw new Error("AdSense publisher ID is not configured correctly.");
  }
  await loadAdsenseScript(publisherId.trim());

  // The H5 Games SDK exposes adBreak globally once the script + the site's
  // rewarded ads setting are active in the AdSense dashboard.
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (
        typeof (window as unknown as { adBreak?: AdBreakFn }).adBreak ===
        "function"
      ) {
        resolve();
        return;
      }
      if (Date.now() - started > 10_000) {
        reject(
          new Error(
            "AdSense rewarded ads are unavailable. Make sure Rewarded ads (H5 Games Ads) are enabled for this site in your AdSense dashboard.",
          ),
        );
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });

  return new Promise<AdsenseRewardedResult>((resolve, reject) => {
    const adBreak = (window as unknown as { adBreak: AdBreakFn }).adBreak;
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error("The ad took too long. Please try again."));
      }
    }, timeoutMs);

    adBreak({
      type: "reward",
      name: requestVar ?? "rewarded_unlock",
      beforeReward: (showAdFn: () => void) => {
        // Always show, the unlock flow only calls this after a user gesture
        showAdFn();
      },
      adDismissed: () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("The ad was dismissed before completion."));
        }
      },
      adViewed: () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ viewed: true, breakStatus: "viewed" });
        }
      },
      adBreakDone: (placementInfo: AdBreakPlacementInfo) => {
        // Terminal callback, if nothing settled yet, the ad never fully showed
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            viewed: false,
            breakStatus: placementInfo?.breakStatus ?? "done",
          });
        }
      },
    });
  });
}
