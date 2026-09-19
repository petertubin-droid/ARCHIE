import type { EngineQuantityLine, EngineCostSummary } from "./types";
import {
  registerEngine,
  requireFiniteNumbers,
  quantityLine,
} from "./engines-registry";

// =========================================================
// PHASE 2 ENGINES, added for the AI Copilot. Each wraps the
// EXISTING authoritative calculator functions; no new math.
// Engines that need DB-backed configs/materials fetch them through
// the same queries the manual calculators use, or accept them
// via rawInput (so callers with cached data avoid duplicate fetches).
// =========================================================

export function registerPhase2Engines(): void {
  // ── Painting: full purchasing methodology (classic FRELUX painting
  //    calculator, containers/buckets, openings deduction, waste).
  //    The AI must NOT flatten painting into an m²-only answer: this
  //    engine returns the same containers the manual calculator does.
  registerEngine({
    id: "painting_project",
    domain: "painting",
    title: "FRELUX Painting Engine, Materials & Containers",
    authoritative: true,
    creditedAs: "Calculated by the authoritative FRELUX painting calculator",
    async run(rawInput) {
      const {
        calculatePaint,
        DEFAULT_COVERAGE_M2_PER_LITER,
        DEFAULT_CONTAINER_SIZES_LITERS,
        DEFAULT_DOOR_DIMS,
        DEFAULT_WINDOW_DIMS,
      } = await import("@/lib/calc");
      const input = rawInput as {
        length: number;
        width: number;
        wallHeight: number;
        projectType?: "room" | "whole_house" | "exterior";
        unit?: "meters" | "feet";
        doors?: number;
        windows?: number;
        coats?: number;
        paintType?: string;
        includeCeiling?: boolean;
        wasteMargin?: number;
      };
      const invalid = requireFiniteNumbers({
        length: input.length,
        width: input.width,
        wallHeight: input.wallHeight,
        doors: input.doors ?? 0,
        windows: input.windows ?? 0,
        coats: input.coats ?? 2,
        wasteMargin: input.wasteMargin ?? 10,
      });
      if (invalid) {
        return {
          ok: false,
          engine: "painting_project",
          calculatedAt: new Date().toISOString(),
          quantities: [],
          costs: null,
          raw: null,
          error: invalid,
        };
      }
      // ADMIN-CONFIG PROPAGATION: the coverage rate, container sizes and
      // default coat count come from the SAME DB sources the manual paint
      // calculator page reads (paint_types + estimation_calc_rules), so an
      // admin change propagates identically to page, AI copilot, agent and
      // plan takeoff. The code constants below remain ONLY as the honest
      // fallback when no admin configuration exists, never a silent
      // second opinion. (Same pattern as the screeding/POP engines.)
      let coverageRate = DEFAULT_COVERAGE_M2_PER_LITER;
      let containerSizes: number[] = DEFAULT_CONTAINER_SIZES_LITERS;
      let defaultCoats = 2;
      try {
        const { fetchPaintTypes } = await import("@/lib/queries");
        const { data: paintTypes } = await fetchPaintTypes();
        const standard = paintTypes.find(
          (t) => t.id === "standard" || t.name?.toLowerCase() === "standard",
        );
        const dbCoverage = Number(standard?.coverage_rate);
        if (standard && dbCoverage > 0) coverageRate = dbCoverage;
        const sizes = standard?.container_sizes;
        if (Array.isArray(sizes) && sizes.some((s) => Number(s) > 0)) {
          containerSizes = sizes.filter((s) => Number(s) > 0);
        }
      } catch {
        // DB unavailable → documented code defaults (current behavior).
      }
      try {
        const { fetchCalcRule } = await import("@/lib/estimation/queries");
        const { data: coatRule } = await fetchCalcRule("standard_coat_count");
        const v = (coatRule?.rule_value as Record<string, unknown> | undefined)
          ?.value;
        if (typeof v === "number" && v >= 1) defaultCoats = Math.floor(v);
      } catch {
        // DB unavailable → documented default of 2 coats.
      }
      // The engine's own `unit` convention converts internally, pass through,
      // never convert at this boundary (Phase-2 contract point 6).
      const result = calculatePaint(
        {
          projectType: (input.projectType ?? "room") as never,
          length: input.length,
          width: input.width,
          wallHeight: input.wallHeight,
          doors: input.doors ?? 0,
          doorDims: DEFAULT_DOOR_DIMS,
          windows: input.windows ?? 0,
          windowDims: DEFAULT_WINDOW_DIMS,
          coats: input.coats ?? defaultCoats,
          paintType: input.paintType ?? "standard",
          unit: (input.unit ?? "meters") as never,
          includeCeiling: input.includeCeiling ?? true,
          wasteMargin: input.wasteMargin ?? 10,
        },
        {
          coverageRate,
          containerSizes,
        },
      );

      const quantities: EngineQuantityLine[] = [
        quantityLine("Paintable area", result.paintableArea, "m²"),
        quantityLine(
          "Paint required (with waste)",
          result.adjustedLiters,
          "litres",
        ),
        quantityLine(
          "Total recommended litres",
          result.totalRecommendedLiters,
          "litres",
        ),
      ];
      for (const container of result.recommendedContainers ?? []) {
        quantities.push(
          quantityLine(
            `${container.size} litre containers`,
            container.count,
            "containers",
          ),
        );
      }
      if (result.primerLiters > 0) {
        quantities.push(quantityLine("Primer", result.primerLiters, "litres"));
      }
      return {
        ok: true,
        engine: "painting_project",
        calculatedAt: new Date().toISOString(),
        quantities,
        costs: null, // price is user/market-supplied in the manual calculator; never invented here
        raw: result,
      };
    },
  });

  // ── Tile: authoritative tile calculator (quantity + user-supplied
  //    tile/price inputs; materials param is unused by the engine).
  registerEngine({
    id: "tile_estimate",
    domain: "tiling",
    title: "FRELUX Tile Calculator Engine",
    authoritative: true,
    creditedAs: "Calculated by the authoritative FRELUX tile calculator",
    async run(rawInput) {
      const { calculateTile } = await import("@/lib/pop-tile-calc");
      const input = rawInput as {
        surfaceType: "floor" | "wall";
        method: "traditional" | "adhesive";
        length: number;
        width: number;
        height?: number;
        unit?: "meters" | "feet";
        tileWidthMm: number;
        tileHeightMm: number;
        tilesPerBox: number;
        tilePricePerBox: number;
        wasteMargin?: number;
        currency?: string;
        currencySymbol?: string;
      };
      const invalid = requireFiniteNumbers({
        length: input.length,
        width: input.width,
        tileWidthMm: input.tileWidthMm,
        tileHeightMm: input.tileHeightMm,
        tilesPerBox: input.tilesPerBox,
        tilePricePerBox: input.tilePricePerBox,
      });
      if (invalid) {
        return {
          ok: false,
          engine: "tile_estimate",
          calculatedAt: new Date().toISOString(),
          quantities: [],
          costs: null,
          raw: null,
          error: invalid,
        };
      }
      const currency = input.currency ?? "NGN";
      const symbol = input.currencySymbol ?? currency;
      const result = calculateTile(
        {
          surfaceType: input.surfaceType,
          method: input.method,
          length: input.length,
          width: input.width,
          height: input.height ?? 0,
          tileWidthMm: input.tileWidthMm,
          tileHeightMm: input.tileHeightMm,
          tilesPerBox: input.tilesPerBox,
          tilePricePerBox: input.tilePricePerBox,
          wasteMargin: input.wasteMargin ?? 10,
          // Installation materials: costs only appear when the user supplied
          // real rates/prices, every field is explicit and zero by default so
          // the engine's own warnings (not NaN) mark what is unconfigured.
          adhesiveCoverageRate: 0,
          adhesivePricePerBag: 0,
          cementCoverageRate: 0,
          cementPricePerBag: 0,
          cementPackageSize: 1,
          sandCoverageRate: 0,
          sandPricePerBag: 0,
          sandPackageSize: 1,
          groutCoverageRate: 0,
          groutPricePerKg: 0,
          spacerCoverageRate: 0,
          spacerPricePerPack: 0,
          spacerPackageSize: 1,
          labourRatePerSqm: 0,
          unit: (input.unit ?? "meters") as never,
        } as never,
        [] as never,
        currency,
        symbol,
      );

      const quantities: EngineQuantityLine[] = [
        quantityLine("Surface area", result.surfaceArea, "m²"),
        quantityLine("Tiles needed", result.tilesNeeded, "tiles"),
        quantityLine("Boxes needed", result.boxesNeeded, "boxes"),
      ];
      const costLines: Array<{ label: string; amount: number }> = [];
      if (result.tileCost > 0)
        costLines.push({ label: "Tiles", amount: result.tileCost });
      if (result.adhesiveCost > 0)
        costLines.push({ label: "Adhesive", amount: result.adhesiveCost });
      if (result.cementCost > 0)
        costLines.push({ label: "Cement", amount: result.cementCost });
      if (result.groutCost > 0)
        costLines.push({ label: "Grout", amount: result.groutCost });
      const costs: EngineCostSummary | null = costLines.length
        ? {
            total: costLines.reduce((s, l) => s + l.amount, 0),
            currency,
            lines: costLines,
            regionalDataAvailable: false,
          }
        : null;
      return {
        ok: true,
        engine: "tile_estimate",
        calculatedAt: new Date().toISOString(),
        quantities,
        costs,
        raw: result,
      };
    },
  });

  // ── POP ceiling: authoritative POP calculator. Materials come from
  //    the pop_materials table via the same query the manual
  //    calculator uses (or rawInput.materials when the caller has
  //    already fetched them, avoids duplicate requests).
  registerEngine({
    id: "pop_ceiling",
    domain: "pop",
    title: "FRELUX POP Ceiling Calculator Engine",
    authoritative: true,
    creditedAs: "Calculated by the authoritative FRELUX POP calculator",
    async run(rawInput) {
      const { calculatePopCeiling } = await import("@/lib/pop-tile-calc");
      const input = rawInput as {
        roomLength: number;
        roomWidth: number;
        unit?: "meters" | "feet";
        wasteMargin?: number;
        workflow?: "nigeria" | "international";
        includeDecorative?: boolean;
        includeOptional?: boolean;
        currency?: string;
        currencySymbol?: string;
        materials?: Array<Record<string, unknown>>;
      };
      const invalid = requireFiniteNumbers({
        roomLength: input.roomLength,
        roomWidth: input.roomWidth,
        wasteMargin: input.wasteMargin ?? 10,
      });
      if (invalid) {
        return {
          ok: false,
          engine: "pop_ceiling",
          calculatedAt: new Date().toISOString(),
          quantities: [],
          costs: null,
          raw: null,
          error: invalid,
        };
      }

      let materials = input.materials ?? null;
      if (!materials) {
        const { fetchPopMaterials } = await import("@/lib/queries");
        const { data } = await fetchPopMaterials();
        materials = (data ?? []) as unknown as Array<Record<string, unknown>>;
      }
      if (!materials || materials.length === 0) {
        return {
          ok: false,
          engine: "pop_ceiling",
          calculatedAt: new Date().toISOString(),
          quantities: [],
          costs: null,
          raw: null,
          error:
            "POP materials data is unavailable right now, use the POP Ceiling Calculator directly for this estimate.",
        };
      }

      const currency = input.currency ?? "NGN";
      const symbol = input.currencySymbol ?? currency;
      const result = calculatePopCeiling(
        {
          workflow: input.workflow ?? "nigeria",
          roomLength: input.roomLength,
          roomWidth: input.roomWidth,
          unit: (input.unit ?? "meters") as never,
          wasteMargin: input.wasteMargin ?? 10,
          includeDecorative: input.includeDecorative ?? false,
          includeOptional: input.includeOptional ?? false,
        } as never,
        materials as never,
        currency,
        symbol,
      );

      const quantities: EngineQuantityLine[] = [
        quantityLine("Ceiling area", result.ceilingArea, "m²"),
      ];
      const costLines: Array<{ label: string; amount: number }> = [];
      for (const m of result.materials ?? []) {
        quantities.push(quantityLine(m.name, m.quantity, m.unit));
        if (m.cost > 0) costLines.push({ label: m.name, amount: m.cost });
      }
      const costs: EngineCostSummary | null = costLines.length
        ? {
            total: costLines.reduce((s, l) => s + l.amount, 0),
            currency,
            lines: costLines,
            regionalDataAvailable: false,
          }
        : null;
      return {
        ok: true,
        engine: "pop_ceiling",
        calculatedAt: new Date().toISOString(),
        quantities,
        costs,
        raw: result,
      };
    },
  });

  // ── Screeding: authoritative screeding system engine. Config comes
  //    from screeding_system_config via the same query the manual
  //    Screeding Cost Estimator uses.
  registerEngine({
    id: "screeding_system",
    domain: "screeding",
    title: "FRELUX Screeding System Engine",
    authoritative: true,
    creditedAs: "Calculated by the authoritative FRELUX screeding engine",
    async run(rawInput) {
      const { calculateScreedingSystem, dbToSystemConfig } =
        await import("@/lib/calc");
      const input = rawInput as {
        areaM2: number;
        systemType?: "putty" | "white_cement_paint";
        coats?: number;
        config?: unknown; // pre-fetched ScreedingSystemConfig (avoids duplicate fetch)
      };
      const invalid = requireFiniteNumbers({
        areaM2: input.areaM2,
        coats: input.coats ?? 0,
      });
      if (invalid) {
        return {
          ok: false,
          engine: "screeding_system",
          calculatedAt: new Date().toISOString(),
          quantities: [],
          costs: null,
          raw: null,
          error: invalid,
        };
      }

      let config =
        (input.config as
          Awaited<ReturnType<typeof dbToSystemConfig>> | undefined) ??
        undefined;
      if (!config) {
        const { fetchScreedingSystemConfig } = await import("@/lib/queries");
        const { data, error: cfgError } = await fetchScreedingSystemConfig(
          input.systemType ?? "white_cement_paint",
        );
        if (cfgError || !data) {
          return {
            ok: false,
            engine: "screeding_system",
            calculatedAt: new Date().toISOString(),
            quantities: [],
            costs: null,
            raw: null,
            error:
              "Screeding configuration is unavailable right now, use the Screeding Cost Estimator directly for this estimate.",
          };
        }
        config = dbToSystemConfig(data);
      }

      const result = calculateScreedingSystem(
        input.areaM2,
        config,
        input.coats ?? config.defaultCoats,
      );

      const quantities: EngineQuantityLine[] = [
        quantityLine("Net screeding area", result.netScreedingArea, "m²"),
      ];
      const costLines: Array<{ label: string; amount: number }> = [];
      // Contract note (post-Phase-6 audit fix): the authoritative
      // calculateScreedingSystem result exposes each material as
      // { purchaseQuantity, totalCost, unit }, the PURCHASE quantity the
      // manual screeding calculators show. The wrapper previously read
      // stale { quantity, cost } field names, silently reporting 0 units
      // and no costs to every engine consumer. Both spellings are accepted
      // so a future result shape stays traceable, but purchaseQuantity /
      // totalCost are the documented fields.
      const addBreakdown = (
        label: string,
        breakdown: {
          purchaseQuantity?: number;
          totalCost?: number | null;
          quantity?: number;
          cost?: number | null;
          unit?: string;
        } | null,
      ) => {
        if (!breakdown) return;
        const qty = breakdown.purchaseQuantity ?? breakdown.quantity ?? 0;
        quantities.push(
          quantityLine(label, Number(qty), String(breakdown.unit ?? "units")),
        );
        const cost = breakdown.totalCost ?? breakdown.cost ?? null;
        if (typeof cost === "number" && cost > 0) {
          costLines.push({ label, amount: cost });
        }
      };
      if (result.systemType === "putty") {
        addBreakdown(result.putty?.name ?? "Putty", result.putty);
      } else {
        addBreakdown(result.paint?.name ?? "Screeding paint", result.paint);
        addBreakdown(result.cement?.name ?? "Cement", result.cement);
        addBreakdown(result.extra?.name ?? "Extra material", result.extra);
      }
      const costs: EngineCostSummary | null = costLines.length
        ? {
            total:
              result.materialCost ??
              costLines.reduce((s, l) => s + l.amount, 0),
            currency: result.currency,
            lines: costLines,
            regionalDataAvailable: false,
          }
        : null;
      return {
        ok: true,
        engine: "screeding_system",
        calculatedAt: new Date().toISOString(),
        quantities,
        costs,
        raw: result,
      };
    },
  });
} // registerPhase2Engines
