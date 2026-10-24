import { describe, expect, it } from "vitest";
import { validateRuntimeSchema, validateToolCall } from "@studio-shared/archie-ai/native-engine/runtime-schema.ts";

describe("ARCHIE bounded runtime schema dialect", () => {
  it("validates nested objects, arrays, enums, cross-field requirements and additional properties", () => {
    const schema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["file", "snippet"] },
        payload: {
          type: "object",
          properties: { source: { type: "string", minLength: 1, maxLength: 20 } },
          required: ["source"], additionalProperties: false,
        },
        values: { type: "array", minItems: 1, maxItems: 3, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 10 } },
      },
      required: ["mode"],
      dependentRequired: { mode: ["payload"] },
      additionalProperties: false,
    };
    expect(validateToolCall(schema, { mode: "file", payload: { source: "src/a.ts" }, values: [1, 3] }).valid).toBe(true);
    expect(validateToolCall(schema, { mode: "file" }).valid).toBe(false);
    expect(validateToolCall(schema, { mode: "bad", payload: { source: "x" } }).valid).toBe(false);
    expect(validateToolCall(schema, { mode: "file", payload: { source: "x", ignored: true } }).valid).toBe(false);
    expect(validateToolCall(schema, { mode: "file", payload: { source: "x" }, values: [1, 1] }).valid).toBe(false);
    expect(validateToolCall(schema, { mode: "file", payload: { source: "x" }, values: [1.5] }).valid).toBe(false);
    expect(validateToolCall(schema, { mode: "file", payload: { source: "x" }, surprise: true }).valid).toBe(false);
  });

  it("implements composition and rejects ambiguous oneOf matches", () => {
    expect(validateRuntimeSchema("a", { anyOf: [{ const: "a" }, { const: "b" }] }).valid).toBe(true);
    expect(validateRuntimeSchema(5, { oneOf: [{ type: "number" }, { type: "integer" }] }).valid).toBe(false);
    expect(validateRuntimeSchema(5, { allOf: [{ type: "integer" }, { minimum: 1 }] }).valid).toBe(true);
    expect(validateRuntimeSchema("blocked", { not: { const: "blocked" } }).valid).toBe(false);
  });

  it("fails closed on invalid schema declarations and unsupported keywords", () => {
    expect(validateRuntimeSchema({}, { type: "mystery" } as Record<string, unknown>).valid).toBe(false);
    expect(validateRuntimeSchema({}, { type: "object", properties: { x: { type: "string", madeUpKeyword: true } } }).valid).toBe(false);
    expect(validateRuntimeSchema({}, { type: "array", items: { type: "string", pattern: "[" } }).valid).toBe(false);
    expect(validateRuntimeSchema({}, { type: "object", required: ["x", "x"] }).valid).toBe(false);
  });

  it("enforces formats, exact numeric boundaries and JSON resource limits", () => {
    expect(validateRuntimeSchema("https://example.com/path", { type: "string", format: "uri" }).valid).toBe(true);
    expect(validateRuntimeSchema("not a url", { type: "string", format: "url" }).valid).toBe(false);
    expect(validateRuntimeSchema(0.3, { type: "number", multipleOf: 0.1 }).valid).toBe(true);
    expect(validateRuntimeSchema(2, { type: "integer", exclusiveMaximum: 2 }).valid).toBe(false);
    expect(validateToolCall({ type: "object", properties: {}, additionalProperties: false }, { nested: "x".repeat(33_000) }).valid).toBe(false);
    expect(validateToolCall({ type: "object", properties: {}, additionalProperties: false }, Object.assign(Object.create({ inherited: true }), { own: 1 })).valid).toBe(false);
  });

  it("fails closed on cyclic, sparse, oversized, and non-plain nested inputs and schemas", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(validateToolCall({ type: "object" }, cyclic).valid).toBe(false);
    expect(validateRuntimeSchema({}, cyclic).valid).toBe(false);
    // eslint-disable-next-line no-sparse-arrays -- sparse arrays are the regression input
    expect(validateRuntimeSchema([, 1], { type: "array" }).valid).toBe(false);
    expect(validateRuntimeSchema({ child: Object.assign(Object.create({ inherited: true }), { value: 1 }) }, { type: "object" }).valid).toBe(false);
  });

  it("matches anyOf exactly one branch and rejects zero or multiple matches", () => {
    const exclusive = { type: "object", anyOf: [
      { type: "object", required: ["a"] },
      { type: "object", required: ["b"] },
    ] };
    expect(validateRuntimeSchema({ a: true }, exclusive).valid).toBe(true);
    expect(validateRuntimeSchema({ a: true, b: true }, { type: "object", oneOf: exclusive.anyOf }).valid).toBe(false);
    expect(validateRuntimeSchema({}, { type: "object", oneOf: exclusive.anyOf }).valid).toBe(false);
  });
});
