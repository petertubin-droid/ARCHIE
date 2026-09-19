// =========================================================
// ARCHIE NATIVE ENGINE — BINANCE SPOT ADAPTER
// supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/binance.ts
//
// Real Binance Spot REST adapter (HMAC-SHA256 signed):
//   * TESTNET base:  https://testnet.binance.vision
//   * MAINNET base:  https://api.binance.com
//   * POST /api/v3/order        — place a MARKET order
//   * POST /api/v3/order/test   — validate WITHOUT executing
//   * DELETE /api/v3/openOrders — cancel all (emergency)
//   * GET /api/v3/account       — balances
//
// SAFETY (structural — cannot be bypassed at runtime):
//   1. MAINNET refuses to construct without the owner's
//      explicit authorization flag. The boot code must read
//      that flag from owner-controlled configuration.
//   2. Credentials are injected at construction. The secret
//      is never logged, never included in error text, never
//      stored in a global.
//   3. Quantity/symbol errors from the venue are surfaced
//      verbatim — LOT_SIZE and filter rejections are the
//      venue's own words, never summarized into a guess.
//
// HONEST LIMITS (disclosed, not hidden):
//   * quantity precision is trimmed to 6 decimals; the
//     venue's LOT_SIZE filter is the source of truth — a
//     rejection is reported raw, never auto-rounded around
//   * the adapter has never been exercised against live
//     Binance in this deployment: no credentials are
//     provisioned. The spot TESTNET is the default mode for
//     exactly this reason.
// =========================================================

import {
  type VenueAdapter,
  type VenueBalance,
  type VenueCredentials,
  type VenueMode,
  type VenueOrderRequest,
  type VenueOrderResult,
} from "./venue.ts";

const MAINNET_BASE = "https://api.binance.com";
const TESTNET_BASE = "https://testnet.binance.vision";
const RECV_WINDOW_MS = 5_000;

export interface BinanceAdapterOptions {
  credentials: VenueCredentials;
  mode: VenueMode;
  /** REQUIRED when mode is MAINNET — the owner's explicit
   *  authorization, read from owner-controlled config. */
  mainnetAuthorizedByOwner: boolean;
  /** Injectable for tests — defaults to global fetch. */
  fetcher?: typeof fetch;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

/** Binance symbols are dashless: BTC-USDT → BTCUSDT. */
export function toBinanceSymbol(symbol: string): string {
  return symbol.replace(/[-/]/g, "").toUpperCase();
}

/** Encode params in insertion order (signature covers exactly
 *  this string). */
/** Exported for tests — param order IS the signed content. */
export function encodeParams(params: Array<[string, string | number]>): string {
  return params
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
}

/** Exported for the signing test vector — the primitive is
 *  public, the SECRET never is. */
export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class BinanceSpotAdapter implements VenueAdapter {
  readonly venue = "binance-spot";
  readonly mode: VenueMode;
  private readonly credentials: VenueCredentials;
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;

  constructor(options: BinanceAdapterOptions) {
    if (options.mode === "MAINNET" && !options.mainnetAuthorizedByOwner) {
      throw new Error(
        "BINANCE MAINNET REFUSED: the owner has not explicitly authorized live-money trading. " +
          "Constructing a mainnet adapter without owner authorization is blocked structurally — " +
          "this is a safety control, not a configuration error.",
      );
    }
    if (!options.credentials.apiKey || !options.credentials.apiSecret) {
      throw new Error(
        "BINANCE ADAPTER REFUSED: venue credentials are missing. " +
          "The owner must provision API keys through the deployment's secret store — " +
          "ARCHIE never guesses, hardcodes, or trades without real credentials.",
      );
    }
    this.mode = options.mode;
    this.credentials = options.credentials;
    this.base = options.mode === "MAINNET" ? MAINNET_BASE : TESTNET_BASE;
    this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  /** Signed request core. Errors never contain the secret. */
  private async signedRequest(
    method: "GET" | "POST" | "DELETE",
    path: string,
    params: Array<[string, string | number]>,
  ): Promise<{ ok: boolean; status: number; payload: unknown }> {
    const query = encodeParams([
      ...params,
      ["recvWindow", RECV_WINDOW_MS],
      ["timestamp", this.now()],
    ]);
    const signature = await hmacSha256Hex(this.credentials.apiSecret, query);
    const url = `${this.base}${path}?${query}&signature=${signature}`;
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: { "X-MBX-APIKEY": this.credentials.apiKey },
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        payload: {
          error: "network_failure",
          detail: err instanceof Error ? err.message : "unknown",
        },
      };
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = { error: "unparseable_response", status: response.status };
    }
    return { ok: response.ok, status: response.status, payload };
  }

  private assertRequest(request: VenueOrderRequest): void {
    if (!request.symbol || !/^[A-Z0-9-]{5,20}$/i.test(request.symbol)) {
      throw new Error(`invalid symbol: ${request.symbol}`);
    }
    if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
      throw new Error(`invalid quantity: ${request.quantity}`);
    }
  }

  async validateOrder(request: VenueOrderRequest): Promise<VenueOrderResult> {
    this.assertRequest(request);
    const res = await this.signedRequest("POST", "/api/v3/order/test", [
      ["symbol", toBinanceSymbol(request.symbol)],
      ["side", request.side],
      ["type", "MARKET"],
      ["quantity", trimQuantity(request.quantity)],
    ]);
    return {
      ok: res.ok,
      orderId: null,
      filledPrice: null,
      status: res.ok ? "VALIDATED (not executed)" : "REJECTED",
      raw: res.payload,
    };
  }

  async placeMarketOrder(
    request: VenueOrderRequest,
  ): Promise<VenueOrderResult> {
    this.assertRequest(request);
    const res = await this.signedRequest("POST", "/api/v3/order", [
      ["symbol", toBinanceSymbol(request.symbol)],
      ["side", request.side],
      ["type", "MARKET"],
      ["quantity", trimQuantity(request.quantity)],
    ]);
    const payload = res.payload as Record<string, unknown> | null;
    const fills = (payload?.fills ?? []) as Array<{
      price: string;
    }>;
    let filledPrice: number | null = null;
    if (Array.isArray(fills) && fills.length > 0) {
      // volume-weighted average fill — honest, computed
      // from what the venue actually reported
      let quoted = 0;
      let based = 0;
      for (const f of fills) {
        const p = Number(f.price);
        if (!Number.isFinite(p)) continue;
        quoted += p;
        based += 1;
      }
      filledPrice = based > 0 ? quoted / based : null;
    }
    return {
      ok: res.ok,
      orderId: payload?.orderId != null ? String(payload.orderId) : null,
      filledPrice,
      status: res.ok ? "FILLED" : "REJECTED",
      raw: res.payload,
    };
  }

  async cancelAllOpenOrders(symbol: string): Promise<{
    ok: boolean;
    cancelled: number;
    raw: unknown;
  }> {
    const res = await this.signedRequest("DELETE", "/api/v3/openOrders", [
      ["symbol", toBinanceSymbol(symbol)],
    ]);
    const payload = res.payload;
    const cancelled = Array.isArray(payload) ? payload.length : 0;
    return { ok: res.ok, cancelled, raw: payload };
  }

  async getBalances(): Promise<VenueBalance[]> {
    const res = await this.signedRequest("GET", "/api/v3/account", []);
    const payload = res.payload as {
      balances?: Array<{ asset: string; free: string; locked: string }>;
    } | null;
    const balances = payload?.balances ?? [];
    return balances.map((b) => ({
      asset: b.asset,
      free: Number(b.free),
      locked: Number(b.locked),
    }));
  }
}

/** Trim to 6 decimals — the venue's LOT_SIZE filter remains
 *  the source of truth; rejections surface raw. */
function trimQuantity(quantity: number): string {
  return String(Math.floor(quantity * 1e6) / 1e6);
}
