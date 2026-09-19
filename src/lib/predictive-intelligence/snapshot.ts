// =========================================================
// FRELUX PREDICTIVE INTELLIGENCE, SNAPSHOT BUILDER
//
// Loads the project's REAL data through the existing Supabase
// client (row-level security applies: users only ever load
// their own projects, §21). Everything the analysis consumes
// is here; the analyzers are pure functions over this snapshot.
// =========================================================

import { supabase } from "@/lib/supabase";
import { calculateFreshness } from "@/lib/market-intelligence/price-validator";
import type {
  MarketPricePoint,
  PredictiveProjectSnapshot,
  VisualObservation,
} from "./types";

interface DbProjectRow {
  id: string;
  name: string;
  status: "draft" | "in_progress" | "on_hold" | "completed" | "archived";
  created_at: string;
  updated_at: string;
  progress_percentage: number | null;
}

interface DbShoppingRow {
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
  updated_at?: string;
}

interface DbStageRow {
  id: string;
  stage_key: string;
  stage_name: string;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
  photo_url: string | null;
  notes: string | null;
  updated_at: string;
}

interface DbCalcRow {
  id: string;
  calculator_type: string;
  calc_title: string;
  created_at: string;
  result_summary: Record<string, unknown>;
}

interface DbPriceHistoryRow {
  material_name: string;
  old_price: number | null;
  new_price: number;
  price_source: string | null;
  created_at: string;
}

/**
 * Build the analysis snapshot for one project. Returns null when
 * the project does not exist OR is not visible to the current
 * user, RLS makes the two indistinguishable, by design.
 */
export async function buildProjectSnapshot(
  projectId: string,
  opts: { now?: string } = {},
): Promise<PredictiveProjectSnapshot | null> {
  const now = opts.now ?? new Date().toISOString();

  const [projectRes, stagesRes, shoppingRes, calcsRes, priceHistoryRes] =
    await Promise.all([
      supabase
        .from("contractor_projects")
        .select("id, name, status, created_at, updated_at, progress_percentage")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("project_progress_stages")
        .select(
          "id, stage_key, stage_name, sort_order, is_completed, completed_at, photo_url, notes, updated_at",
        )
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("project_shopping_list")
        .select(
          "id, project_id, category, name, quantity, unit, estimated_price, actual_price, total_price, supplier, notes, is_purchased, sort_order",
        )
        .eq("project_id", projectId)
        .order("sort_order"),
      supabase
        .from("project_calculations")
        .select("id, calculator_type, calc_title, created_at, result_summary")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("material_price_history")
        .select("material_name, old_price, new_price, price_source, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  if (projectRes.error)
    throw new Error(`Failed to load project: ${projectRes.error.message}`);
  const project = projectRes.data as DbProjectRow | null;
  if (!project) return null;

  const stages = (stagesRes.data ?? []) as DbStageRow[];
  const shopping = (shoppingRes.data ?? []) as DbShoppingRow[];
  const calculations = (calcsRes.data ?? []) as DbCalcRow[];
  const priceHistory = (priceHistoryRes.data ?? []) as DbPriceHistoryRow[];

  // Region: from the project's location context if recorded; the
  // location-intelligence module keeps the authoritative profile.
  // No region recorded → null → market trend reports unsupported
  // region honestly (§16), never another region's data.
  const region = await loadRegionContext(projectId);

  // Market price points for the region (verified or unverified :
  // verification state travels with each point and is surfaced).
  const marketPrices: MarketPricePoint[] = await loadMarketPrices(region, now);

  // Visual observations (§8): completed stages with photos are
  // user-recorded observations. Deeper Phase 3 vision observations
  // flow in through the same channel when they exist.
  const visualObservations: VisualObservation[] = stages
    .filter(
      (s) => s.is_completed && s.photo_url && (s.notes ?? "").trim().length > 0,
    )
    .map((s) => ({
      id: s.id,
      observation: `Stage "${s.stage_name}" recorded complete with photo${s.notes ? `, notes: ${s.notes}` : ""}`,
      observedAt: s.completed_at ?? s.updated_at,
      confidence: 1,
      verification: "user_confirmed" as const,
      sourceLabel: "Progress stage photo",
    }));

  return {
    projectId,
    now,
    project: {
      name: project.name,
      status: project.status,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      progressPercentage:
        project.progress_percentage !== null &&
        Number.isFinite(Number(project.progress_percentage))
          ? Number(project.progress_percentage)
          : null,
    },
    stages: stages.map((s) => ({
      id: s.id,
      stageKey: s.stage_key,
      stageName: s.stage_name,
      sortOrder: s.sort_order,
      isCompleted: s.is_completed,
      completedAt: s.completed_at,
      hasPhoto: Boolean(s.photo_url),
      updatedAt: s.updated_at,
    })),
    shoppingItems: shopping.map((s) => ({
      id: s.id,
      project_id: s.project_id,
      category: s.category,
      name: s.name,
      quantity: Number(s.quantity),
      unit: s.unit,
      estimated_price: Number(s.estimated_price),
      actual_price: s.actual_price === null ? null : Number(s.actual_price),
      total_price: Number(s.total_price),
      supplier: s.supplier,
      notes: s.notes,
      updated_at: s.updated_at ?? undefined,
      is_purchased: s.is_purchased,
      sort_order: s.sort_order,
    })),
    calculations: calculations.map((c) => ({
      id: c.id,
      calculatorType: c.calculator_type,
      title: c.calc_title,
      createdAt: c.created_at,
      estimatedTotal: extractEstimatedTotal(c.result_summary),
    })),
    priceHistory: priceHistory.map((h) => ({
      materialName: h.material_name,
      oldPrice: h.old_price === null ? null : Number(h.old_price),
      newPrice: Number(h.new_price),
      changedAt: h.created_at,
      priceSource: h.price_source,
    })),
    marketPrices,
    visualObservations,
    region,
  };
}

/** Pull a recorded total cost out of a saved calculation summary,
 *  accepting the common summary shapes. Never invents a value. */
function extractEstimatedTotal(
  summary: Record<string, unknown>,
): number | null {
  const candidates = [
    summary.total_cost,
    summary.totalCost,
    summary.grand_total,
    summary.estimated_total,
    summary.total,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Region context from the canonical location record stored on the
 * project (location-intelligence `location` jsonb column). A
 * missing location is honest "unsupported region", not an error :
 * and market data for OTHER regions is never substituted (§16).
 */
async function loadRegionContext(
  projectId: string,
): Promise<PredictiveProjectSnapshot["region"]> {
  const empty = { marketCode: null, countryCode: null, city: null };
  try {
    const { data, error } = await supabase
      .from("contractor_projects")
      .select("location")
      .eq("id", projectId)
      .maybeSingle();
    if (error || !data) return empty;
    const location = (data as { location: Record<string, unknown> | null })
      .location;
    if (!location) return empty;
    const countryCode =
      typeof location.country_code === "string" &&
      location.country_code.length === 2
        ? location.country_code
        : null;
    return {
      // market profile key IS the country code in market_profiles
      marketCode: countryCode,
      countryCode,
      city: typeof location.city === "string" ? location.city : null,
    };
  } catch {
    return empty;
  }
}

async function loadMarketPrices(
  region: PredictiveProjectSnapshot["region"],
  now: string,
): Promise<MarketPricePoint[]> {
  const marketCode = region.marketCode ?? region.countryCode;
  if (!marketCode) return [];
  try {
    const { data, error } = await supabase
      .from("mi_approved_prices")
      .select(
        "id, product_name, median_price, price, currency_code, market_code, region, freshness, last_updated, approved_at, auto_approved",
      )
      .eq("market_code", marketCode)
      .eq("is_active", true)
      .order("last_updated", { ascending: false })
      .limit(100);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>)
      .map((r) => {
        const collectedAt = String(r.last_updated ?? r.approved_at ?? now);
        // The freshness recorded by the market-intelligence validator
        // is authoritative; fall back to a fresh computation only if absent.
        const recorded = typeof r.freshness === "string" ? r.freshness : null;
        return {
          id: String(r.id),
          label: String(r.product_name ?? "Unknown product"),
          price: Number(r.median_price ?? r.price),
          currencyCode: String(r.currency_code ?? ""),
          marketCode: String(r.market_code ?? marketCode),
          region:
            r.region === null || r.region === undefined
              ? null
              : String(r.region),
          collectedAt,
          freshness: (recorded ??
            calculateFreshness(collectedAt)) as MarketPricePoint["freshness"],
          verified: Boolean(r.approved_at) || Boolean(r.auto_approved),
        };
      })
      .filter((p) => Number.isFinite(p.price) && p.price > 0);
  } catch {
    return [];
  }
}
