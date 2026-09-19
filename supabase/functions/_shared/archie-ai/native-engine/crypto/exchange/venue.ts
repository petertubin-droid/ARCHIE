// =========================================================
// ARCHIE NATIVE ENGINE — VENUE ADAPTER CONTRACT
// supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/venue.ts
//
// The exchange execution layer. ARCHIE places real orders
// ONLY through a VenueAdapter. The contract makes the safety
// rules structural:
//
//   * adapters are ALWAYS constructed with an explicit mode:
//     TESTNET or MAINNET. MAINNET requires the owner's
//     explicit authorization flag — adapters refuse to be
//     constructed any other way.
//   * the adapter never holds the owner's secrets in a
//     global; credentials are injected at construction from
//     the deployment's secret store, never from source.
//   * every order request carries the gate decision id it
//     was authorized by — no gate decision, no order.
// =========================================================

export type VenueMode = "TESTNET" | "MAINNET";

export interface VenueCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface VenueOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  /** Base asset quantity (e.g. BTC for BTCUSDT). */
  quantity: number;
  /** The gate decision that authorized this order. */
  authorizedByDecisionId: string;
}

export interface VenueOrderResult {
  ok: boolean;
  /** Exchange order id when accepted. */
  orderId: string | null;
  /** Filled/average price when known, else null — never invented. */
  filledPrice: number | null;
  status: string;
  raw: unknown;
}

export interface VenueBalance {
  asset: string;
  free: number;
  locked: number;
}

/**
 * Spot venue adapter. Implementations MUST:
 *   1. refuse construction for MAINNET without explicit
 *      owner authorization
 *   2. never log or expose the API secret
 *   3. report failures with the venue's error payload —
 *      never silently succeed
 */
export interface VenueAdapter {
  readonly venue: string;
  readonly mode: VenueMode;
  /** Validate an order WITHOUT executing it (venue dry-run). */
  validateOrder(request: VenueOrderRequest): Promise<VenueOrderResult>;
  /** Place a MARKET order — executes immediately. */
  placeMarketOrder(request: VenueOrderRequest): Promise<VenueOrderResult>;
  /** Cancel ALL open orders for a symbol (emergency path). */
  cancelAllOpenOrders(symbol: string): Promise<{
    ok: boolean;
    cancelled: number;
    raw: unknown;
  }>;
  /** Read balances — for pre-flight sanity checks. */
  getBalances(): Promise<VenueBalance[]>;
}
