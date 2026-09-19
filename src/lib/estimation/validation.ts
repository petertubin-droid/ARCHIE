import type { ValidationResult } from '@/types/estimation';

/**
 * Helper to construct a standardized ValidationResult object.
 */
export function createValidationResult(
  valid?: boolean,
  errors: string[] = [],
  warnings: string[] = []
): ValidationResult {
  return {
    valid: valid ?? errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Standard configuration warning message format.
 */
export function formatConfigWarning(ruleKey: string, calculatorType: string): string {
  return `This calculation requires additional FRELUX configuration before an accurate estimate can be generated. (Rule '${ruleKey}' for ${calculatorType})`;
}

/**
 * Validates object containing dimensions (e.g. { length, width, height }) or individual numeric dimensions.
 * Checks for negative values, zero, NaN, Infinity.
 */
export function validateDimensions(
  input: Record<string, unknown> | number | null | undefined
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input === null || input === undefined) {
    errors.push('Dimension input is required.');
    return createValidationResult(false, errors, warnings);
  }

  if (typeof input === 'number') {
    if (isNaN(input)) {
      errors.push('Dimension value is NaN.');
    } else if (!isFinite(input)) {
      errors.push('Dimension value is Infinity.');
    } else if (input < 0) {
      errors.push('Dimension value cannot be negative.');
    } else if (input === 0) {
      errors.push('Dimension value cannot be zero.');
    }
    return createValidationResult(errors.length === 0, errors, warnings);
  }

  if (typeof input !== 'object') {
    errors.push('Dimension input must be a valid number or object.');
    return createValidationResult(false, errors, warnings);
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    errors.push('Dimension input cannot be empty.');
    return createValidationResult(false, errors, warnings);
  }

  for (const [key, val] of entries) {
    if (val === null || val === undefined) {
      errors.push(`Dimension '${key}' is missing or required.`);
      continue;
    }
    if (typeof val !== 'number') {
      errors.push(`Dimension '${key}' must be a number.`);
      continue;
    }
    if (isNaN(val)) {
      errors.push(`Dimension '${key}' is NaN.`);
    } else if (!isFinite(val)) {
      errors.push(`Dimension '${key}' is Infinity.`);
    } else if (val < 0) {
      errors.push(`Dimension '${key}' cannot be negative (${val}).`);
    } else if (val === 0) {
      errors.push(`Dimension '${key}' cannot be zero.`);
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates a numerical quantity.
 * Checks for negative values, zero (if zero is invalid for this quantity), NaN, Infinity.
 */
export function validateQuantity(
  qty: unknown,
  name = 'Quantity',
  allowZero = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (qty === null || qty === undefined) {
    errors.push(`${name} is required.`);
    return createValidationResult(false, errors, warnings);
  }

  if (typeof qty !== 'number' || isNaN(qty)) {
    errors.push(`${name} must be a valid number.`);
    return createValidationResult(false, errors, warnings);
  }

  if (!isFinite(qty)) {
    errors.push(`${name} must be a finite number.`);
    return createValidationResult(false, errors, warnings);
  }

  if (qty < 0) {
    errors.push(`${name} cannot be negative.`);
  } else if (!allowZero && qty === 0) {
    errors.push(`${name} cannot be zero.`);
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates whether unit is present and within the allowed units list.
 */
export function validateUnit(
  unit: unknown,
  allowedUnits?: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!unit || typeof unit !== 'string' || unit.trim() === '') {
    errors.push('Unit is required.');
    return createValidationResult(false, errors, warnings);
  }

  const normalized = unit.trim();
  if (allowedUnits && allowedUnits.length > 0 && !allowedUnits.includes(normalized)) {
    errors.push(`Unit '${normalized}' is not in the allowed list: ${allowedUnits.join(', ')}.`);
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates a product object, ensuring it is active and has required fields.
 */
export function validateProduct(product: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!product || typeof product !== 'object') {
    errors.push('Product is required.');
    return createValidationResult(false, errors, warnings);
  }

  const p = product as Record<string, unknown>;

  if (!p.id) {
    errors.push('Product is missing required field: id.');
  }

  if (!p.name) {
    errors.push('Product is missing required field: name.');
  }

  if (p.is_active === false) {
    errors.push(`Product '${p.name || p.id}' is inactive.`);
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates a price value, ensuring it exists, is a finite number, and is non-negative.
 */
export function validatePrice(price: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (price === null || price === undefined) {
    errors.push('Price is required.');
    return createValidationResult(false, errors, warnings);
  }

  if (typeof price !== 'number' || isNaN(price)) {
    errors.push('Price must be a valid number.');
    return createValidationResult(false, errors, warnings);
  }

  if (!isFinite(price)) {
    errors.push('Price must be a finite number.');
    return createValidationResult(false, errors, warnings);
  }

  if (price < 0) {
    errors.push('Price cannot be negative.');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates pack size, ensuring it exists, is a finite number, and is positive (> 0).
 */
export function validatePackSize(packSize: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (packSize === null || packSize === undefined) {
    errors.push('Pack size is required.');
    return createValidationResult(false, errors, warnings);
  }

  if (typeof packSize !== 'number' || isNaN(packSize)) {
    errors.push('Pack size must be a valid number.');
    return createValidationResult(false, errors, warnings);
  }

  if (!isFinite(packSize)) {
    errors.push('Pack size must be a finite number.');
    return createValidationResult(false, errors, warnings);
  }

  if (packSize <= 0) {
    errors.push('Pack size must be greater than zero.');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validates calculation configuration rules.
 * Checks if required rules are configured (not null / undefined).
 */
export function validateCalcConfig(
  rules: Record<string, unknown> | null | undefined,
  calculatorType: string,
  requiredRules?: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rules || typeof rules !== 'object') {
    errors.push(`Calculation configuration rules are missing for '${calculatorType}'.`);
    warnings.push(formatConfigWarning('all', calculatorType));
    return createValidationResult(false, errors, warnings);
  }

  if (requiredRules && requiredRules.length > 0) {
    for (const key of requiredRules) {
      if (rules[key] === null || rules[key] === undefined) {
        errors.push(`Required configuration rule '${key}' is missing or null for '${calculatorType}'.`);
        warnings.push(formatConfigWarning(key, calculatorType));
      }
    }
  } else {
    const keys = Object.keys(rules);
    if (keys.length === 0) {
      errors.push(`Configuration rules for '${calculatorType}' are empty.`);
      warnings.push(formatConfigWarning('empty_config', calculatorType));
    } else {
      for (const [key, val] of Object.entries(rules)) {
        if (val === null || val === undefined) {
          errors.push(`Configuration rule '${key}' is unconfigured (null) for '${calculatorType}'.`);
          warnings.push(formatConfigWarning(key, calculatorType));
        }
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}
