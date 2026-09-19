/**
 * Contractor Experience, Core library functions
 * Project CRUD, room aggregation, shopping list generation, labour planning,
 * quotation generation, timeline calculation, weather intelligence,
 * waste factor intelligence, surface assessment, material recommendations.
 */
import { supabase } from "@/lib/supabase";
import type {
  DbContractorProject,
  DbProjectRoom,
  DbProjectShoppingItem,
  DbProjectLabourPlan,
  DbProjectQuotation,
  DbProjectTimeline,
  DbProjectAttachment,
  DbProjectVersion,
  DbMaterialCatalog,
  DbTimelineTemplate,
  DbQuotationSettings,
  SurfacePrepStep,
  SurfaceCondition,
  SurfaceType,
  WallSmoothness,
  Porosity,
  ProjectType,
  FinishQuality,
  RoomType,
  RoomCalcType,
  ShoppingCategory,
  LabourRole,
  TimelinePhase,
} from "@/types/database";

// ============================================================
// PROJECT CRUD
// ============================================================

export interface CreateProjectInput {
  name: string;
  description?: string;
  project_type: ProjectType;
  building_type?: string;
  surface_location?: string;
  construction_type?: string;
  finish_quality?: FinishQuality;
  budget_level?: string;
  material_quality?: FinishQuality;
  client_name?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  notes?: string;
  tags?: string[];
}

export async function createContractorProject(
  input: CreateProjectInput,
): Promise<DbContractorProject> {
  const { data, error } = await supabase
    .from("contractor_projects")
    .insert({
      name: input.name,
      description: input.description ?? null,
      project_type: input.project_type,
      building_type: input.building_type ?? "residential",
      surface_location: input.surface_location ?? "interior",
      construction_type: input.construction_type ?? "renovation",
      finish_quality: input.finish_quality ?? "standard",
      budget_level: input.budget_level ?? "standard",
      material_quality: input.material_quality ?? "standard",
      client_name: input.client_name ?? null,
      client_phone: input.client_phone ?? null,
      client_email: input.client_email ?? null,
      client_address: input.client_address ?? null,
      notes: input.notes ?? null,
      tags: input.tags ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return data as DbContractorProject;
}

export async function fetchContractorProjects(): Promise<
  DbContractorProject[]
> {
  const { data, error } = await supabase
    .from("contractor_projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return (data ?? []) as DbContractorProject[];
}

export async function fetchContractorProject(
  id: string,
): Promise<DbContractorProject | null> {
  const { data, error } = await supabase
    .from("contractor_projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch project: ${error.message}`);
  return data as DbContractorProject | null;
}

export async function updateContractorProject(
  id: string,
  updates: Partial<DbContractorProject>,
): Promise<DbContractorProject> {
  const { data, error } = await supabase
    .from("contractor_projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update project: ${error.message}`);
  return data as DbContractorProject;
}

export async function deleteContractorProject(id: string): Promise<void> {
  const { error } = await supabase
    .from("contractor_projects")
    .delete()
    .eq("id", id);

  if (error) throw new Error(`Failed to delete project: ${error.message}`);
}

export async function duplicateContractorProject(
  id: string,
): Promise<DbContractorProject> {
  const project = await fetchContractorProject(id);
  if (!project) throw new Error("Project not found");

  const { name, ...rest } = project;
  const { data, error } = await supabase
    .from("contractor_projects")
    .insert({
      ...rest,
      name: `${name} (Copy)`,
      status: "draft",
      progress_percentage: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to duplicate project: ${error.message}`);

  // Also duplicate rooms
  const rooms = await fetchProjectRooms(id);
  for (const room of rooms) {
    await supabase.from("project_rooms").insert({
      project_id: (data as DbContractorProject).id,
      name: room.name,
      room_type: room.room_type,
      sort_order: room.sort_order,
      length_m: room.length_m,
      width_m: room.width_m,
      height_m: room.height_m,
      unit: room.unit,
      surface_condition: room.surface_condition,
      surface_type: room.surface_type,
      wall_smoothness: room.wall_smoothness,
      porosity: room.porosity,
      waste_factor_percentage: room.waste_factor_percentage,
      calculation_type: room.calculation_type,
      calculation_input: room.calculation_input,
      calculation_result: room.calculation_result,
      material_cost: room.material_cost,
      labour_cost: room.labour_cost,
      room_total_cost: room.room_total_cost,
      surface_prep: room.surface_prep,
    });
  }

  return data as DbContractorProject;
}

export async function archiveContractorProject(id: string): Promise<void> {
  await updateContractorProject(id, { status: "archived" });
}

export async function restoreContractorProject(id: string): Promise<void> {
  await updateContractorProject(id, { status: "draft" });
}

// ============================================================
// ROOM CRUD
// ============================================================

export interface CreateRoomInput {
  project_id: string;
  name: string;
  room_type: RoomType;
  length_m?: number;
  width_m?: number;
  height_m?: number;
  unit?: "meters" | "feet";
  surface_condition?: SurfaceCondition;
  surface_type?: SurfaceType;
  wall_smoothness?: WallSmoothness;
  porosity?: Porosity;
  calculation_type?: RoomCalcType;
  calculation_input?: Record<string, unknown>;
  calculation_result?: Record<string, unknown>;
}

export async function fetchProjectRooms(
  projectId: string,
): Promise<DbProjectRoom[]> {
  const { data, error } = await supabase
    .from("project_rooms")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch rooms: ${error.message}`);
  return (data ?? []) as DbProjectRoom[];
}

export async function createProjectRoom(
  input: CreateRoomInput,
): Promise<DbProjectRoom> {
  const wasteFactor = calculateWasteFactor(
    input.surface_condition ?? "good",
    input.surface_type ?? "fresh_plaster",
    input.wall_smoothness ?? "smooth",
    input.porosity ?? "medium",
  );

  const surfacePrep = assessSurface(
    input.surface_type ?? "fresh_plaster",
    input.surface_condition ?? "good",
  );

  const { data, error } = await supabase
    .from("project_rooms")
    .insert({
      project_id: input.project_id,
      name: input.name,
      room_type: input.room_type,
      sort_order: Date.now(),
      length_m: input.length_m ?? null,
      width_m: input.width_m ?? null,
      height_m: input.height_m ?? null,
      unit: input.unit ?? "meters",
      surface_condition: input.surface_condition ?? "good",
      surface_type: input.surface_type ?? "fresh_plaster",
      wall_smoothness: input.wall_smoothness ?? "smooth",
      porosity: input.porosity ?? "medium",
      waste_factor_percentage: wasteFactor,
      calculation_type: input.calculation_type ?? "paint",
      calculation_input: input.calculation_input ?? {},
      calculation_result: input.calculation_result ?? {},
      surface_prep: surfacePrep,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create room: ${error.message}`);
  return data as DbProjectRoom;
}

export async function updateProjectRoom(
  id: string,
  updates: Partial<DbProjectRoom>,
): Promise<DbProjectRoom> {
  // Recalculate waste factor if surface assessment changed
  if (
    updates.surface_condition ||
    updates.surface_type ||
    updates.wall_smoothness ||
    updates.porosity
  ) {
    const { data: current } = await supabase
      .from("project_rooms")
      .select("*")
      .eq("id", id)
      .single();

    const room = current as DbProjectRoom;
    updates.waste_factor_percentage = calculateWasteFactor(
      updates.surface_condition ?? room.surface_condition,
      updates.surface_type ?? room.surface_type,
      updates.wall_smoothness ?? room.wall_smoothness,
      updates.porosity ?? room.porosity,
    );
    updates.surface_prep = assessSurface(
      updates.surface_type ?? room.surface_type,
      updates.surface_condition ?? room.surface_condition,
    );
  }

  const { data, error } = await supabase
    .from("project_rooms")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update room: ${error.message}`);
  return data as DbProjectRoom;
}

export async function deleteProjectRoom(id: string): Promise<void> {
  const { error } = await supabase.from("project_rooms").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete room: ${error.message}`);
}

// ============================================================
// AGGREGATE PROJECT TOTALS
// ============================================================

export async function recalculateProjectTotals(
  projectId: string,
): Promise<DbContractorProject> {
  const rooms = await fetchProjectRooms(projectId);
  const labourPlan = await fetchLabourPlan(projectId);

  const totalMaterialCost = rooms.reduce((sum, r) => sum + r.material_cost, 0);
  const totalLabourCost =
    rooms.reduce((sum, r) => sum + r.labour_cost, 0) +
    labourPlan.reduce((sum, l) => sum + l.total_cost, 0);

  return updateContractorProject(projectId, {
    total_material_cost: totalMaterialCost,
    total_labour_cost: totalLabourCost,
    total_project_cost: totalMaterialCost + totalLabourCost,
  });
}

// ============================================================
// WASTE FACTOR INTELLIGENCE
// ============================================================

export function calculateWasteFactor(
  condition: SurfaceCondition,
  surfaceType: SurfaceType,
  smoothness: WallSmoothness,
  porosity: Porosity,
): number {
  let base = 10; // 10% default

  // Surface condition adjustment
  switch (condition) {
    case "excellent":
      base -= 2;
      break;
    case "good":
      break;
    case "fair":
      base += 5;
      break;
    case "poor":
      base += 10;
      break;
    case "damaged":
      base += 15;
      break;
  }

  // Surface type adjustment
  switch (surfaceType) {
    case "fresh_plaster":
      break; // baseline
    case "old_paint":
      base += 3;
      break;
    case "peeling_paint":
      base += 8;
      break;
    case "moisture":
      base += 10;
      break;
    case "cracks":
      base += 7;
      break;
    case "mould":
      base += 12;
      break;
    case "concrete":
      base += 5;
      break;
    case "wood":
      base += 2;
      break;
    case "metal":
      break;
  }

  // Smoothness adjustment
  switch (smoothness) {
    case "smooth":
      break;
    case "slightly_rough":
      base += 2;
      break;
    case "rough":
      base += 5;
      break;
    case "very_rough":
      base += 8;
      break;
  }

  // Porosity adjustment
  switch (porosity) {
    case "low":
      break;
    case "medium":
      base += 2;
      break;
    case "high":
      base += 5;
      break;
    case "very_high":
      base += 8;
      break;
  }

  return Math.max(5, Math.min(50, base));
}

// ============================================================
// SURFACE ASSESSMENT
// ============================================================

export function assessSurface(
  surfaceType: SurfaceType,
  condition: SurfaceCondition,
): SurfacePrepStep[] {
  const steps: SurfacePrepStep[] = [];

  switch (surfaceType) {
    case "fresh_plaster":
      steps.push({
        action: "Apply sealer primer",
        reason:
          "Fresh plaster is highly porous and needs a sealer coat to prevent paint absorption",
        product: "Universal Primer",
        priority: "required",
      });
      break;

    case "old_paint":
      if (condition === "good") {
        steps.push({
          action: "Light sanding and clean surface",
          reason: "Create a key for new paint adhesion",
          product: "Sandpaper (120-grit)",
          priority: "recommended",
        });
      } else {
        steps.push({
          action: "Scrape loose paint and sand surface",
          reason: "Remove failing paint layers for proper adhesion",
          product: "Scraper, Sandpaper (80-grit)",
          priority: "required",
        });
        steps.push({
          action: "Fill damaged areas",
          reason: "Repair surface imperfections after scraping",
          product: "Filler / Putty",
          priority: "required",
        });
      }
      break;

    case "peeling_paint":
      steps.push({
        action: "Scrape all peeling paint",
        reason: "Remove all loose paint to bare surface",
        product: "Wire brush, Scraper",
        priority: "required",
      });
      steps.push({
        action: "Sand edges of scraped areas",
        reason: "Feather edges for smooth transition",
        product: "Sandpaper (80-120 grit)",
        priority: "required",
      });
      steps.push({
        action: "Apply filler to damaged areas",
        reason: "Restore surface to even finish",
        product: "Filler / Putty",
        priority: "required",
      });
      steps.push({
        action: "Apply primer before painting",
        reason: "Seal repaired areas for uniform paint absorption",
        product: "Primer",
        priority: "required",
      });
      break;

    case "moisture":
      steps.push({
        action: "Identify and fix moisture source",
        reason: "Painting over moisture will cause failure",
        product: "Damp inspection",
        priority: "required",
      });
      steps.push({
        action: "Allow surface to fully dry",
        reason: "Moisture content must be below 15% before painting",
        product: "Moisture meter",
        priority: "required",
      });
      steps.push({
        action: "Apply moisture-resistant primer",
        reason: "Create a barrier against residual moisture",
        product: "Moisture-resistant Primer",
        priority: "required",
      });
      break;

    case "cracks":
      steps.push({
        action: "Widen cracks with utility knife",
        reason: "Open cracks for proper filler penetration",
        product: "Utility knife",
        priority: "required",
      });
      steps.push({
        action: "Fill cracks with appropriate filler",
        reason: "Restore structural surface integrity",
        product: "Crack filler / Cement-based filler",
        priority: "required",
      });
      steps.push({
        action: "Sand filled areas smooth",
        reason: "Create even surface for painting",
        product: "Sandpaper (120-grit)",
        priority: "recommended",
      });
      break;

    case "mould":
      steps.push({
        action: "Treat mould with bleach solution",
        reason: "Kill mould spores to prevent regrowth",
        product: "Bleach solution (1:3 ratio)",
        priority: "required",
      });
      steps.push({
        action: "Scrub and clean surface",
        reason: "Remove all mould residue",
        product: "Stiff brush, Detergent",
        priority: "required",
      });
      steps.push({
        action: "Apply anti-mould primer",
        reason: "Prevent mould from returning through paint",
        product: "Anti-mould Primer",
        priority: "required",
      });
      break;

    case "concrete":
      steps.push({
        action: "Acid etch or mechanically prepare surface",
        reason: "Open concrete pores for paint adhesion",
        product: "Acid etch solution",
        priority: "recommended",
      });
      steps.push({
        action: "Apply masonry primer",
        reason: "Seal concrete and provide uniform base",
        product: "Masonry Primer",
        priority: "required",
      });
      break;

    case "wood":
      steps.push({
        action: "Sand wood surface",
        reason: "Smooth surface and open grain for finish",
        product: "Sandpaper (120-180 grit)",
        priority: "required",
      });
      steps.push({
        action: "Apply wood primer",
        reason: "Seal wood grain and prevent tannin bleed",
        product: "Wood Primer",
        priority: "required",
      });
      break;

    case "metal":
      steps.push({
        action: "Remove rust with wire brush",
        reason: "Prevent rust from spreading under paint",
        product: "Wire brush, Rust remover",
        priority: "required",
      });
      steps.push({
        action: "Apply metal primer",
        reason: "Prevent corrosion and ensure adhesion",
        product: "Metal Primer / Red oxide primer",
        priority: "required",
      });
      break;
  }

  return steps;
}

// ============================================================
// SHOPPING LIST GENERATION
// ============================================================

export interface ShoppingListInput {
  rooms: DbProjectRoom[];
  projectType: ProjectType;
  finishQuality: FinishQuality;
  currency: string;
  currencySymbol: string;
}

export async function generateShoppingList(
  input: ShoppingListInput,
): Promise<DbProjectShoppingItem[]> {
  const items: Omit<
    DbProjectShoppingItem,
    "id" | "project_id" | "created_at" | "updated_at"
  >[] = [];

  for (const room of input.rooms) {
    const result = room.calculation_result as Record<string, unknown>;

    if (room.calculation_type === "paint") {
      // Paint
      const paintLiters = (result.totalRecommendedLiters ??
        result.adjustedLiters ??
        0) as number;
      if (paintLiters > 0) {
        const pricePerLiter = await getMaterialPrice(
          "paint",
          input.finishQuality,
        );
        items.push({
          category: "paint",
          name: `Paint (${room.name})`,
          quantity: Math.ceil(paintLiters),
          unit: "liters",
          estimated_price: pricePerLiter,
          total_price: Math.ceil(paintLiters) * pricePerLiter,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }

      // Primer
      const primerLiters = (result.primerLiters ??
        (result.paintableArea as number) / 12) as number;
      if (primerLiters > 0) {
        const primerPrice = await getMaterialPrice(
          "primer",
          input.finishQuality,
        );
        items.push({
          category: "primer",
          name: `Primer (${room.name})`,
          quantity: Math.ceil(primerLiters),
          unit: "liters",
          estimated_price: primerPrice,
          total_price: Math.ceil(primerLiters) * primerPrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }

      // Accessories based on surface prep
      const prep = room.surface_prep;
      if (
        prep.some(
          (s) => s.product?.includes("Filler") || s.product?.includes("Putty"),
        )
      ) {
        const fillerPrice = await getMaterialPrice(
          "accessories",
          input.finishQuality,
        );
        items.push({
          category: "accessories",
          name: `Filler / Putty (${room.name})`,
          quantity: 1,
          unit: "pack",
          estimated_price: fillerPrice,
          total_price: fillerPrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }
      if (
        prep.some((s) => s.action.includes("sand") || s.action.includes("Sand"))
      ) {
        const sandpaperPrice = await getMaterialPrice(
          "sandpaper",
          input.finishQuality,
        );
        items.push({
          category: "sandpaper",
          name: `Sandpaper (${room.name})`,
          quantity: 1,
          unit: "pack",
          estimated_price: sandpaperPrice,
          total_price: sandpaperPrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }
    }

    if (room.calculation_type === "screeding") {
      // Screeding paint
      const paintBuckets = (result.paintBuckets ?? 0) as number;
      if (paintBuckets > 0) {
        const price = await getMaterialPrice(
          "screeding_paint",
          input.finishQuality,
        );
        items.push({
          category: "screeding_paint",
          name: `Screeding Paint (${room.name})`,
          quantity: paintBuckets,
          unit: "buckets",
          estimated_price: price,
          total_price: paintBuckets * price,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }

      // White cement
      const cementBags = (result.cementBags ?? 0) as number;
      if (cementBags > 0) {
        const price = await getMaterialPrice(
          "white_cement",
          input.finishQuality,
        );
        items.push({
          category: "white_cement",
          name: `White Cement (${room.name})`,
          quantity: cementBags,
          unit: "bags",
          estimated_price: price,
          total_price: cementBags * price,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }
    }

    if (room.calculation_type === "pop_ceiling") {
      const materials = (result.materials ?? []) as Array<{
        name: string;
        packages: number;
        unitPrice: number;
      }>;
      for (const mat of materials) {
        const category = mat.name.toLowerCase().includes("cement")
          ? "pop_cement"
          : mat.name.toLowerCase().includes("fibre")
            ? "fibre"
            : mat.name.toLowerCase().includes("board")
              ? "boards"
              : "accessories";
        items.push({
          category: category as ShoppingCategory,
          name: `${mat.name} (${room.name})`,
          quantity: mat.packages,
          unit: "units",
          estimated_price: mat.unitPrice,
          total_price: mat.packages * mat.unitPrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }
    }

    if (room.calculation_type === "tiling") {
      const boxesNeeded = (result.boxesNeeded ?? 0) as number;
      if (boxesNeeded > 0) {
        const tilePrice = await getMaterialPrice("tiles", input.finishQuality);
        items.push({
          category: "tiles",
          name: `Tiles (${room.name})`,
          quantity: boxesNeeded,
          unit: "boxes",
          estimated_price: tilePrice,
          total_price: boxesNeeded * tilePrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }

      const adhesiveNeeded = (result.adhesiveNeeded ?? 0) as number;
      if (adhesiveNeeded > 0) {
        const adhesivePrice = await getMaterialPrice(
          "tile_adhesive",
          input.finishQuality,
        );
        items.push({
          category: "tile_adhesive",
          name: `Tile Adhesive (${room.name})`,
          quantity: adhesiveNeeded,
          unit: "bags",
          estimated_price: adhesivePrice,
          total_price: adhesiveNeeded * adhesivePrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }

      const groutNeeded = (result.groutNeeded ?? 0) as number;
      if (groutNeeded > 0) {
        const groutPrice = await getMaterialPrice("grout", input.finishQuality);
        items.push({
          category: "grout",
          name: `Grout (${room.name})`,
          quantity: groutNeeded,
          unit: "kg",
          estimated_price: groutPrice,
          total_price: groutNeeded * groutPrice,
          notes: null,
          is_purchased: false,
          sort_order: items.length,
        });
      }
    }
  }

  // Add common accessories
  const brushPrice = await getMaterialPrice("brushes", input.finishQuality);
  items.push({
    category: "brushes",
    name: "Paint Brush Set",
    quantity: 1,
    unit: "set",
    estimated_price: brushPrice,
    total_price: brushPrice,
    notes: null,
    is_purchased: false,
    sort_order: items.length,
  });

  const rollerPrice = await getMaterialPrice("rollers", input.finishQuality);
  items.push({
    category: "rollers",
    name: "Paint Roller Set",
    quantity: 1,
    unit: "set",
    estimated_price: rollerPrice,
    total_price: rollerPrice,
    notes: null,
    is_purchased: false,
    sort_order: items.length,
  });

  const tapePrice = await getMaterialPrice("masking_tape", input.finishQuality);
  items.push({
    category: "masking_tape",
    name: "Masking Tape",
    quantity: Math.ceil(input.rooms.length / 3),
    unit: "rolls",
    estimated_price: tapePrice,
    total_price: Math.ceil(input.rooms.length / 3) * tapePrice,
    notes: null,
    is_purchased: false,
    sort_order: items.length,
  });

  const ppePrice = await getMaterialPrice("ppe", input.finishQuality);
  items.push({
    category: "ppe",
    name: "PPE Kit (Gloves, Goggles, Mask)",
    quantity: 1,
    unit: "set",
    estimated_price: ppePrice,
    total_price: ppePrice,
    notes: null,
    is_purchased: false,
    sort_order: items.length,
  });

  return items as DbProjectShoppingItem[];
}

export async function saveShoppingList(
  projectId: string,
  items: Omit<
    DbProjectShoppingItem,
    "id" | "project_id" | "created_at" | "updated_at"
  >[],
): Promise<DbProjectShoppingItem[]> {
  // Delete existing items
  await supabase
    .from("project_shopping_list")
    .delete()
    .eq("project_id", projectId);

  // Insert new items
  const rows = items.map((item, index) => ({
    ...item,
    project_id: projectId,
    sort_order: index,
  }));

  const { data, error } = await supabase
    .from("project_shopping_list")
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to save shopping list: ${error.message}`);
  return (data ?? []) as DbProjectShoppingItem[];
}

export async function fetchShoppingList(
  projectId: string,
): Promise<DbProjectShoppingItem[]> {
  const { data, error } = await supabase
    .from("project_shopping_list")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch shopping list: ${error.message}`);
  return (data ?? []) as DbProjectShoppingItem[];
}

export async function updateShoppingItem(
  id: string,
  updates: Partial<DbProjectShoppingItem>,
): Promise<void> {
  const { error } = await supabase
    .from("project_shopping_list")
    .update(updates)
    .eq("id", id);
  if (error)
    throw new Error(`Failed to update shopping item: ${error.message}`);
}

// ============================================================
// MATERIAL PRICE LOOKUP
// ============================================================

const materialPriceCache = new Map<string, number>();

export async function getMaterialPrice(
  category: string,
  qualityTier: FinishQuality,
): Promise<number> {
  const cacheKey = `${category}:${qualityTier}`;
  if (materialPriceCache.has(cacheKey)) {
    return materialPriceCache.get(cacheKey)!;
  }

  const { data } = await supabase
    .from("material_catalog")
    .select("economy_price, standard_price, premium_price, luxury_price")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  let price = 0;
  if (data) {
    switch (qualityTier) {
      case "economy":
        price = data.economy_price;
        break;
      case "standard":
        price = data.standard_price;
        break;
      case "premium":
        price = data.premium_price;
        break;
      case "luxury":
        price = data.luxury_price;
        break;
    }
  }

  materialPriceCache.set(cacheKey, price);
  return price;
}

// ============================================================
// LABOUR PLAN CRUD
// ============================================================

export async function fetchLabourPlan(
  projectId: string,
): Promise<DbProjectLabourPlan[]> {
  const { data, error } = await supabase
    .from("project_labour_plan")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch labour plan: ${error.message}`);
  return (data ?? []) as DbProjectLabourPlan[];
}

export async function createLabourPlanItem(
  projectId: string,
  role: LabourRole,
  workerCount: number,
  daysRequired: number,
  dailyWage: number,
  notes?: string,
): Promise<DbProjectLabourPlan> {
  const { data, error } = await supabase
    .from("project_labour_plan")
    .insert({
      project_id: projectId,
      role,
      worker_count: workerCount,
      days_required: daysRequired,
      daily_wage: dailyWage,
      total_cost: workerCount * daysRequired * dailyWage,
      notes: notes ?? null,
      sort_order: Date.now(),
    })
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create labour plan item: ${error.message}`);
  return data as DbProjectLabourPlan;
}

export async function updateLabourPlanItem(
  id: string,
  updates: Partial<DbProjectLabourPlan>,
): Promise<void> {
  if (updates.worker_count || updates.days_required || updates.daily_wage) {
    const { data: current } = await supabase
      .from("project_labour_plan")
      .select("*")
      .eq("id", id)
      .single();

    const item = current as DbProjectLabourPlan;
    const wc = updates.worker_count ?? item.worker_count;
    const dr = updates.days_required ?? item.days_required;
    const dw = updates.daily_wage ?? item.daily_wage;
    updates.total_cost = wc * dr * dw;
  }

  const { error } = await supabase
    .from("project_labour_plan")
    .update(updates)
    .eq("id", id);
  if (error)
    throw new Error(`Failed to update labour plan item: ${error.message}`);
}

export async function deleteLabourPlanItem(id: string): Promise<void> {
  const { error } = await supabase
    .from("project_labour_plan")
    .delete()
    .eq("id", id);
  if (error)
    throw new Error(`Failed to delete labour plan item: ${error.message}`);
}

// ============================================================
// LABOUR PLAN AUTO-GENERATION
// ============================================================

export function generateDefaultLabourPlan(
  projectType: ProjectType,
  totalArea: number,
  _currencySymbol: string,
): Array<{
  role: LabourRole;
  workerCount: number;
  daysRequired: number;
  dailyWage: number;
}> {
  const areaFactor = Math.max(1, Math.ceil(totalArea / 50));

  switch (projectType) {
    case "painting":
      return [
        {
          role: "painter",
          workerCount: Math.ceil(areaFactor * 2),
          daysRequired: areaFactor * 2,
          dailyWage: 5000,
        },
        {
          role: "labourer",
          workerCount: 1,
          daysRequired: areaFactor * 2,
          dailyWage: 3000,
        },
        {
          role: "foreman",
          workerCount: 1,
          daysRequired: areaFactor,
          dailyWage: 8000,
        },
      ];

    case "screeding":
      return [
        {
          role: "wall_screeder",
          workerCount: Math.ceil(areaFactor * 2),
          daysRequired: areaFactor * 3,
          dailyWage: 4000,
        },
        {
          role: "labourer",
          workerCount: 1,
          daysRequired: areaFactor * 3,
          dailyWage: 3000,
        },
        {
          role: "foreman",
          workerCount: 1,
          daysRequired: areaFactor,
          dailyWage: 8000,
        },
      ];

    case "pop_ceiling":
      return [
        {
          role: "pop_installer",
          workerCount: Math.ceil(areaFactor * 3),
          daysRequired: areaFactor * 4,
          dailyWage: 6000,
        },
        {
          role: "labourer",
          workerCount: 2,
          daysRequired: areaFactor * 4,
          dailyWage: 3000,
        },
        {
          role: "foreman",
          workerCount: 1,
          daysRequired: areaFactor * 2,
          dailyWage: 10000,
        },
      ];

    case "tiling":
      return [
        {
          role: "tile_installer",
          workerCount: Math.ceil(areaFactor * 2),
          daysRequired: areaFactor * 3,
          dailyWage: 5000,
        },
        {
          role: "labourer",
          workerCount: 1,
          daysRequired: areaFactor * 3,
          dailyWage: 3000,
        },
        {
          role: "foreman",
          workerCount: 1,
          daysRequired: areaFactor,
          dailyWage: 8000,
        },
      ];

    case "multi_trade":
      return [
        {
          role: "painter",
          workerCount: Math.ceil(areaFactor * 2),
          daysRequired: areaFactor * 2,
          dailyWage: 5000,
        },
        {
          role: "wall_screeder",
          workerCount: Math.ceil(areaFactor),
          daysRequired: areaFactor * 2,
          dailyWage: 4000,
        },
        {
          role: "pop_installer",
          workerCount: Math.ceil(areaFactor),
          daysRequired: areaFactor * 3,
          dailyWage: 6000,
        },
        {
          role: "tile_installer",
          workerCount: Math.ceil(areaFactor),
          daysRequired: areaFactor * 2,
          dailyWage: 5000,
        },
        {
          role: "labourer",
          workerCount: 2,
          daysRequired: areaFactor * 4,
          dailyWage: 3000,
        },
        {
          role: "foreman",
          workerCount: 1,
          daysRequired: areaFactor * 3,
          dailyWage: 10000,
        },
        {
          role: "supervisor",
          workerCount: 1,
          daysRequired: areaFactor,
          dailyWage: 12000,
        },
      ];
  }
}

// ============================================================
// QUOTATION GENERATION
// ============================================================

export async function fetchQuotationSettings(): Promise<DbQuotationSettings | null> {
  const { data, error } = await supabase
    .from("quotation_settings")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  if (error)
    throw new Error(`Failed to fetch quotation settings: ${error.message}`);
  return data as DbQuotationSettings | null;
}

export async function updateQuotationSettings(
  id: string,
  updates: Partial<DbQuotationSettings>,
): Promise<void> {
  const { error } = await supabase
    .from("quotation_settings")
    .update(updates)
    .eq("id", id);
  if (error)
    throw new Error(`Failed to update quotation settings: ${error.message}`);
}

export async function generateQuotation(
  projectId: string,
  options?: {
    markupPercentage?: number;
    profitPercentage?: number;
    taxPercentage?: number;
    transportCost?: number;
    miscCost?: number;
    termsConditions?: string;
    paymentTerms?: string;
    validityDays?: number;
  },
): Promise<DbProjectQuotation> {
  const project = await fetchContractorProject(projectId);
  if (!project) throw new Error("Project not found");

  const settings = await fetchQuotationSettings();
  const markup =
    options?.markupPercentage ?? settings?.default_markup_percentage ?? 15;
  const profit =
    options?.profitPercentage ?? settings?.default_profit_percentage ?? 10;
  const tax = options?.taxPercentage ?? settings?.default_tax_percentage ?? 7.5;
  const transport = options?.transportCost ?? project.total_transport_cost;
  const misc = options?.miscCost ?? project.total_misc_cost;

  const materialCost = project.total_material_cost;
  const labourCost = project.total_labour_cost;

  const subtotal = materialCost + labourCost + transport + misc;
  const markupAmount = subtotal * (markup / 100);
  const preProfit = subtotal + markupAmount;
  const profitAmount = preProfit * (profit / 100);
  const preTax = preProfit + profitAmount;
  const taxAmount = preTax * (tax / 100);
  const grandTotal = preTax + taxAmount;

  // Generate quotation number
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  const quotationNumber = `QT-${dateStr}-${random}`;

  const { data, error } = await supabase
    .from("project_quotations")
    .insert({
      project_id: projectId,
      quotation_number: quotationNumber,
      version: 1,
      material_cost: materialCost,
      labour_cost: labourCost,
      transport_cost: transport,
      misc_cost: misc,
      markup_percentage: markup,
      markup_amount: markupAmount,
      profit_percentage: profit,
      profit_amount: profitAmount,
      tax_percentage: tax,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      terms_conditions:
        options?.termsConditions ?? settings?.default_terms_conditions ?? null,
      payment_terms:
        options?.paymentTerms ?? settings?.default_payment_terms ?? null,
      validity_days:
        options?.validityDays ?? settings?.default_validity_days ?? 30,
      timeline_days: project.estimated_duration_days,
      company_name: settings?.company_name ?? null,
      company_logo_url: settings?.company_logo_url ?? null,
      company_address: settings?.company_address ?? null,
      company_phone: settings?.company_phone ?? null,
      company_email: settings?.company_email ?? null,
      currency: project.currency,
      currency_symbol: project.currency_symbol,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to generate quotation: ${error.message}`);
  return data as DbProjectQuotation;
}

export async function fetchQuotations(
  projectId: string,
): Promise<DbProjectQuotation[]> {
  const { data, error } = await supabase
    .from("project_quotations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch quotations: ${error.message}`);
  return (data ?? []) as DbProjectQuotation[];
}

export async function updateQuotation(
  id: string,
  updates: Partial<DbProjectQuotation>,
): Promise<void> {
  const { error } = await supabase
    .from("project_quotations")
    .update(updates)
    .eq("id", id);
  if (error) throw new Error(`Failed to update quotation: ${error.message}`);
}

// ============================================================
// TIMELINE GENERATION
// ============================================================

export async function fetchTimelineTemplates(
  projectType: ProjectType,
): Promise<DbTimelineTemplate[]> {
  const { data, error } = await supabase
    .from("timeline_templates")
    .select("*")
    .eq("project_type", projectType)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error)
    throw new Error(`Failed to fetch timeline templates: ${error.message}`);
  return (data ?? []) as DbTimelineTemplate[];
}

export async function generateTimeline(
  projectId: string,
): Promise<DbProjectTimeline[]> {
  const project = await fetchContractorProject(projectId);
  if (!project) throw new Error("Project not found");

  const templates = await fetchTimelineTemplates(project.project_type);
  if (templates.length === 0) return [];

  const template = templates[0];
  const phases = template.phases;

  let currentDay = 0;
  const timelineItems: Array<{
    phase: TimelinePhase;
    name: string;
    description: string | null;
    days_required: number;
    start_day: number;
    end_day: number;
    is_completed: boolean;
    sort_order: number;
  }> = [];

  // Build dependency graph
  const phaseMap = new Map<string, number>(); // phase name -> end_day

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    let startDay = 0;

    // Find the latest dependency end day
    if (p.depends_on) {
      const depEndDay = phaseMap.get(p.depends_on);
      if (depEndDay !== undefined) {
        startDay = depEndDay;
      }
    } else {
      startDay = currentDay;
    }

    const endDay = startDay + p.days;

    timelineItems.push({
      phase: p.phase as TimelinePhase,
      name: p.name,
      description: null,
      days_required: p.days,
      start_day: startDay,
      end_day: endDay,
      is_completed: false,
      sort_order: i,
    });

    phaseMap.set(p.name, endDay);
    if (endDay > currentDay) currentDay = endDay;
  }

  // Update project estimated duration
  await updateContractorProject(projectId, {
    estimated_duration_days: currentDay,
  });

  // Delete existing timeline
  await supabase.from("project_timelines").delete().eq("project_id", projectId);

  // Insert new timeline
  const rows = timelineItems.map((item) => ({
    ...item,
    project_id: projectId,
  }));

  const { data, error } = await supabase
    .from("project_timelines")
    .insert(rows)
    .select();

  if (error) throw new Error(`Failed to generate timeline: ${error.message}`);
  return (data ?? []) as DbProjectTimeline[];
}

export async function fetchTimeline(
  projectId: string,
): Promise<DbProjectTimeline[]> {
  const { data, error } = await supabase
    .from("project_timelines")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch timeline: ${error.message}`);
  return (data ?? []) as DbProjectTimeline[];
}

export async function updateTimelinePhase(
  id: string,
  updates: Partial<DbProjectTimeline>,
): Promise<void> {
  const { error } = await supabase
    .from("project_timelines")
    .update(updates)
    .eq("id", id);
  if (error)
    throw new Error(`Failed to update timeline phase: ${error.message}`);
}

// ============================================================
// PROJECT VERSIONS
// ============================================================

export async function createProjectVersion(
  projectId: string,
  changeSummary?: string,
): Promise<void> {
  const project = await fetchContractorProject(projectId);
  const rooms = await fetchProjectRooms(projectId);
  const labourPlan = await fetchLabourPlan(projectId);
  const shoppingList = await fetchShoppingList(projectId);

  const snapshot = {
    project,
    rooms,
    labourPlan,
    shoppingList,
  };

  // Get current version count
  const { count } = await supabase
    .from("project_versions")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);

  const { error } = await supabase.from("project_versions").insert({
    project_id: projectId,
    version_number: (count ?? 0) + 1,
    snapshot,
    change_summary: changeSummary ?? null,
  });

  if (error)
    throw new Error(`Failed to create project version: ${error.message}`);
}

export async function fetchProjectVersions(
  projectId: string,
): Promise<DbProjectVersion[]> {
  const { data, error } = await supabase
    .from("project_versions")
    .select("*")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });

  if (error)
    throw new Error(`Failed to fetch project versions: ${error.message}`);
  return (data ?? []) as DbProjectVersion[];
}

// ============================================================
// MATERIAL CATALOG
// ============================================================

export async function fetchMaterialCatalog(
  category?: string,
): Promise<DbMaterialCatalog[]> {
  let query = supabase
    .from("material_catalog")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error)
    throw new Error(`Failed to fetch material catalog: ${error.message}`);
  return (data ?? []) as DbMaterialCatalog[];
}

export interface MaterialRecommendation {
  material: DbMaterialCatalog;
  qualityTier: FinishQuality;
  price: number;
  reasons: string[];
}

export function recommendMaterial(
  catalog: DbMaterialCatalog[],
  category: string,
  qualityTier: FinishQuality,
  usageContext?: string,
): MaterialRecommendation | null {
  const filtered = catalog.filter((m) => m.category === category);
  if (filtered.length === 0) return null;

  // Find the best match for the quality tier
  const exactTier = filtered.find((m) => m.quality_tier === qualityTier);
  const material = exactTier ?? filtered[0];

  const priceField = `${qualityTier}_price` as keyof Pick<
    DbMaterialCatalog,
    "economy_price" | "standard_price" | "premium_price" | "luxury_price"
  >;
  const price = material[priceField] as number;

  const reasons: string[] = [];
  if (material.durability_rating) {
    reasons.push(`Durability: ${material.durability_rating}`);
  }
  if (material.lifespan_years) {
    reasons.push(`Expected lifespan: ${material.lifespan_years} years`);
  }
  if (material.finish_type) {
    reasons.push(`Finish: ${material.finish_type}`);
  }
  if (material.maintenance_frequency) {
    reasons.push(`Maintenance: ${material.maintenance_frequency}`);
  }
  if (usageContext && material.recommended_usage.includes(usageContext)) {
    reasons.push(`Recommended for ${usageContext}`);
  }

  return { material, qualityTier, price, reasons };
}

// ============================================================
// WEATHER INTELLIGENCE
// ============================================================

export interface WeatherInfo {
  suitable: boolean;
  temperature: number;
  humidity: number;
  rainChance: number;
  recommendations: string[];
  warnings: string[];
}

export async function fetchWeatherInfo(location: string): Promise<WeatherInfo> {
  // Check cache first
  const { data: cached } = await supabase
    .from("weather_cache")
    .select("*")
    .eq("location", location)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    return parseWeatherData(cached.forecast_data as Record<string, unknown>);
  }

  // If no cached data, return a default recommendation
  // (Real weather API integration would go here in an edge function)
  return {
    suitable: true,
    temperature: 30,
    humidity: 65,
    rainChance: 20,
    recommendations: [
      "Check local weather forecast before starting exterior painting",
      "Ideal painting temperature is 10°C to 32°C",
      "Humidity should be below 85% for best paint drying",
    ],
    warnings: [],
  };
}

function parseWeatherData(data: Record<string, unknown>): WeatherInfo {
  const temp = (data.temperature ?? 30) as number;
  const humidity = (data.humidity ?? 65) as number;
  const rainChance = (data.rain_chance ?? 20) as number;

  const suitable = temp >= 10 && temp <= 32 && humidity < 85 && rainChance < 40;
  const recommendations: string[] = [];
  const warnings: string[] = [];

  if (temp > 32)
    warnings.push("High temperature may cause paint to dry too quickly");
  if (temp < 10) warnings.push("Cold temperature may slow paint drying");
  if (humidity > 85)
    warnings.push("High humidity will affect paint adhesion and drying");
  if (rainChance > 40)
    warnings.push("High rain chance, avoid exterior painting");

  if (suitable) recommendations.push("Good conditions for painting");
  if (temp >= 15 && temp <= 28)
    recommendations.push("Optimal temperature range for paint application");
  if (humidity < 70)
    recommendations.push("Low humidity ensures proper paint curing");

  return {
    suitable,
    temperature: temp,
    humidity,
    rainChance,
    recommendations,
    warnings,
  };
}

// ============================================================
// CALCULATION EXPLANATION
// ============================================================

export interface CalculationExplanation {
  formula: string;
  inputs: Record<string, string>;
  steps: Array<{ label: string; value: string }>;
  result: string;
  assumptions: string[];
}

export function explainCalculation(
  calcType: RoomCalcType,
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): CalculationExplanation {
  const assumptions: string[] = [];

  switch (calcType) {
    case "paint": {
      const paintableArea = (result.paintableArea ?? 0) as number;
      const coats = (input.coats ?? 2) as number;
      const coverageRate = (input.coverageRate ?? 10) as number;
      const wasteMargin = Math.min(
        100,
        Math.max(0, (input.wasteMargin ?? 10) as number),
      );
      const baseLiters = (paintableArea * coats) / coverageRate;
      const adjustedLiters = baseLiters * (1 + wasteMargin / 100);

      assumptions.push(`Coverage rate: ${coverageRate} m²/L per coat`);
      assumptions.push(`Waste margin: ${wasteMargin}%`);
      assumptions.push(`Coats: ${coats}`);

      return {
        formula:
          "Paint Required = (Paintable Area × Coats) / Coverage Rate × (1 + Waste %)",
        inputs: {
          "Paintable Area": `${paintableArea.toFixed(2)} m²`,
          Coats: String(coats),
          "Coverage Rate": `${coverageRate} m²/L`,
          "Waste Margin": `${wasteMargin}%`,
        },
        steps: [
          {
            label: "Base paint needed",
            value: `${paintableArea} × ${coats} / ${coverageRate} = ${baseLiters.toFixed(2)} L`,
          },
          {
            label: "Waste adjustment",
            value: `${baseLiters.toFixed(2)} × 1.${wasteMargin.toString().padStart(2, "0")} = ${adjustedLiters.toFixed(2)} L`,
          },
          {
            label: "Total recommended",
            value: `${adjustedLiters.toFixed(2)} L`,
          },
        ],
        result: `${adjustedLiters.toFixed(2)} liters of paint needed`,
        assumptions,
      };
    }

    case "screeding": {
      const netArea = (result.netScreedingArea ?? 0) as number;
      const coverageRate = (input.coverageRate ?? 5) as number;
      const wasteMargin = Math.min(
        100,
        Math.max(0, (input.wasteMargin ?? 10) as number),
      );
      const materialRequired =
        (netArea / coverageRate) * (1 + wasteMargin / 100);

      assumptions.push(`Coverage rate: ${coverageRate} m² per unit`);
      assumptions.push(`Waste margin: ${wasteMargin}%`);

      return {
        formula: "Material = (Net Area / Coverage Rate) × (1 + Waste %)",
        inputs: {
          "Net Screeding Area": `${netArea.toFixed(2)} m²`,
          "Coverage Rate": `${coverageRate} m²/unit`,
          "Waste Margin": `${wasteMargin}%`,
        },
        steps: [
          {
            label: "Base material",
            value: `${netArea} / ${coverageRate} = ${(netArea / coverageRate).toFixed(2)} units`,
          },
          {
            label: "Waste adjustment",
            value: `${(netArea / coverageRate).toFixed(2)} × 1.${wasteMargin.toString().padStart(2, "0")} = ${materialRequired.toFixed(2)} units`,
          },
          {
            label: "Total material needed",
            value: `${materialRequired.toFixed(2)} units`,
          },
        ],
        result: `${materialRequired.toFixed(2)} units of screeding material`,
        assumptions,
      };
    }

    case "pop_ceiling": {
      const ceilingArea = (result.ceilingArea ?? 0) as number;
      const wasteMargin = Math.min(
        100,
        Math.max(0, (input.wasteMargin ?? 10) as number),
      );
      const adjustedArea = ceilingArea * (1 + wasteMargin / 100);

      assumptions.push(`Waste margin: ${wasteMargin}%`);
      assumptions.push(
        "Material quantities are calculated per category from the POP materials database",
      );

      return {
        formula:
          "Adjusted Area = Ceiling Area × (1 + Waste %), then per-material: Quantity = Adjusted Area / Coverage Rate",
        inputs: {
          "Ceiling Area": `${ceilingArea.toFixed(2)} m²`,
          "Waste Margin": `${wasteMargin}%`,
          "Adjusted Area": `${adjustedArea.toFixed(2)} m²`,
        },
        steps: [
          { label: "Ceiling area", value: `${ceilingArea.toFixed(2)} m²` },
          {
            label: "Waste-adjusted area",
            value: `${adjustedArea.toFixed(2)} m²`,
          },
          {
            label: "Per material",
            value: "Packages = ⌈Adjusted Area / Coverage Rate⌉",
          },
          { label: "Grand total", value: "Σ(Material Cost) + Σ(Labour Cost)" },
        ],
        result: `Total POP ceiling cost calculated from ${result.materials ? (result.materials as unknown[]).length : 0} material categories`,
        assumptions,
      };
    }

    case "tiling": {
      const surfaceArea = (result.surfaceArea ?? 0) as number;
      const wasteMargin = Math.min(
        100,
        Math.max(0, (input.wasteMargin ?? 10) as number),
      );
      const adjustedArea = surfaceArea * (1 + wasteMargin / 100);
      const tileWidth = (input.tileWidthMm ?? 300) as number;
      const tileHeight = (input.tileHeightMm ?? 300) as number;
      const tileArea = (tileWidth / 1000) * (tileHeight / 1000);
      const tilesNeeded = Math.ceil(adjustedArea / tileArea);

      assumptions.push(`Tile size: ${tileWidth}×${tileHeight}mm`);
      assumptions.push(`Waste margin: ${wasteMargin}%`);
      assumptions.push(`Tiles per box: ${input.tilesPerBox ?? 11}`);

      return {
        formula:
          "Tiles = ⌈(Surface Area × (1 + Waste %)) / Tile Area⌉, Boxes = ⌈Tiles / Tiles per Box⌉",
        inputs: {
          "Surface Area": `${surfaceArea.toFixed(2)} m²`,
          "Tile Size": `${tileWidth}×${tileHeight}mm`,
          "Tile Area": `${tileArea.toFixed(4)} m²`,
          "Waste Margin": `${wasteMargin}%`,
        },
        steps: [
          {
            label: "Adjusted area",
            value: `${surfaceArea} × 1.${wasteMargin.toString().padStart(2, "0")} = ${adjustedArea.toFixed(2)} m²`,
          },
          {
            label: "Tiles needed",
            value: `⌈${adjustedArea.toFixed(2)} / ${tileArea.toFixed(4)}⌉ = ${tilesNeeded}`,
          },
          {
            label: "Boxes needed",
            value: `⌈${tilesNeeded} / ${input.tilesPerBox ?? 11}⌉ = ${Math.ceil(tilesNeeded / ((input.tilesPerBox as number) ?? 11))}`,
          },
        ],
        result: `${tilesNeeded} tiles (${Math.ceil(tilesNeeded / ((input.tilesPerBox as number) ?? 11))} boxes) needed`,
        assumptions,
      };
    }
  }
}

// ============================================================
// SMART WIZARD, Recommend calculator and workflow
// ============================================================

export interface WizardRecommendation {
  calculatorType: RoomCalcType;
  reason: string;
  workflow: string[];
  suggestedRooms: Array<{ type: RoomType; name: string }>;
}

export function getWizardRecommendation(
  projectType: ProjectType,
  surfaceLocation: string,
  constructionType: string,
  finishQuality: FinishQuality,
): WizardRecommendation {
  let calcType: RoomCalcType = "paint";
  let reason = "";
  const workflow: string[] = [];
  const suggestedRooms: Array<{ type: RoomType; name: string }> = [];

  switch (projectType) {
    case "painting":
      calcType = "paint";
      reason =
        surfaceLocation === "exterior"
          ? "Exterior painting requires weather-resistant paint and surface preparation for outdoor conditions."
          : "Interior painting starts with surface assessment, then screeding if needed, followed by priming and painting.";
      workflow.push(
        "Surface Assessment",
        "Screeding (if needed)",
        "Primer",
        "Painting",
        "Inspection",
      );
      if (surfaceLocation === "interior" || surfaceLocation === "both") {
        suggestedRooms.push(
          { type: "living_room", name: "Living Room" },
          { type: "bedroom", name: "Master Bedroom" },
          { type: "bedroom", name: "Bedroom 2" },
          { type: "kitchen", name: "Kitchen" },
          { type: "bathroom", name: "Bathroom" },
          { type: "hallway", name: "Hallway" },
        );
      }
      break;

    case "screeding":
      calcType = "screeding";
      reason =
        "Wall screeding requires surface preparation and multi-coat application for smooth wall finish.";
      workflow.push(
        "Surface Cleaning",
        "First Screed Coat",
        "Drying",
        "Second Coat (if needed)",
        "Inspection",
      );
      suggestedRooms.push(
        { type: "living_room", name: "Living Room" },
        { type: "bedroom", name: "Bedroom" },
        { type: "hallway", name: "Hallway" },
      );
      break;

    case "pop_ceiling":
      calcType = "pop_ceiling";
      reason =
        "POP ceiling installation involves framework, board fixing, jointing, and finishing for a complete ceiling.";
      workflow.push(
        "Measurement",
        "Framework",
        "Board Fixing",
        "Jointing",
        "Finishing",
        "Painting",
      );
      suggestedRooms.push(
        { type: "living_room", name: "Living Room" },
        { type: "bedroom", name: "Master Bedroom" },
        { type: "dining", name: "Dining Area" },
      );
      break;

    case "tiling":
      calcType = "tiling";
      reason =
        "Tile installation requires surface preparation, layout, adhesive application, and grouting.";
      workflow.push(
        "Surface Preparation",
        "Layout",
        "Tile Installation",
        "Grouting",
        "Curing",
        "Inspection",
      );
      suggestedRooms.push(
        { type: "bathroom", name: "Bathroom" },
        { type: "kitchen", name: "Kitchen" },
        { type: "living_room", name: "Living Room Floor" },
        { type: "balcony", name: "Balcony" },
      );
      break;

    case "multi_trade":
      calcType = "paint";
      reason =
        "Multi-trade renovation combines painting, screeding, POP ceiling, and tiling for a complete renovation.";
      workflow.push(
        "Assessment",
        "Screeding",
        "POP Ceiling",
        "Tiling",
        "Priming",
        "Painting",
        "Inspection",
        "Completion",
      );
      suggestedRooms.push(
        { type: "living_room", name: "Living Room" },
        { type: "bedroom", name: "Master Bedroom" },
        { type: "bedroom", name: "Bedroom 2" },
        { type: "kitchen", name: "Kitchen" },
        { type: "bathroom", name: "Bathroom" },
        { type: "hallway", name: "Hallway" },
      );
      break;
  }

  // Add quality-based recommendations
  if (constructionType === "new_construction") {
    reason += " New construction requires thorough surface preparation.";
  } else if (constructionType === "renovation") {
    reason +=
      " Renovation may require removing old paint and repairing surface damage.";
  }

  if (finishQuality === "luxury" || finishQuality === "premium") {
    reason +=
      " Premium quality requires additional coats and higher-grade materials.";
  }

  return { calculatorType: calcType, reason, workflow, suggestedRooms };
}

// ============================================================
// ATTACHMENTS
// ============================================================

export async function fetchAttachments(
  projectId: string,
): Promise<DbProjectAttachment[]> {
  const { data, error } = await supabase
    .from("project_attachments")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to fetch attachments: ${error.message}`);
  return (data ?? []) as DbProjectAttachment[];
}

export async function deleteAttachment(id: string): Promise<void> {
  const { error } = await supabase
    .from("project_attachments")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Failed to delete attachment: ${error.message}`);
}

export async function uploadProjectAttachment(
  projectId: string,
  file: File,
  userId: string,
  description?: string,
): Promise<{ data: DbProjectAttachment | null; error: string | null }> {
  const ext = file.name.split(".").pop() ?? "png";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storagePath = `projects/${projectId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-attachments")
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    // Fallback to media bucket if project-attachments bucket doesn't exist
    if (uploadError.message.includes("Bucket not found")) {
      const altPath = `project-attachments/${projectId}/${fileName}`;
      const { error: altError } = await supabase.storage
        .from("media")
        .upload(altPath, file, { contentType: file.type });
      if (altError) return { data: null, error: altError.message };
      const { data: altUrl } = supabase.storage
        .from("media")
        .getPublicUrl(altPath);
      const { data: record, error: dbError } = await supabase
        .from("project_attachments")
        .insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: altPath,
          public_url: altUrl.publicUrl,
          mime_type: file.type,
          file_size: file.size,
          description: description ?? null,
          uploaded_by: userId,
        })
        .select("*")
        .maybeSingle();
      return {
        data: record as DbProjectAttachment | null,
        error: dbError ? dbError.message : null,
      };
    }
    return { data: null, error: uploadError.message };
  }

  const { data: urlData } = supabase.storage
    .from("project-attachments")
    .getPublicUrl(storagePath);

  const { data: record, error: dbError } = await supabase
    .from("project_attachments")
    .insert({
      project_id: projectId,
      file_name: file.name,
      storage_path: storagePath,
      public_url: urlData.publicUrl,
      mime_type: file.type,
      file_size: file.size,
      description: description ?? null,
      uploaded_by: userId,
    })
    .select("*")
    .maybeSingle();

  return {
    data: record as DbProjectAttachment | null,
    error: dbError ? dbError.message : null,
  };
}
