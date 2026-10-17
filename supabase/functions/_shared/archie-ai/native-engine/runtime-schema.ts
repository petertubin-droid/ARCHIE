/** Small, fail-closed JSON Schema subset for tool-call boundaries.
 * Supports the schema keywords used by chat tools without pulling in a
 * provider-specific validator. Unknown schema types/keywords do not relax
 * the structural limits enforced here.
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

export function validateRuntimeSchema(
  value: unknown,
  schema: Record<string, unknown>,
  path = "arguments",
  depth = 0,
): RuntimeSchemaResult {
  if (depth > MAX_DEPTH)
    return { valid: false, error: `${path} exceeds maximum nesting depth` };
  if (
    schema.enum &&
    Array.isArray(schema.enum) &&
    !schema.enum.some((option) => option === value)
  ) {
    return { valid: false, error: `${path} is not an allowed value` };
  }
  if ("const" in schema && schema.const !== value)
    return {
      valid: false,
      error: `${path} does not match the required constant`,
    };

  const type = schema.type;
  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return { valid: false, error: `${path} must be an object` };
    const object = value as Record<string, unknown>;
    const entries = Object.entries(object);
    if (entries.length > MAX_OBJECT_KEYS)
      return { valid: false, error: `${path} has too many fields` };
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string")
      : [];
    for (const key of required)
      if (!(key in object))
        return { valid: false, error: `${path}.${key} is required` };
    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
    for (const [key, child] of entries) {
      const childSchema = properties[key];
      if (!childSchema) {
        if (schema.additionalProperties === false)
          return { valid: false, error: `${path}.${key} is not allowed` };
        if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === "object" &&
          !Array.isArray(schema.additionalProperties)
        ) {
          const result = validateRuntimeSchema(
            child,
            schema.additionalProperties as Record<string, unknown>,
            `${path}.${key}`,
            depth + 1,
          );
          if (!result.valid) return result;
        } else {
          const result = validateBoundedJson(
            child,
            `${path}.${key}`,
            depth + 1,
          );
          if (!result.valid) return result;
        }
        continue;
      }
      if (
        !child ||
        typeof childSchema !== "object" ||
        Array.isArray(childSchema)
      ) {
        if (typeof childSchema !== "object" || Array.isArray(childSchema))
          return {
            valid: false,
            error: `${path}.${key} has an invalid schema`,
          };
      }
      const result = validateRuntimeSchema(
        child,
        childSchema as Record<string, unknown>,
        `${path}.${key}`,
        depth + 1,
      );
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  if (type === "array") {
    if (!Array.isArray(value))
      return { valid: false, error: `${path} must be an array` };
    const maxItems =
      typeof schema.maxItems === "number"
        ? Math.min(schema.maxItems, MAX_ARRAY_ITEMS)
        : MAX_ARRAY_ITEMS;
    if (value.length > maxItems)
      return { valid: false, error: `${path} has too many items` };
    if (typeof schema.minItems === "number" && value.length < schema.minItems)
      return { valid: false, error: `${path} has too few items` };
    if (
      schema.items &&
      typeof schema.items === "object" &&
      !Array.isArray(schema.items)
    ) {
      for (let i = 0; i < value.length; i += 1) {
        const result = validateRuntimeSchema(
          value[i],
          schema.items as Record<string, unknown>,
          `${path}[${i}]`,
          depth + 1,
        );
        if (!result.valid) return result;
      }
    }
    return { valid: true };
  }
  if (type === "string") {
    if (typeof value !== "string")
      return { valid: false, error: `${path} must be a string` };
    const maxLength =
      typeof schema.maxLength === "number"
        ? Math.min(schema.maxLength, MAX_STRING_LENGTH)
        : MAX_STRING_LENGTH;
    if (value.length > maxLength)
      return { valid: false, error: `${path} is too long` };
    if (typeof schema.minLength === "number" && value.length < schema.minLength)
      return { valid: false, error: `${path} is too short` };
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern).test(value))
          return { valid: false, error: `${path} has invalid format` };
      } catch {
        return { valid: false, error: `${path} has an invalid schema pattern` };
      }
    }
    return { valid: true };
  }
  if (type === "number" || type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (type === "integer" && !Number.isInteger(value))
    )
      return { valid: false, error: `${path} must be a finite ${type}` };
    if (typeof schema.minimum === "number" && value < schema.minimum)
      return { valid: false, error: `${path} is below its minimum` };
    if (typeof schema.maximum === "number" && value > schema.maximum)
      return { valid: false, error: `${path} exceeds its maximum` };
    return { valid: true };
  }
  if (type === "boolean")
    return typeof value === "boolean"
      ? { valid: true }
      : { valid: false, error: `${path} must be a boolean` };
  if (type === "null")
    return value === null
      ? { valid: true }
      : { valid: false, error: `${path} must be null` };
  if (type !== undefined)
    return { valid: false, error: `${path} uses unsupported schema type` };

  // Schemas without a type remain structurally bounded and JSON-safe.
  return validateBoundedJson(value, path, depth);
}

function validateBoundedJson(
  value: unknown,
  path: string,
  depth: number,
): RuntimeSchemaResult {
  if (depth > MAX_DEPTH)
    return { valid: false, error: `${path} exceeds maximum nesting depth` };
  if (typeof value === "string")
    return value.length <= MAX_STRING_LENGTH
      ? { valid: true }
      : { valid: false, error: `${path} is too long` };
  if (typeof value === "number")
    return Number.isFinite(value)
      ? { valid: true }
      : { valid: false, error: `${path} must be finite` };
  if (value === null || typeof value === "boolean") return { valid: true };
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS)
      return { valid: false, error: `${path} has too many items` };
    for (let i = 0; i < value.length; i += 1) {
      const result = validateBoundedJson(value[i], `${path}[${i}]`, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_OBJECT_KEYS)
      return { valid: false, error: `${path} has too many fields` };
    for (const [key, child] of entries) {
      if (key.length > 200)
        return { valid: false, error: `${path} has an oversized key` };
      const result = validateBoundedJson(child, `${path}.${key}`, depth + 1);
      if (!result.valid) return result;
    }
    return { valid: true };
  }
  return { valid: false, error: `${path} must contain JSON values only` };
}

export function validateToolCall(
  schema: Record<string, unknown>,
  args: unknown,
): RuntimeSchemaResult {
  if (!args || typeof args !== "object" || Array.isArray(args))
    return { valid: false, error: "tool arguments must be an object" };
  try {
    if (
      new TextEncoder().encode(JSON.stringify(args)).byteLength > MAX_JSON_BYTES
    )
      return {
        valid: false,
        error: `tool arguments exceed ${MAX_JSON_BYTES} bytes`,
      };
  } catch {
    return { valid: false, error: "tool arguments must be serializable JSON" };
  }
  return validateRuntimeSchema(args, schema);
}
