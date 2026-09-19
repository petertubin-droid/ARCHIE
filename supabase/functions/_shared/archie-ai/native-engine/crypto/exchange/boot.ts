// =========================================================
// ARCHIE NATIVE ENGINE — EXECUTION BOOT FACTORY
// supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/boot.ts
//
// The ONLY sanctioned way runtime code constructs the
// execution adapter. Credentials come from the deployment's
// secret store (owner-provisioned) — never from source, never
// guessed. No credentials → no adapter → no execution, with
// an honest reason string the caller can surface.
//
// Owner secret contract (set through the platform secrets
// flow or the venue's own secret store):
//   BINANCE_API_KEY            — venue API key
//   BINANCE_API_SECRET         — venue API secret
//   BINANCE_MODE               — "TESTNET" (default) | "MAINNET"
//   BINANCE_MAINNET_AUTHORIZED — "true" REQUIRED for MAINNET
// =========================================================

import { BinanceSpotAdapter } from "./binance.ts";
import type { VenueAdapter } from "./venue.ts";

export interface AdapterBootResult {
  adapter: VenueAdapter | null;
  /** Honest reason when no adapter was constructed. */
  reason: string;
}

export function executionAdapterFromEnv(
  env: Record<string, string | undefined>,
): AdapterBootResult {
  const apiKey = env.BINANCE_API_KEY;
  const apiSecret = env.BINANCE_API_SECRET;
  if (!apiKey || !apiSecret) {
    return {
      adapter: null,
      reason:
        "exchange execution is NOT configured: BINANCE_API_KEY / BINANCE_API_SECRET are not provisioned. " +
        "The owner must provision venue credentials through the secrets flow — ARCHIE never hardcodes keys and never trades without them.",
    };
  }
  const mode = (env.BINANCE_MODE ?? "TESTNET").toUpperCase();
  if (mode !== "TESTNET" && mode !== "MAINNET") {
    return {
      adapter: null,
      reason: `BINANCE_MODE "${env.BINANCE_MODE}" is invalid — use TESTNET or MAINNET.`,
    };
  }
  const mainnetAuthorizedByOwner = env.BINANCE_MAINNET_AUTHORIZED === "true";
  if (mode === "MAINNET" && !mainnetAuthorizedByOwner) {
    return {
      adapter: null,
      reason:
        'MAINNET execution REFUSED: BINANCE_MAINNET_AUTHORIZED is not "true". ' +
        "Live-money trading requires the owner's explicit authorization — this is a safety control.",
    };
  }
  try {
    const adapter = new BinanceSpotAdapter({
      credentials: { apiKey, apiSecret },
      mode,
      mainnetAuthorizedByOwner,
    });
    return {
      adapter,
      reason: `execution adapter ready: ${adapter.venue} (${adapter.mode})`,
    };
  } catch (err) {
    return {
      adapter: null,
      reason:
        "execution adapter construction REFUSED: " +
        (err instanceof Error ? err.message : "unknown error"),
    };
  }
}
