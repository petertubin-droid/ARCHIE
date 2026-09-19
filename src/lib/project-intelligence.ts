/**
 * Project Intelligence, Connected project planning, shopping, tracking, and client tools.
 *
 * Features:
 * 1. Project Calculations, save structured calc results to projects
 * 2. Smart Shopping List, aggregate materials, track estimated vs actual spending
 * 3. Material Price Tracker, track prices with history
 * 4. Before & After Gallery, upload, moderate, display
 * 5. Client Estimates, create, share, track approvals
 * 6. Paint Comparison, configurable comparison data
 * 7. Project Progress, extensible stage tracking
 * 8. Surface Assessment, standalone surface condition assessment
 */
import { supabase } from "@/lib/supabase";
import type {
  DbProjectCalculation,
  DbGalleryEntry,
  DbGalleryImage,
  DbClientEstimate,
  DbPaintComparison,
  DbProjectProgressStage,
  DbProjectStageTemplate,
  DbSurfaceAssessment,
  DbMaterialPriceHistory,
} from "@/types/database";

// ============================================================
// 1. PROJECT CALCULATIONS
// ============================================================

export interface SaveCalculationInput {
  project_id: string;
  calculator_type: DbProjectCalculation["calculator_type"];
  calculator_slug: string;
  calc_title: string;
  calc_data: object;
  result_summary: Record<string, unknown>;
  materials: Array<{
    name: string;
    category: string;
    quantity: number;
    unit: string;
    estimated_price?: number;
  }>;
}

export async function saveCalculationToProject(
  input: SaveCalculationInput,
): Promise<DbProjectCalculation> {
  const { data, error } = await supabase
    .from("project_calculations")
    .insert({
      project_id: input.project_id,
      calculator_type: input.calculator_type,
      calculator_slug: input.calculator_slug,
      calc_title: input.calc_title,
      calc_data: input.calc_data,
      result_summary: input.result_summary,
      materials: input.materials,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to save calculation: ${error.message}`);
  return data as DbProjectCalculation;
}

export async function fetchProjectCalculations(
  projectId: string,
): Promise<DbProjectCalculation[]> {
  const { data, error } = await supabase
    .from("project_calculations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as DbProjectCalculation[];
}

export async function deleteProjectCalculation(id: string): Promise<void> {
  const { error } = await supabase
    .from("project_calculations")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// 2. SMART SHOPPING LIST, extended with actual prices
// ============================================================

export interface ShoppingItemWithActual {
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
  /** DB-maintained (set_updated_at trigger), present on rows from the DB. */
  updated_at?: string;
}

export interface ShoppingListTotals {
  estimatedTotal: number;
  actualTotal: number;
  difference: number;
  itemCount: number;
  purchasedCount: number;
  pendingCount: number;
}

export async function fetchShoppingListWithActual(
  projectId: string,
): Promise<ShoppingItemWithActual[]> {
  const { data, error } = await supabase
    .from("project_shopping_list")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as ShoppingItemWithActual[];
}

export async function updateShoppingItemActualPrice(
  id: string,
  actualPrice: number,
): Promise<void> {
  const { error } = await supabase
    .from("project_shopping_list")
    .update({ actual_price: actualPrice })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateShoppingItemSupplier(
  id: string,
  supplier: string,
): Promise<void> {
  const { error } = await supabase
    .from("project_shopping_list")
    .update({ supplier })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addManualShoppingItem(
  projectId: string,
  item: {
    category: string;
    name: string;
    quantity: number;
    unit: string;
    estimated_price: number;
    notes?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("project_shopping_list").insert({
    project_id: projectId,
    category: item.category,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    estimated_price: item.estimated_price,
    total_price: item.estimated_price * item.quantity,
    notes: item.notes || null,
  });
  if (error) throw new Error(error.message);
}

export function calculateShoppingTotals(
  items: ShoppingItemWithActual[],
): ShoppingListTotals {
  let estimatedTotal = 0;
  let actualTotal = 0;
  let purchasedCount = 0;

  for (const item of items) {
    estimatedTotal += item.estimated_price * item.quantity;
    if (item.actual_price !== null) {
      actualTotal += item.actual_price * item.quantity;
    }
    if (item.is_purchased) purchasedCount++;
  }

  return {
    estimatedTotal,
    actualTotal,
    difference: actualTotal - estimatedTotal,
    itemCount: items.length,
    purchasedCount,
    pendingCount: items.length - purchasedCount,
  };
}

// ============================================================
// 3. MATERIAL PRICE TRACKER
// ============================================================

export interface MaterialWithPrice {
  id: string;
  category: string;
  name: string;
  brand: string | null;
  current_price: number;
  previous_price: number | null;
  unit: string | null;
  price_source: string | null;
  price_updated_at: string | null;
  is_active: boolean;
}

export async function fetchMaterialsWithPrices(
  category?: string,
): Promise<MaterialWithPrice[]> {
  let query = supabase
    .from("material_catalog")
    .select("*")
    .eq("is_active", true);
  if (category) query = query.eq("category", category);
  const { data, error } = await query.order("name");
  if (error) throw new Error(error.message);
  return (data || []) as MaterialWithPrice[];
}

export async function updateMaterialPrice(
  materialId: string,
  newPrice: number,
  source?: string,
): Promise<void> {
  // Fetch current price for history
  const { data: material } = await supabase
    .from("material_catalog")
    .select("current_price, name, category, package_unit")
    .eq("id", materialId)
    .single();

  if (!material) throw new Error("Material not found");

  // Insert price history record
  await supabase.from("material_price_history").insert({
    material_id: materialId,
    material_name: material.name,
    category: material.category,
    old_price: material.current_price,
    new_price: newPrice,
    unit: material.package_unit,
    price_source: source || null,
  });

  // Update material with new price
  const { error } = await supabase
    .from("material_catalog")
    .update({
      previous_price: material.current_price,
      current_price: newPrice,
      price_updated_at: new Date().toISOString(),
      price_source: source || null,
    })
    .eq("id", materialId);
  if (error) throw new Error(error.message);
}

export async function fetchMaterialPriceHistory(
  materialId?: string,
  limit = 20,
): Promise<DbMaterialPriceHistory[]> {
  let query = supabase
    .from("material_price_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (materialId) query = query.eq("material_id", materialId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as DbMaterialPriceHistory[];
}

export function hasPriceChanged(
  snapshotPrice: number,
  currentPrice: number,
): boolean {
  return Math.abs(snapshotPrice - currentPrice) > 0.01;
}

// ============================================================
// 4. BEFORE & AFTER GALLERY
// ============================================================

export interface CreateGalleryEntryInput {
  title: string;
  description?: string;
  project_category: DbGalleryEntry["project_category"];
  paint_type_used?: string;
  paint_quality_used?: string;
  colour_used?: string;
  location?: string;
  completion_date?: string;
  is_public?: boolean;
}

export async function createGalleryEntry(
  input: CreateGalleryEntryInput,
): Promise<DbGalleryEntry> {
  const { data, error } = await supabase
    .from("gallery_entries")
    .insert({
      title: input.title,
      description: input.description || null,
      project_category: input.project_category,
      paint_type_used: input.paint_type_used || null,
      paint_quality_used: input.paint_quality_used || null,
      colour_used: input.colour_used || null,
      location: input.location || null,
      completion_date: input.completion_date || null,
      is_public: input.is_public ?? false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DbGalleryEntry;
}

export async function fetchGalleryEntries(opts?: {
  status?: string;
  category?: string;
  limit?: number;
}): Promise<DbGalleryEntry[]> {
  let query = supabase.from("gallery_entries").select("*");
  if (opts?.status) query = query.eq("status", opts.status);
  if (opts?.category) query = query.eq("project_category", opts.category);
  if (opts?.limit) query = query.limit(opts.limit);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as DbGalleryEntry[];
}

export async function fetchPublicGallery(opts?: {
  category?: string;
  limit?: number;
}): Promise<DbGalleryEntry[]> {
  let query = supabase
    .from("gallery_entries")
    .select("*")
    .in("status", ["approved", "featured"])
    .eq("is_public", true);
  if (opts?.category) query = query.eq("project_category", opts.category);
  if (opts?.limit) query = query.limit(opts.limit);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as DbGalleryEntry[];
}

export async function updateGalleryEntry(
  id: string,
  updates: Partial<DbGalleryEntry>,
): Promise<void> {
  const { error } = await supabase
    .from("gallery_entries")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from("gallery_entries")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function addGalleryImage(
  entryId: string,
  imageUrl: string,
  imageType: "before" | "after",
  caption?: string,
): Promise<DbGalleryImage> {
  const { data, error } = await supabase
    .from("gallery_images")
    .insert({
      gallery_entry_id: entryId,
      image_url: imageUrl,
      image_type: imageType,
      caption: caption || null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DbGalleryImage;
}

export async function fetchGalleryImages(
  entryId: string,
): Promise<DbGalleryImage[]> {
  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("gallery_entry_id", entryId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as DbGalleryImage[];
}

// Admin: moderate gallery
export async function moderateGalleryEntry(
  id: string,
  status: DbGalleryEntry["status"],
  adminNotes?: string,
): Promise<void> {
  const { error } = await supabase
    .from("gallery_entries")
    .update({
      status,
      admin_notes: adminNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleGalleryFeature(
  id: string,
  isFeatured: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("gallery_entries")
    .update({
      is_featured: isFeatured,
      status: isFeatured ? "featured" : "approved",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// 5. CLIENT ESTIMATES, with approval workflow
// ============================================================

export interface CreateClientEstimateInput {
  project_id: string;
  title: string;
  /**
   * Estimate currency, follows the project's regional market profile
   * (synced from the project's saved location). When omitted, the
   * database default applies.
   */
  currency?: string;
  description?: string;
  materials_cost: number;
  labour_cost: number;
  transport_cost: number;
  misc_cost: number;
  markup_percentage: number;
  materials_summary: DbClientEstimate["materials_summary"];
  validity_days?: number;
  notes?: string;
  terms_conditions?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  price_snapshot?: Record<string, unknown>;
}

function generateEstimateNumber(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `EST-${ymd}-${rand}`;
}

function generateShareToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

export async function createClientEstimate(
  input: CreateClientEstimateInput,
): Promise<DbClientEstimate> {
  const subtotal =
    input.materials_cost +
    input.labour_cost +
    input.transport_cost +
    input.misc_cost;
  const markupAmount = (subtotal * input.markup_percentage) / 100;
  const grandTotal = subtotal + markupAmount;

  const { data, error } = await supabase
    .from("client_estimates")
    .insert({
      project_id: input.project_id,
      estimate_number: generateEstimateNumber(),
      title: input.title,
      currency: input.currency || undefined,
      description: input.description || null,
      materials_cost: input.materials_cost,
      labour_cost: input.labour_cost,
      transport_cost: input.transport_cost,
      misc_cost: input.misc_cost,
      markup_percentage: input.markup_percentage,
      markup_amount: markupAmount,
      grand_total: grandTotal,
      materials_summary: input.materials_summary,
      validity_days: input.validity_days ?? 30,
      notes: input.notes || null,
      terms_conditions: input.terms_conditions || null,
      client_name: input.client_name || null,
      client_email: input.client_email || null,
      client_phone: input.client_phone || null,
      price_snapshot: input.price_snapshot || {},
      status: "draft",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DbClientEstimate;
}

export async function fetchClientEstimates(
  projectId: string,
): Promise<DbClientEstimate[]> {
  const { data, error } = await supabase
    .from("client_estimates")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as DbClientEstimate[];
}

export async function shareClientEstimate(id: string): Promise<string> {
  const token = generateShareToken();
  const { error } = await supabase
    .from("client_estimates")
    .update({
      share_token: token,
      status: "sent",
      shared_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return token;
}

export async function revokeClientEstimateShare(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_estimates")
    .update({
      share_token: null,
      status: "draft",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Fetch a shared client estimate by its share token.
 *
 * Goes through the `fetch_shared_estimate` SECURITY DEFINER RPC, the
 * public SELECT policy on client_estimates was removed in phase 26
 * because it did not bind access to the token. The RPC validates the
 * token server-side and auto-marks the estimate as viewed.
 */
export async function fetchClientEstimateByToken(
  token: string,
): Promise<DbClientEstimate | null> {
  const { data, error } = await supabase.rpc("fetch_shared_estimate", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as DbClientEstimate;
}

/**
 * Approve a shared estimate. Goes through the
 * `respond_to_client_estimate` RPC (see fetchClientEstimateByToken).
 */
export async function approveClientEstimate(token: string): Promise<void> {
  const { data, error } = await supabase.rpc("respond_to_client_estimate", {
    p_token: token,
    p_action: "approve",
  });
  if (error) throw new Error(error.message);
  const result = data as { ok?: boolean; error?: string };
  if (!result?.ok) {
    throw new Error(result?.error ?? "Could not approve estimate");
  }
}

/**
 * Request changes on a shared estimate. Goes through the
 * `respond_to_client_estimate` RPC (see fetchClientEstimateByToken).
 */
export async function requestEstimateChanges(
  token: string,
  feedback: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("respond_to_client_estimate", {
    p_token: token,
    p_action: "request_changes",
    p_feedback: feedback,
  });
  if (error) throw new Error(error.message);
  const result = data as { ok?: boolean; error?: string };
  if (!result?.ok) {
    throw new Error(result?.error ?? "Could not submit feedback");
  }
}

export async function deleteClientEstimate(id: string): Promise<void> {
  const { error } = await supabase
    .from("client_estimates")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// 6. PAINT COMPARISON
// ============================================================

export async function fetchPaintComparisons(): Promise<DbPaintComparison[]> {
  const { data, error } = await supabase
    .from("paint_comparisons")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as DbPaintComparison[];
}

export async function upsertPaintComparison(
  input: Partial<DbPaintComparison> & { paint_type: string },
): Promise<void> {
  const { error } = await supabase.from("paint_comparisons").upsert(
    {
      paint_type: input.paint_type,
      display_name: input.display_name || input.paint_type,
      description: input.description || null,
      finish: input.finish || null,
      recommended_use: input.recommended_use || null,
      durability: input.durability || null,
      washability: input.washability || null,
      appearance: input.appearance || null,
      product_characteristics: input.product_characteristics || null,
      suitable_areas: input.suitable_areas || null,
      price_range: input.price_range || null,
      sort_order: input.sort_order ?? 0,
      is_active: input.is_active ?? true,
    },
    { onConflict: "paint_type" },
  );
  if (error) throw new Error(error.message);
}

export async function deletePaintComparison(id: string): Promise<void> {
  const { error } = await supabase
    .from("paint_comparisons")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ============================================================
// 7. PROJECT PROGRESS TRACKER
// ============================================================

export async function fetchProjectProgressStages(
  projectId: string,
): Promise<DbProjectProgressStage[]> {
  const { data, error } = await supabase
    .from("project_progress_stages")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as DbProjectProgressStage[];
}

export async function initProjectProgress(
  projectId: string,
  templates: DbProjectStageTemplate[],
): Promise<DbProjectProgressStage[]> {
  const stages = templates.map((t, i) => ({
    project_id: projectId,
    stage_key: t.stage_key,
    stage_name: t.stage_name,
    description: t.description,
    sort_order: t.sort_order || i + 1,
    is_completed: false,
  }));

  const { data, error } = await supabase
    .from("project_progress_stages")
    .insert(stages)
    .select("*");
  if (error) throw new Error(error.message);
  return (data || []) as DbProjectProgressStage[];
}

export async function updateProgressStage(
  id: string,
  updates: { is_completed?: boolean; notes?: string; photo_url?: string },
): Promise<void> {
  const updateData: Record<string, unknown> = { ...updates };
  if (updates.is_completed !== undefined) {
    updateData.completed_at = updates.is_completed
      ? new Date().toISOString()
      : null;
  }
  const { error } = await supabase
    .from("project_progress_stages")
    .update(updateData)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchStageTemplates(): Promise<DbProjectStageTemplate[]> {
  const { data, error } = await supabase
    .from("project_stage_templates")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as DbProjectStageTemplate[];
}

export function calculateProgressPercentage(
  stages: DbProjectProgressStage[],
): number {
  if (!stages.length) return 0;
  const completed = stages.filter((s) => s.is_completed).length;
  return Math.round((completed / stages.length) * 100);
}

// ============================================================
// 8. SURFACE ASSESSMENT
// ============================================================

export interface SurfaceRecommendation {
  recommendation: string;
  priority: "high" | "medium" | "low";
}

const SURFACE_RECOMMENDATIONS: Record<string, SurfaceRecommendation[]> = {
  new_wall: [
    {
      recommendation:
        "Apply a primer/sealer coat before painting to ensure proper adhesion on fresh plaster.",
      priority: "high",
    },
    {
      recommendation:
        "Allow new plaster to cure fully (minimum 28 days) before applying paint.",
      priority: "high",
    },
    {
      recommendation:
        "Check moisture content of the wall, it should be below 15% before painting.",
      priority: "medium",
    },
  ],
  previously_painted: [
    {
      recommendation:
        "Clean the surface thoroughly to remove dust, grease, and contaminants.",
      priority: "high",
    },
    {
      recommendation:
        "Sand glossy surfaces to create a key for the new paint to adhere to.",
      priority: "medium",
    },
    {
      recommendation:
        "Spot-prime any areas where the old paint has been removed or repaired.",
      priority: "medium",
    },
  ],
  smooth: [
    {
      recommendation:
        "No special preparation needed. Clean the surface before painting.",
      priority: "low",
    },
    {
      recommendation:
        "Apply primer if switching between paint types (e.g., oil-based to water-based).",
      priority: "low",
    },
  ],
  rough: [
    {
      recommendation:
        "Sand the surface smooth or apply a skim coat of plaster to level it.",
      priority: "high",
    },
    {
      recommendation:
        "Rough surfaces absorb up to 30% more paint, account for this in your calculations.",
      priority: "high",
    },
    {
      recommendation:
        "Consider using a filler or undercoat to create a smooth base before painting.",
      priority: "medium",
    },
  ],
  dirty: [
    {
      recommendation:
        "Wash the surface with detergent and water. Allow to dry completely before painting.",
      priority: "high",
    },
    {
      recommendation:
        "Use a degreaser for surfaces with oil or grease contamination.",
      priority: "high",
    },
    {
      recommendation:
        "For mould, treat with a bleach solution before painting.",
      priority: "medium",
    },
  ],
  damp: [
    {
      recommendation:
        "Address the source of moisture before any painting work begins. Painting over damp will fail.",
      priority: "high",
    },
    {
      recommendation:
        "Use a damp-proof membrane or waterproofing treatment on the affected area.",
      priority: "high",
    },
    {
      recommendation:
        "Ensure the wall is completely dry (moisture content below 10%) before painting.",
      priority: "high",
    },
    {
      recommendation:
        "Consider using a damp-tolerant paint system after treatment.",
      priority: "medium",
    },
  ],
  cracked: [
    {
      recommendation:
        "Fill cracks with an appropriate crack filler or cementitious repair compound.",
      priority: "high",
    },
    {
      recommendation:
        "For structural cracks, consult a structural engineer before proceeding.",
      priority: "high",
    },
    {
      recommendation:
        "Apply fibre mesh over wider cracks to prevent recurrence.",
      priority: "medium",
    },
    {
      recommendation: "Prime repaired areas before applying the topcoat.",
      priority: "medium",
    },
  ],
};

export function getSurfaceRecommendations(
  condition: string,
): SurfaceRecommendation[] {
  return SURFACE_RECOMMENDATIONS[condition] || [];
}

export async function createSurfaceAssessment(input: {
  project_id?: string;
  surface_condition: DbSurfaceAssessment["surface_condition"];
  surface_type?: string;
  room_name?: string;
  notes?: string;
}): Promise<DbSurfaceAssessment> {
  const recommendations = getSurfaceRecommendations(input.surface_condition);
  const { data, error } = await supabase
    .from("surface_assessments")
    .insert({
      project_id: input.project_id || null,
      surface_condition: input.surface_condition,
      surface_type: input.surface_type || null,
      room_name: input.room_name || null,
      notes: input.notes || null,
      recommendations,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DbSurfaceAssessment;
}

export async function fetchSurfaceAssessments(
  projectId?: string,
): Promise<DbSurfaceAssessment[]> {
  let query = supabase
    .from("surface_assessments")
    .select("*")
    .order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as DbSurfaceAssessment[];
}

// ============================================================
// AI PROJECT ASSISTANT, guidance logic
// ============================================================

export interface AiProjectGuidance {
  understanding: string;
  missingInfo: string[];
  recommendations: Array<{
    action: string;
    calculator_slug: string;
    label: string;
  }>;
  materialsNeeded: string[];
  workflow: string[];
}

export function analyzeProjectDescription(input: string): AiProjectGuidance {
  const lower = input.toLowerCase();
  const missingInfo: string[] = [];
  const recommendations: AiProjectGuidance["recommendations"] = [];
  const materialsNeeded: string[] = [];
  const workflow: string[] = [];

  // Detect paint types mentioned
  const hasMatt = lower.includes("matt") || lower.includes("matte");
  const hasSatin = lower.includes("satin");
  const hasEmulsion = lower.includes("emulsion");
  const hasTyrolene = lower.includes("tyrolene") || lower.includes("exterior");

  // Detect project scope
  const hasBedroom = lower.includes("bedroom");
  const hasLivingRoom =
    lower.includes("living room") || lower.includes("sitting room");
  const hasKitchen = lower.includes("kitchen");
  const hasBathroom = lower.includes("bathroom") || lower.includes("toilet");
  const hasOutside =
    lower.includes("outside") ||
    lower.includes("exterior") ||
    lower.includes("outdoor");

  // Detect measurements
  const hasMeasurements = /\d+\s*(m|meter|metre|ft|feet|sq|square)/.test(lower);
  const _hasRoomCount = /(\d+)\s*bedroom|(\d+)\s*room/.test(lower);

  // Build understanding
  let understanding = "I can see this is a ";
  const parts: string[] = [];
  if (hasMatt) parts.push("Matt paint");
  if (hasSatin) parts.push("Satin paint");
  if (hasEmulsion) parts.push("Emulsion");
  if (hasTyrolene) parts.push("Tyrolene for exterior");
  understanding += parts.length
    ? parts.join(", ") + " project"
    : "painting project";

  if (hasBedroom) understanding += " involving bedrooms";
  if (hasLivingRoom) understanding += ", living room";
  if (hasKitchen) understanding += ", kitchen";
  if (hasBathroom) understanding += ", bathroom";
  if (hasOutside) understanding += ", and exterior walls";

  // Identify missing info
  if (!hasMeasurements) {
    missingInfo.push(
      "Room dimensions (length, width, height in meters or feet)",
    );
  }
  if (hasTyrolene && !hasOutside) {
    missingInfo.push("Exterior wall area for Tyrolene application");
  }
  if (
    !lower.includes("quality") &&
    !lower.includes("premium") &&
    !lower.includes("budget")
  ) {
    missingInfo.push(
      "Preferred paint quality level (economy, standard, premium, or luxury)",
    );
  }
  if (
    !lower.includes("condition") &&
    !lower.includes("new wall") &&
    !lower.includes("old")
  ) {
    missingInfo.push(
      "Surface condition (new wall, previously painted, cracked, etc.)",
    );
  }

  // Recommend calculators
  if (hasMatt || hasSatin || hasEmulsion) {
    recommendations.push({
      action: "Calculate interior paint requirements",
      calculator_slug: "paint-calculator",
      label: "Paint Calculator",
    });
    materialsNeeded.push(
      "Primer",
      "Paint (selected types)",
      "Brushes and rollers",
      "Sandpaper",
      "Masking tape",
    );
  }

  if (hasTyrolene || hasOutside) {
    recommendations.push({
      action: "Calculate exterior Tyrolene requirements",
      calculator_slug: "tyrolene-estimator",
      label: "Tyrolene Estimator",
    });
    materialsNeeded.push(
      "Tyrolene paint",
      "Primer for exterior",
      "Roller or spray equipment",
    );
  }

  if (lower.includes("screeding") || lower.includes("screed")) {
    recommendations.push({
      action: "Calculate screeding materials",
      calculator_slug: "screeding-calculator",
      label: "Screeding Calculator",
    });
    materialsNeeded.push("Cement", "Sand", "Screeding paint", "White cement");
  }

  if (lower.includes("pop") || lower.includes("ceiling")) {
    recommendations.push({
      action: "Calculate POP ceiling materials",
      calculator_slug: "pop-ceiling-calculator",
      label: "POP Ceiling Calculator",
    });
    materialsNeeded.push(
      "POP boards",
      "Jointing compound",
      "GI channels",
      "Screws",
    );
  }

  if (lower.includes("tile") || lower.includes("tiling")) {
    recommendations.push({
      action: "Calculate tile quantities",
      calculator_slug: "tile-calculator",
      label: "Tile Calculator",
    });
    materialsNeeded.push("Tiles", "Tile adhesive", "Grout", "Tile spacers");
  }

  // Build workflow
  workflow.push("Create a project in the Project Workspace");
  workflow.push("Assess surface conditions for each room");
  workflow.push("Run the recommended calculators with your room dimensions");
  workflow.push("Review and save calculations to your project");
  workflow.push("Generate a shopping list from your calculations");
  workflow.push("Create a client estimate if needed");
  workflow.push("Track progress through each project stage");

  return {
    understanding,
    missingInfo,
    recommendations,
    materialsNeeded,
    workflow,
  };
}
