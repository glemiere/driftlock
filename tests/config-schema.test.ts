import { describe, expect, it } from "@jest/globals";
import configSchema from "../assets/schemas/config.schema.json";
import defaultConfig from "../config.default.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Config schema";

describe("config schema", () => {
  it("accepts default config", () => {
    expect(() =>
      validateAgainstSchema(defaultConfig, configSchema, { schemaName })
    ).not.toThrow();
  });

  it("rejects missing required top-level keys", () => {
    expect(() => validateAgainstSchema({}, configSchema, { schemaName })).toThrow(
      /missing required key "auditors"/i
    );
  });

  it("rejects unknown top-level keys", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
      extra: true,
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/unknown key "extra"/i);
  });

  it("rejects auditor missing required fields", () => {
    const invalid = {
      auditors: {
        security: { enabled: true },
      },
      validators: { structure: { path: "./validators/structure.md" } },
      formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/missing required key "path"/i);
  });

  it("rejects non-string validator paths", () => {
    const invalid = {
      auditors: {},
      validators: { structure: { path: 123 } },
      formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects auditor validators with non-strings", () => {
    const invalid = {
      auditors: {
        security: {
          enabled: true,
          path: "./auditors/security.md",
          validators: ["structure", 123],
        },
      },
      validators: { structure: { path: "./validators/structure.md" } },
      formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects exclude when not array of strings", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: { plan: "./plan.md", schema: "./plan.schema.json" },
      exclude: [1, 2],
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("allows partial user config when allowPartial is true", () => {
    const partial = {
      auditors: {
        security: {
          enabled: true,
          path: "./auditors/security.md",
          validators: ["structure"],
        },
      },
    };

    expect(() =>
      validateAgainstSchema(partial, configSchema, {
        schemaName,
        allowPartial: true,
      })
    ).not.toThrow();
  });
});
