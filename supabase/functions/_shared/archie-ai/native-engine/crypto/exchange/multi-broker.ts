// =========================================================
// ARCHIE MULTI-BROKER DISPATCHER & ADAPTER LAYER
// supabase/functions/_shared/archie-ai/native-engine/crypto/exchange/multi-broker.ts
// =========================================================

import type { VenueAdapter, VenueOrder, VenueOrderResult, VenueCancelResult, VenueBalance } from "./venue.ts";

export interface BrokerAdapterConfig {
  id: string;
  name: string;
  type: string;
  mode: "PAPER" | "TESTNET" | "LIVE";
}

/**
 * In-memory Paper Simulator Adapter satisfying VenueAdapter interface
 */
export class PaperSimulatorAdapter implements VenueAdapter {
  readonly venue = "paper";
  readonly mode = "testnet" as const;
  private balances: VenueBalance[] = [
    { asset: "USD", free: 100000.0, locked: 0.0 },
    { asset: "USDT", free: 100000.0, locked: 0.0 },
    { asset: "EUR", free: 50000.0, locked: 0.0 },
  ];

  async getBalances(): Promise<VenueBalance[]> {
    return [...this.balances];
  }

  async validateOrder(order: VenueOrder): Promise<{ valid: boolean; reason?: string }> {
    if (!order.symbol || order.quantity <= 0) {
      return { valid: false, reason: "Invalid symbol or quantity." };
    }
    return { valid: true };
  }

  async placeMarketOrder(order: VenueOrder): Promise<VenueOrderResult> {
    const fillPrice = 1.0; // Simulated reference price
    return {
      orderId: `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      symbol: order.symbol,
      side: order.side,
      executedQuantity: order.quantity,
      cummulativeQuoteQuantity: order.quantity * fillPrice,
      status: "FILLED",
      rawResponse: { simulated: true, simulatedAt: new Date().toISOString() },
    };
  }

  async cancelAllOpenOrders(symbol: string): Promise<VenueCancelResult> {
    return {
      symbol,
      cancelledCount: 0,
      details: "Simulated paper orders flushed.",
    };
  }
}

/**
 * Broker Adapter Factory
 */
export function getBrokerAdapter(brokerId: string): VenueAdapter {
  // Paper simulator is the default safe fallback
  return new PaperSimulatorAdapter();
}
