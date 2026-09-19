import type {
  ScreedingCalcInput,
  ScreedingCalcResult,
  ScreedingEstimateInput,
  ScreedingEstimateResult,
} from '@/types';

export function formatNumber(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatCurrency(value: number, currency = '₦'): string {
  return `${currency}${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// Convert feet to meters and back.
export function feetToMeters(ft: number): number {
  return ft * 0.3048;
}
export function metersToFeet(m: number): number {
  return m / 0.3048;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Default opening dimensions in meters, single source of truth.
export const DEFAULT_DOOR_WIDTH_M = 0.8;
export const DEFAULT_DOOR_HEIGHT_M = 2.4;
export const DEFAULT_WINDOW_WIDTH_M = 1.2;
export const DEFAULT_WINDOW_HEIGHT_M = 1.2;

// ─────────────────────────────────────────────────────────
// Wall Screeding calculations
// ─────────────────────────────────────────────────────────

export function calculateScreedingArea(input: ScreedingCalcInput): ScreedingCalcResult {
  const lengthM = feetToMeters(input.roomLength);
  const widthM = feetToMeters(input.roomWidth);
  const heightM = feetToMeters(input.wallHeight);
  const wallWidthM = feetToMeters(input.wallWidth);

  let grossWallArea: number;
  if (input.method === 'full_room') {
    // Width is optional, when blank, calculate only the two walls defined by length.
    if (widthM <= 0) {
      grossWallArea = 2 * lengthM * heightM;
    } else {
      const perimeter = 2 * (lengthM + widthM);
      grossWallArea = perimeter * heightM;
    }
  } else {
    grossWallArea = wallWidthM * heightM * Math.max(1, input.wallCount);
  }

  const doorArea = Math.max(0, input.doors) * Math.max(0, input.doorDims.width) * Math.max(0, input.doorDims.height);
  const windowArea = Math.max(0, input.windows) * Math.max(0, input.windowDims.width) * Math.max(0, input.windowDims.height);
  const totalDeduction = doorArea + windowArea;
  const netScreedingArea = Math.max(0, grossWallArea - totalDeduction);

  return {
    method: input.method,
    unit: input.unit,
    grossWallArea: round(grossWallArea),
    doorArea: round(doorArea),
    windowArea: round(windowArea),
    totalDeduction: round(totalDeduction),
    netScreedingArea: round(netScreedingArea),
  };
}

export function calculateScreedingEstimate(input: ScreedingEstimateInput): ScreedingEstimateResult {
  if (input.coverageRate <= 0 || input.netScreedingArea <= 0) {
    return {
      materialName: input.materialName,
      materialRequired: 0,
      materialUnit: input.packageUnit,
      packagesNeeded: 0,
      materialCost: 0,
      labourCost: 0,
      total: 0,
      currency: input.currency,
      currencySymbol: input.currencySymbol,
    };
  }

  const baseMaterial = input.netScreedingArea / input.coverageRate;
  const margin = Math.max(0, Math.min(100, input.wasteMargin)) / 100;
  const materialRequired = baseMaterial * (1 + margin);
  const packagesNeeded = Math.max(1, Math.ceil(materialRequired / input.packageSize));
  const materialCost = packagesNeeded * input.unitPrice;
  const labourCost = input.netScreedingArea * input.labourRatePerSqm;
  const total = materialCost + labourCost;

  return {
    materialName: input.materialName,
    materialRequired: round(materialRequired),
    materialUnit: input.packageUnit,
    packagesNeeded,
    materialCost: round(materialCost),
    labourCost: round(labourCost),
    total: round(total),
    currency: input.currency,
    currencySymbol: input.currencySymbol,
  };
}

export function validateScreedingInput(input: ScreedingCalcInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.method === 'full_room') {
    if (input.roomLength <= 0 || !isFinite(input.roomLength)) errors.roomLength = 'Enter a valid room length greater than 0';
    // Room width is optional, when blank, only the two walls defined by length are calculated.
  } else {
    if (input.wallWidth <= 0 || !isFinite(input.wallWidth)) errors.wallWidth = 'Enter a valid wall width greater than 0';
    if (input.wallCount < 1 || !isFinite(input.wallCount)) errors.wallCount = 'Enter at least 1 wall';
  }
  if (input.wallHeight <= 0 || !isFinite(input.wallHeight)) errors.wallHeight = 'Enter a valid wall height greater than 0';
  if (input.doors < 0 || !isFinite(input.doors)) errors.doors = 'Doors cannot be negative';
  if (input.windows < 0 || !isFinite(input.windows)) errors.windows = 'Windows cannot be negative';
  return errors;
}
