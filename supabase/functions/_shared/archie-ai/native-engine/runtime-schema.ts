/** Bounded, dependency-free JSON Schema dialect for ARCHIE tool boundaries.
 *
 * This is intentionally NOT advertised as full draft-2020-12 compliance. It
 * supports the keywords needed by ARCHIE's real tool contracts and rejects
 * unknown/malformed keywords instead of silently ignoring them. Schemas and
 * values are bounded before recursive validation; invalid schemas fail closed.
 */
export interface RuntimeSchemaResult {
  valid: boolean;
  error?: string;
}

const MAX_JSON_BYTES = 32_768;
const MAX_DEPTH = 12;
const MAX_STRING_LENGTH = 10_000;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_OBJECT_KEYS = 100;
const JSON_TYPES = new Set([
  "object", "array", "string", "number", "integer", "boolean", "null",
]);
const SCHEMA_KEYWORDS = new Set([
  "type", "enum", "const", "properties", "required", "additionalProperties",
  "items", "minItems", "maxItems", "uniqueItems", "minLength", "maxLength",
  "pattern", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum",
  "multipleOf", "anyOf", "oneOf", "allOf", "not", "dependentRequired",
  "description", "title", "format",
]);
const FORMATS = new Set(["uri", "url", "email", "uuid", "date-time"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
function jsonEqual(a: unknown, b: unknown): boolean {
  try { return canonicalJson(a) === canonicalJson(b); } catch { return false; }
}
function schemaError(schema: unknown, depth = 0, seen = new WeakSet<object>()): string | null {
  if (depth > MAX_DEPTH) return "schema exceeds maximum nesting depth";
  if (!isRecord(schema)) return "schema must be an object";
  if (seen.has(schema)) return "cyclic schemas are not supported";
  seen.add(schema);
  const fail = (message: string) => { seen.delete(schema); return message; };
  for (const key of Object.keys(schema)) {
    if (!SCHEMA_KEYWORDS.has(key)) return fail(`unsupported schema keyword: ${key}`);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.length || types.some((type) => typeof type !== "string" || !JSON_TYPES.has(type)))
      return fail("schema type is invalid");
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.length > MAX_ARRAY_ITEMS))
    return fail("enum must be a bounded, non-empty array");
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((v) => typeof v !== "string") || new Set(schema.required).size !== schema.required.length))
    return fail("required must contain unique property names");
  if (schema.properties !== undefined) {
    if (!isRecord(schema.properties) || Object.keys(schema.properties).length > MAX_OBJECT_KEYS) return fail("properties must be a bounded object");
    if (Object.keys(schema.properties).some((key) => key.length > 200)) return fail("property names are too long");
    for (const child of Object.values(schema.properties)) {
      const error = schemaError(child, depth + 1, seen);
      if (error) return fail(error);
    }
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    const error = schemaError(schema.additionalProperties, depth + 1, seen);
    if (error) return fail(error);
  }
  if (schema.items !== undefined) {
    const error = schemaError(schema.items, depth + 1, seen);
    if (error) return fail(error);
  }
  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    if (schema[keyword] !== undefined) {
      const list = schema[keyword];
      if (!Array.isArray(list) || list.length === 0) return fail(`${keyword} must be a non-empty schema array`);
      for (const child of list) {
        const error = schemaError(child, depth + 1, seen);
        if (error) return fail(error);
      }
    }
  }
  if (schema.not !== undefined) {
    const error = schemaError(schema.not, depth + 1, seen);
    if (error) return fail(error);
  }
  if (schema.dependentRequired !== undefined) {
    if (!isRecord(schema.dependentRequired)) return fail("dependentRequired must be an object");
    for (const required of Object.values(schema.dependentRequired)) {
      if (!Array.isArray(required) || required.some((v) => typeof v !== "string"))
        return fail("dependentRequired values must be string arrays");
    }
  }
  for (const keyword of ["minItems", "maxItems", "minLength", "maxLength"] as const) {
    const value = schema[keyword];
    if (value !== undefined && (!Number.isInteger(value) || (value as number) < 0))
      return fail(`${keyword} must be a non-negative integer`);
  }
  for (const keyword of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"] as const) {
    const value = schema[keyword];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value)))
      return fail(`${keyword} must be a finite number`);
  }
  if (typeof schema.multipleOf === "number" && schema.multipleOf <= 0)
    return fail("multipleOf must be greater than zero");
  if (typeof schema.minItems === "number" && typeof schema.maxItems === "number" && schema.minItems > schema.maxItems)
    return fail("minItems cannot exceed maxItems");
  if (typeof schema.minLength === "number" && typeof schema.maxLength === "number" && schema.minLength > schema.maxLength)
    return fail("minLength cannot exceed maxLength");
  if (typeof schema.minimum === "number" && typeof schema.maximum === "number" && schema.minimum > schema.maximum)
    return fail("minimum cannot exceed maximum");
  if (typeof schema.exclusiveMinimum === "number" && typeof schema.exclusiveMaximum === "number" && schema.exclusiveMinimum >= schema.exclusiveMaximum)
    return fail("exclusiveMinimum must be less than exclusiveMaximum");
  if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean")
    return fail("uniqueItems must be boolean");
  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== "string" || schema.pattern.length > 256) return fail("pattern must be a short string");
    // Tool schemas can come from persisted execution-target records. Limit the
    // accepted regex grammar to avoid user-controlled catastrophic backtracking.
    if (/\([^)]*[+*][^)]*\)[+*{]|\\[1-9]|\(\?/.test(schema.pattern))
      return fail("pattern uses unsupported potentially unsafe regex features");
    try { new RegExp(schema.pattern); } catch { return fail("pattern is not a valid regular expression"); }
  }
  if (schema.format !== undefined && (typeof schema.format !== "string" || !FORMATS.has(schema.format)))
    return fail("format is not supported");
  for (const keyword of ["description", "title"] as const) {
    if (schema[keyword] !== undefined && typeof schema[keyword] !== "string")
      return fail(`${keyword} must be a string`);
  }
  seen.delete(schema);
  return null;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "object": return isRecord(value);
    case "array": return Array.isArray(value);
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return false;
  }
}
function formatMatches(value: string, format: string): boolean {
  if (format === "uri" || format === "url") {
    try { const url = new URL(value); return Boolean(url.protocol && url.hostname); } catch { return false; }
  }
  if (format === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (format === "uuid") return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === "date-time") return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  return false;
}

function validateValue(value: unknown, schema: Record<string, unknown>, path: string, depth: number): RuntimeSchemaResult {
  if (depth > MAX_DEPTH) return { valid: false, error: `${path} exceeds maximum nesting depth` };
  const type = schema.type;
  if (type !== undefined) {
    const allowed = Array.isArray(type) ? type as string[] : [type as string];
    if (!allowed.some((candidate) => matchesType(value, candidate)))
      return { valid: false, error: `${path} has the wrong type` };
  }
  if (schema.enum && !(schema.enum as unknown[]).some((option) => jsonEqual(option, value)))
    return { valid: false, error: `${path} is not an allowed value` };
  if ("const" in schema && !jsonEqual(schema.const, value))
    return { valid: false, error: `${path} does not match the required constant` };
  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf as Record<string, unknown>[]) {
      const result = validateValue(value, part, path, depth + 1); if (!result.valid) return result;
    }
  }
  if (Array.isArray(schema.anyOf) && !(schema.anyOf as Record<string, unknown>[]).some((part) => validateValue(value, part, path, depth + 1).valid))
    return { valid: false, error: `${path} does not match any allowed schema` };
  if (Array.isArray(schema.oneOf)) {
    const matches = (schema.oneOf as Record<string, unknown>[]).filter((part) => validateValue(value, part, path, depth + 1).valid).length;
    if (matches !== 1) return { valid: false, error: `${path} must match exactly one allowed schema` };
  }
  if (schema.not && validateValue(value, schema.not as Record<string, unknown>, path, depth + 1).valid)
    return { valid: false, error: `${path} matches a prohibited schema` };

  if (typeof value === "string") {
    const max = Math.min(typeof schema.maxLength === "number" ? schema.maxLength : MAX_STRING_LENGTH, MAX_STRING_LENGTH);
    if (value.length > max) return { valid: false, error: `${path} is too long` };
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return { valid: false, error: `${path} is too short` };
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) return { valid: false, error: `${path} has invalid format` };
    if (typeof schema.format === "string" && !formatMatches(value, schema.format)) return { valid: false, error: `${path} is not a valid ${schema.format}` };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { valid: false, error: `${path} must be finite` };
    if (typeof schema.minimum === "number" && value < schema.minimum) return { valid: false, error: `${path} is below its minimum` };
    if (typeof schema.maximum === "number" && value > schema.maximum) return { valid: false, error: `${path} exceeds its maximum` };
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum) return { valid: false, error: `${path} must be greater than its exclusive minimum` };
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum) return { valid: false, error: `${path} must be less than its exclusive maximum` };
    if (typeof schema.multipleOf === "number" && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-10)
      return { valid: false, error: `${path} is not a multiple of ${schema.multipleOf}` };
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) return { valid: false, error: `${path} has too many fields` };
    const props = isRecord(schema.properties) ? schema.properties : {};
    for (const key of (schema.required as string[] | undefined) ?? [])
      if (!Object.prototype.hasOwnProperty.call(value, key)) return { valid: false, error: `${path}.${key} is required` };
    const dependencies = isRecord(schema.dependentRequired) ? schema.dependentRequired : {};
    for (const [trigger, required] of Object.entries(dependencies)) {
      if (Object.prototype.hasOwnProperty.call(value, trigger)) {
        for (const key of required as string[]) if (!Object.prototype.hasOwnProperty.call(value, key)) return { valid: false, error: `${path}.${key} is required when ${trigger} is present` };
      }
    }
    for (const [key, child] of entries) {
      const hasDeclaredProperty = Object.prototype.hasOwnProperty.call(props, key);
      const childSchema = hasDeclaredProperty ? props[key] : undefined;
      if (hasDeclaredProperty) {
        const result = validateValue(child, childSchema as Record<string, unknown>, `${path}.${key}`, depth + 1); if (!result.valid) return result;
      } else if (schema.additionalProperties === false) {
        return { valid: false, error: `${path}.${key} is not allowed` };
      } else if (isRecord(schema.additionalProperties)) {
        const result = validateValue(child, schema.additionalProperties, `${path}.${key}`, depth + 1); if (!result.valid) return result;
      } else {
        const result = validateBoundedJson(child, `${path}.${key}`, depth + 1); if (!result.valid) return result;
      }
    }
  }
  if (Array.isArray(value)) {
    const max = Math.min(typeof schema.maxItems === "number" ? schema.maxItems : MAX_ARRAY_ITEMS, MAX_ARRAY_ITEMS);
    if (value.length > max) return { valid: false, error: `${path} has too many items` };
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return { valid: false, error: `${path} has too few items` };
    if (schema.uniqueItems === true) {
      for (let i = 0; i < value.length; i++) for (let j = i + 1; j < value.length; j++) if (jsonEqual(value[i], value[j])) return { valid: false, error: `${path} must contain unique items` };
    }
    if (isRecord(schema.items)) {
      for (let i = 0; i < value.length; i++) {
        const result = validateValue(value[i], schema.items, `${path}[${i}]`, depth + 1); if (!result.valid) return result;
      }
    } else {
      for (let i = 0; i < value.length; i++) {
        const result = validateBoundedJson(value[i], `${path}[${i}]`, depth + 1); if (!result.valid) return result;
      }
    }
  }
  return { valid: true };
}

function validateBoundedJson(
  value: unknown,
  path: string,
  depth: number,
  seen = new WeakSet<object>(),
): RuntimeSchemaResult {
  if (depth > MAX_DEPTH) return { valid: false, error: `${path} exceeds maximum nesting depth` };
  if (typeof value === "string") return value.length <= MAX_STRING_LENGTH ? { valid: true } : { valid: false, error: `${path} is too long` };
  if (typeof value === "number") return Number.isFinite(value) ? { valid: true } : { valid: false, error: `${path} must be finite` };
  if (value === null || typeof value === "boolean") return { valid: true };
  if (Array.isArray(value)) {
    if (seen.has(value)) return { valid: false, error: `${path} contains a circular reference` };
    if (Object.getPrototypeOf(value) !== Array.prototype) return { valid: false, error: `${path} must use a plain array` };
    if (value.length > MAX_ARRAY_ITEMS) return { valid: false, error: `${path} has too many items` };
    const keys = Object.keys(value);
    if (keys.length !== value.length || keys.some((key, index) => key !== String(index)))
      return { valid: false, error: `${path} must be a dense JSON array` };
    seen.add(value);
    for (let i = 0; i < value.length; i++) {
      const result = validateBoundedJson(value[i], `${path}[${i}]`, depth + 1, seen);
      if (!result.valid) { seen.delete(value); return result; }
    }
    seen.delete(value);
    return { valid: true };
  }
  if (isRecord(value)) {
    if (seen.has(value)) return { valid: false, error: `${path} contains a circular reference` };
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      return { valid: false, error: `${path} must be a plain JSON object` };
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS) return { valid: false, error: `${path} has too many fields` };
    seen.add(value);
    for (const [key, child] of entries) {
      if (key.length > 200) { seen.delete(value); return { valid: false, error: `${path} has an oversized key` }; }
      const result = validateBoundedJson(child, `${path}.${key}`, depth + 1, seen);
      if (!result.valid) { seen.delete(value); return result; }
    }
    seen.delete(value);
    return { valid: true };
  }
  return { valid: false, error: `${path} must contain JSON values only` };
}

export function validateRuntimeSchema(value: unknown, schema: Record<string, unknown>, path = "arguments", depth = 0): RuntimeSchemaResult {
  if (depth === 0) {
    const schemaShape = validateBoundedJson(schema, "schema", 0);
    if (!schemaShape.valid) return { valid: false, error: `invalid tool schema: ${schemaShape.error}` };
    try {
      if (new TextEncoder().encode(JSON.stringify(schema)).byteLength > MAX_JSON_BYTES)
        return { valid: false, error: "invalid tool schema: schema exceeds size limit" };
    } catch {
      return { valid: false, error: "invalid tool schema: schema must be serializable JSON" };
    }
    const error = schemaError(schema);
    if (error) return { valid: false, error: `invalid tool schema: ${error}` };
    const valueResult = validateBoundedJson(value, path, 0);
    if (!valueResult.valid) return valueResult;
    try {
      if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_JSON_BYTES)
        return { valid: false, error: `${path} exceeds ${MAX_JSON_BYTES} bytes` };
    } catch {
      return { valid: false, error: `${path} must be serializable JSON` };
    }
  }
  return validateValue(value, schema, path, depth);
}

export function validateToolCall(schema: Record<string, unknown>, args: unknown): RuntimeSchemaResult {
  if (!isRecord(args)) return { valid: false, error: "tool arguments must be an object" };
  if (Object.getPrototypeOf(args) !== Object.prototype && Object.getPrototypeOf(args) !== null)
    return { valid: false, error: "tool arguments must be a plain JSON object" };
  const result = validateRuntimeSchema(args, schema);
  if (!result.valid && result.error && result.error.startsWith("arguments exceeds "))
    return { ...result, error: `tool arguments ${result.error.slice("arguments ".length)}` };
  return result;
}
