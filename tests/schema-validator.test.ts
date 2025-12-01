import { describe, expect, it } from "@jest/globals";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const simpleSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    enabled: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: false,
};

describe("schema-validator", () => {
  it("passes valid object", () => {
    expect(() =>
      validateAgainstSchema(
        { name: "alpha", enabled: true },
        simpleSchema,
        { schemaName: "Simple" }
      )
    ).not.toThrow();
  });

  it("rejects missing required key", () => {
    expect(() =>
      validateAgainstSchema({ enabled: true }, simpleSchema, { schemaName: "Simple" })
    ).toThrow(/missing required key "name"/i);
  });

  it("rejects unknown key when additionalProperties is false", () => {
    expect(() =>
      validateAgainstSchema(
        { name: "alpha", extra: 1 },
        simpleSchema,
        { schemaName: "Simple" }
      )
    ).toThrow(/unknown key "extra"/i);
  });

  it("allows partial when allowPartial is true", () => {
    expect(() =>
      validateAgainstSchema({ enabled: false }, simpleSchema, {
        schemaName: "Simple",
        allowPartial: true,
      })
    ).not.toThrow();
  });

  it("enforces array item types", () => {
    const arraySchema = {
      type: "array",
      items: { type: "string" },
    };

    expect(() =>
      validateAgainstSchema(["a", "b"], arraySchema, { schemaName: "Array" })
    ).not.toThrow();

    expect(() =>
      validateAgainstSchema(["a", 2], arraySchema, { schemaName: "Array" })
    ).toThrow(/expected string/i);
  });

  it("handles $ref and patternProperties", () => {
    const schemaWithRef = {
      $defs: {
        auditor: {
          type: "object",
          properties: {
            enabled: { type: "boolean" },
            path: { type: "string" },
          },
          required: ["enabled", "path"],
          additionalProperties: false,
        },
      },
      type: "object",
      properties: {
        auditors: {
          type: "object",
          patternProperties: {
            ".*": { $ref: "#/$defs/auditor" },
          },
          additionalProperties: false,
        },
      },
      required: ["auditors"],
      additionalProperties: false,
    };

    expect(() =>
      validateAgainstSchema(
        { auditors: { security: { enabled: true, path: "./path" } } },
        schemaWithRef,
        { schemaName: "RefSchema" }
      )
    ).not.toThrow();

    expect(() =>
      validateAgainstSchema(
        { auditors: { security: { enabled: true } } },
        schemaWithRef,
        { schemaName: "RefSchema" }
      )
    ).toThrow(/missing required key "path"/i);
  });
});
