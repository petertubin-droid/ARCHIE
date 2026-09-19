// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, INTERNAL ROW TYPES
//
// Structural types matching the actual database rows the analysis
// consumes. Kept separate from `types.ts` (public contract) so the
// analyzers depend on real column shapes, not invented ones.
// =========================================================

/** Matches `project_shopping_list` + actual_price/supplier columns. */
export interface ShoppingRow {
  id: string;
  project_id: string;
  category: string;
  name: string;
  quantity: number;
  unit: string;
  estimated_price: number;
  actual_price: number | null;
  total_price: number;
  supplier: string | null;
  notes: string | null;
  is_purchased: boolean;
  sort_order: number;
}

/** Matches a verified/current market price row (mi_approved_prices /
 *  mi_price_observations shape the analysis consumes). */
export interface MarketPriceRow {
  id: string;
  label: string;
  price: number;
  currencyCode: string;
  marketCode: string;
  region: string | null;
  collectedAt: string;
  verified: boolean;
}
