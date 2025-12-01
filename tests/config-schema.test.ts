import { test } from "node:test";
import assert from "node:assert/strict";
import configSchema from "../schemas/config.schema.json";
import defaultConfig from "../config.default.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Config schema";

test("config schema accepts default config", () => {
  assert.doesNotThrow(() =>
    validateAgainstSchema(defaultConfig, configSchema, { schemaName })
  );
});

test("config schema rejects missing required top-level keys", () => {
  assert.throws(
    () => validateAgainstSchema({}, configSchema, { schemaName }),
    /missing required key "auditors"/i
  );
});

test("config schema rejects unknown top-level keys", () => {
  const invalid = {
    auditors: {},
    validators: {},
    formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
    extra: true,
  };

  assert.throws(
    () => validateAgainstSchema(invalid, configSchema, { schemaName }),
    /unknown key "extra"/i
  );
});

test("config schema rejects auditor missing required fields", () => {
  const invalid = {
    auditors: {
      security: { enabled: true },
    },
    validators: { structure: "./validators/structure.md" },
    formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
  };

  assert.throws(
    () => validateAgainstSchema(invalid, configSchema, { schemaName }),
    /missing required key "path"/i
  );
});

test("config schema rejects non-string validator paths", () => {
  const invalid = {
    auditors: {},
    validators: { structure: 123 },
    formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
  };

  assert.throws(
    () => validateAgainstSchema(invalid, configSchema, { schemaName }),
    /expected string/i
  );
});

test("config schema rejects auditor validators with non-strings", () => {
  const invalid = {
    auditors: {
      security: {
        enabled: true,
        path: "./auditors/security.md",
        validators: ["structure", 123],
      },
    },
    validators: { structure: "./validators/structure.md" },
    formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
  };

  assert.throws(
    () => validateAgainstSchema(invalid, configSchema, { schemaName }),
    /expected string/i
  );
});

test("config schema allows partial user config when allowPartial is true", () => {
  const partial = {
    auditors: {
      security: {
        enabled: true,
        path: "./auditors/security.md",
        validators: ["structure"],
      },
    },
  };

  assert.doesNotThrow(() =>
    validateAgainstSchema(partial, configSchema, {
      schemaName,
      allowPartial: true,
    })
  );
});

