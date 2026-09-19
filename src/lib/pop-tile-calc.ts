import type {
  PopCalcInput,
  PopCalcResult,
  PopMaterialResult,
  PopEstimateResult,
  TileCalcInput,
  TileCalcResult,
} from "@/types";
import type { DbPopMaterial, DbTileMaterial } from "@/types/database";

const FT_TO_M = 0.3048;

function toSqm(value: number, unit: "meters" | "feet"): number {
  return unit === "feet" ? value * FT_TO_M : value;
}

// =========================================================
// POP Ceiling calculations
// =========================================================

export function calculatePopCeiling(
  input: PopCalcInput,
  materials: DbPopMaterial[],
  currency: string,
  currencySymbol: string,
): PopCalcResult {
  const lengthM = toSqm(input.roomLength, input.unit);
  const widthM = toSqm(input.roomWidth, input.unit);
  const ceilingArea = lengthM * widthM;

  const wastePct = Math.min(100, Math.max(0, input.wasteMargin));
  const wasteMultiplier = 1 + wastePct / 100;
  const adjustedArea = ceilingArea * wasteMultiplier;

  const materialResults: PopMaterialResult[] = [];
  const calcWarnings: string[] = [];
  let materialCost = 0;

  const filtered = materials
    .filter((m) => m.workflow === input.workflow && m.is_active)
    .filter((m) => {
      if (m.category === "decorative" && !input.includeDecorative) return false;
      if (m.is_optional && !input.includeOptional) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const mat of filtered) {
    const coverage = Number(mat.coverage_rate);
    const pkgSize = Number(mat.package_size);
    const unitPrice = Number(mat.unit_price);
    if (mat.category === "labour") {
      // Labour not included, negotiated separately
    } else {
      if (coverage > 0 && adjustedArea > 0) {
        // ok, configurable coverage present
      } else if (adjustedArea > 0) {
        calcWarnings.push(
          `Coverage rate is not configured for '${mat.name}'. Its quantity and cost are excluded from the total until an admin configures it.`,
        );
      }
      if (unitPrice > 0) {
        // ok, price configured
      } else {
        calcWarnings.push(
          `Unit price is not configured for '${mat.name}'. Its cost is excluded from the total until an admin configures it.`,
        );
      }
      const quantity = coverage > 0 ? adjustedArea / coverage : 0;
      const packagesNeeded =
        pkgSize > 0 ? Math.ceil(quantity / pkgSize) : Math.ceil(quantity);
      const cost = packagesNeeded * unitPrice;
      materialCost += cost;
      materialResults.push({
        name: mat.name,
        category: mat.category,
        quantity: Math.ceil(quantity * 10) / 10,
        unit: mat.coverage_unit,
        packagesNeeded,
        cost,
        isOptional: mat.is_optional,
      });
    }
  }

  const grandTotal = materialCost; // Labour not included

  return {
    ceilingArea,
    materials: materialResults,
    materialCost,
    labourCost: 0,
    wasteAmount: adjustedArea - ceilingArea,
    grandTotal,
    currency,
    currencySymbol,
    warnings: calcWarnings,
  };
}

export function calculatePopEstimate(
  input: PopCalcInput,
  materials: DbPopMaterial[],
  currency: string,
  currencySymbol: string,
): PopEstimateResult {
  return calculatePopCeiling(input, materials, currency, currencySymbol);
}

// =========================================================
// Tile calculations
// =========================================================

export function calculateTile(
  input: TileCalcInput,
  _materials: DbTileMaterial[],
  currency: string,
  currencySymbol: string,
): TileCalcResult {
  let surfaceArea: number;

  if (input.surfaceType === "wall") {
    const lengthM = toSqm(input.length, input.unit);
    const heightM = toSqm(input.height, input.unit);
    surfaceArea = lengthM * heightM;
  } else {
    const lengthM = toSqm(input.length, input.unit);
    const widthM = toSqm(input.width, input.unit);
    surfaceArea = lengthM * widthM;
  }

  const wastePct = Math.min(100, Math.max(0, input.wasteMargin));
  const wasteMultiplier = 1 + wastePct / 100;
  const adjustedArea = surfaceArea * wasteMultiplier;

  // --- Tiles (always calculated) ---
  const tileAreaM2 = (input.tileWidthMm / 1000) * (input.tileHeightMm / 1000);
  const tilesNeeded = tileAreaM2 > 0 ? Math.ceil(adjustedArea / tileAreaM2) : 0;
  const boxesNeeded =
    input.tilesPerBox > 0
      ? Math.ceil(tilesNeeded / input.tilesPerBox)
      : tilesNeeded;
  const tileCost = boxesNeeded * input.tilePricePerBox;

  // --- Adhesive (only when method === 'adhesive') ---
  let adhesiveNeeded = 0;
  let adhesiveCost = 0;
  if (input.method === "adhesive") {
    adhesiveNeeded =
      input.adhesiveCoverageRate > 0
        ? adjustedArea / input.adhesiveCoverageRate
        : 0;
    adhesiveCost = Math.ceil(adhesiveNeeded) * input.adhesivePricePerBag;
  }

  // --- Cement (only when method === 'traditional') ---
  let cementNeeded = 0;
  let cementCost = 0;
  if (input.method === "traditional") {
    const cementQty =
      input.cementCoverageRate > 0
        ? adjustedArea / input.cementCoverageRate
        : 0;
    const cementPkgSize =
      input.cementPackageSize > 0 ? input.cementPackageSize : 1;
    cementNeeded = Math.ceil(cementQty / cementPkgSize);
    cementCost = cementNeeded * input.cementPricePerBag;
  }

  // --- Sharp sand (only when method === 'traditional') ---
  let sandNeeded = 0;
  let sandCost = 0;
  if (input.method === "traditional") {
    const sandQty =
      input.sandCoverageRate > 0 ? adjustedArea / input.sandCoverageRate : 0;
    const sandPkgSize = input.sandPackageSize > 0 ? input.sandPackageSize : 1;
    sandNeeded = Math.ceil(sandQty / sandPkgSize);
    sandCost = sandNeeded * input.sandPricePerBag;
  }

  // --- Grout (always needed) ---
  const groutNeeded =
    input.groutCoverageRate > 0 ? adjustedArea / input.groutCoverageRate : 0;
  const groutCost = Math.ceil(groutNeeded) * input.groutPricePerKg;

  // --- Tile spacers (always needed) ---
  const spacerQty =
    input.spacerCoverageRate > 0 ? adjustedArea / input.spacerCoverageRate : 0;
  const spacerPkgSize =
    input.spacerPackageSize > 0 ? input.spacerPackageSize : 1;
  const spacerNeeded = Math.ceil(spacerQty / spacerPkgSize);
  const spacerCost = spacerNeeded * input.spacerPricePerPack;

  const tileWarnings: string[] = [];
  if (surfaceArea > 0 && tileAreaM2 <= 0) {
    tileWarnings.push(
      "Tile dimensions are invalid (zero tile area). Tile count and cost cannot be calculated.",
    );
  }
  if (surfaceArea > 0) {
    if (input.method === "adhesive" && input.adhesiveCoverageRate <= 0) {
      tileWarnings.push(
        "Adhesive coverage rate is not configured. Adhesive cost is excluded from the total until it is configured.",
      );
    }
    if (input.method === "traditional" && input.cementCoverageRate <= 0) {
      tileWarnings.push(
        "Cement coverage rate is not configured. Cement cost is excluded from the total until it is configured.",
      );
    }
    if (input.method === "traditional" && input.sandCoverageRate <= 0) {
      tileWarnings.push(
        "Sand coverage rate is not configured. Sand cost is excluded from the total until it is configured.",
      );
    }
    if (input.groutCoverageRate <= 0) {
      tileWarnings.push(
        "Grout coverage rate is not configured. Grout cost is excluded from the total until it is configured.",
      );
    }
  }

  const materialCost =
    tileCost + adhesiveCost + cementCost + sandCost + groutCost + spacerCost;
  const labourCost = 0; // Labour not included, negotiated separately
  const grandTotal = materialCost;

  return {
    surfaceArea,
    tileArea: tileAreaM2,
    tilesNeeded,
    boxesNeeded,
    tileCost,
    method: input.method,
    adhesiveNeeded: Math.ceil(adhesiveNeeded),
    adhesiveCost,
    cementNeeded,
    cementCost,
    sandNeeded,
    sandCost,
    groutNeeded: Math.ceil(groutNeeded),
    groutCost,
    spacerNeeded,
    spacerCost,
    wasteAmount: adjustedArea - surfaceArea,
    materialCost,
    labourCost,
    grandTotal,
    currency,
    currencySymbol,
    warnings: tileWarnings,
  };
}
