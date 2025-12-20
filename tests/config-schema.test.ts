import { describe, expect, it } from "@jest/globals";
import configSchema from "../assets/schemas/config.schema.json";
import defaultConfig from "../config.default.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Config schema";

describe("config schema", () => {
  const minimalFormatters = {
    plan: { path: "./formatters/plan.md", schema: "./schemas/plan.schema.json" },
    executeStep: {
      path: "./formatters/execute-step.md",
      schema: "./schemas/execute-step.schema.json",
    },
    testFailureSummary: {
      path: "./sanitazors/quality-tests.md",
      schema: "./schemas/test-failure-summary.schema.json",
    },
  };

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
      formatters: minimalFormatters,
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
      validators: { plan: { path: "./validators/plan.md" } },
      formatters: minimalFormatters,
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/missing required key "path"/i);
  });

  it("rejects non-string validator paths", () => {
    const invalid = {
      auditors: {},
      validators: { plan: { path: 123 } },
      formatters: minimalFormatters,
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
          validators: ["plan", 123],
        },
      },
      validators: { plan: { path: "./validators/plan.md" } },
      formatters: minimalFormatters,
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects exclude when not array of strings", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      exclude: [1, 2],
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("accepts validators map with multiple entries", () => {
    const valid = {
      auditors: {},
      validators: {
        plan: { path: "./validators/plan.md" },
        "execute-step": { path: "./validators/execute-step.md" },
        step: { path: "./validators/step.md" },
      },
      formatters: minimalFormatters,
    };

    expect(() =>
      validateAgainstSchema(valid, configSchema, { schemaName, allowPartial: true })
    ).not.toThrow();
  });

  it("rejects qualityGate stage run when not string", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      qualityGate: {
        build: { enabled: true, run: 123 },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects qualityGate stage enabled when not boolean", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      qualityGate: {
        build: { enabled: "true", run: "npm run build" },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected boolean/i);
  });

  it("rejects pullRequest enabled when not boolean", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      pullRequest: {
        enabled: "true",
        gitHostSaas: "github",
        formatter: {
          path: "./formatters/pull-request.md",
          schema: "./schemas/pull-request.schema.json",
        },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected boolean/i);
  });

  it("rejects pullRequest formatter path when not string", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      pullRequest: {
        enabled: true,
        gitHostSaas: "github",
        formatter: {
          path: 123,
          schema: "./schemas/pull-request.schema.json",
        },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects fixRegressionModel when not string", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: {
        ...minimalFormatters,
        executeStep: {
          ...minimalFormatters.executeStep,
          fixRegressionModel: 123,
        },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects turnTimeoutMs when not number", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      turnTimeoutMs: "fast",
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/turnTimeoutMs/i);
  });

  it("rejects invalid reasoning values", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: minimalFormatters,
      reasoning: "turbo",
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/must be one of/i);
  });

  it("rejects fixRegressionReasoning when invalid", () => {
    const invalid = {
      auditors: {},
      validators: {},
      formatters: {
        ...minimalFormatters,
        executeStep: {
          ...minimalFormatters.executeStep,
          fixRegressionReasoning: "turbo",
        },
      },
    };

    expect(() =>
      validateAgainstSchema(invalid, configSchema, { schemaName })
    ).toThrow(/fixRegressionReasoning/i);
  });

  it("allows partial user config when allowPartial is true", () => {
    const partial = {
      auditors: {
        security: {
          enabled: true,
          path: "./auditors/security.md",
          validators: ["plan"],
        },
      },
      qualityGate: {
        build: { enabled: false, run: "npm run build" },
        lint: { enabled: false, run: "npm run lint" },
        test: { enabled: true, run: "npm test" },
      },
      runBaselineQualityGate: true,
      maxValidationRetries: 5,
      maxRegressionAttempts: 2,
      maxThreadLifetimeAttempts: 4,
      pullRequest: {
        enabled: true,
        formatter: {
          path: "./formatters/pull-request.md",
          schema: "./schemas/pull-request.schema.json",
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
