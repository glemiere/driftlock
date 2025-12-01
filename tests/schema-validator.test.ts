import { test } from "node:test";
import assert from "node:assert/strict";
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

test("schema-validator passes valid object", () => {
  assert.doesNotThrow(() =>
    validateAgainstSchema(
      { name: "alpha", enabled: true },
      simpleSchema,
      { schemaName: "Simple" }
    )
  );
});

test("schema-validator rejects missing required key", () => {
  assert.throws(
    () => validateAgainstSchema({ enabled: true }, simpleSchema, { schemaName: "Simple" }),
    /missing required key "name"/i
  );
});

test("schema-validator rejects unknown key when additionalProperties is false", () => {
  assert.throws(
    () =>
      validateAgainstSchema(
        { name: "alpha", extra: 1 },
        simpleSchema,
        { schemaName: "Simple" }
      ),
    /unknown key "extra"/i
  );
});

test("schema-validator allows partial when allowPartial is true", () => {
  assert.doesNotThrow(() =>
    validateAgainstSchema({ enabled: false }, simpleSchema, {
      schemaName: "Simple",
      allowPartial: true,
    })
  );
});

test("schema-validator enforces array item types", () => {
  const arraySchema = {
    type: "array",
    items: { type: "string" },
  };

  assert.doesNotThrow(() =>
    validateAgainstSchema(["a", "b"], arraySchema, { schemaName: "Array" })
  );

  assert.throws(
    () => validateAgainstSchema(["a", 2], arraySchema, { schemaName: "Array" }),
    /expected string/i
  );
});

test("schema-validator handles $ref and patternProperties", () => {
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

  assert.doesNotThrow(() =>
    validateAgainstSchema(
      { auditors: { security: { enabled: true, path: "./path" } } },
      schemaWithRef,
      { schemaName: "RefSchema" }
    )
  );

  assert.throws(
    () =>
      validateAgainstSchema(
        { auditors: { security: { enabled: true } } },
        schemaWithRef,
        { schemaName: "RefSchema" }
      ),
    /missing required key "path"/i
  );
});

