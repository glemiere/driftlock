import { describe, expect, it } from "@jest/globals";
import executeStepSchema from "../assets/schemas/execute-step.schema.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Execute step schema";

const baseResult = {
  success: true,
  summary: "Applied step patch successfully.",
  mode: "apply",
};

describe("execute-step schema", () => {
  it("accepts minimal valid result", () => {
    expect(() =>
      validateAgainstSchema(baseResult, executeStepSchema, { schemaName })
    ).not.toThrow();
  });

  it("accepts result with optional fields populated", () => {
    const full = {
      ...baseResult,
      details: "Extra execution detail.",
      filesTouched: ["src/index.ts"],
      filesWritten: ["src/index.ts"],
      patch: "--- a/src/index.ts\n+++ b/src/index.ts\n@@\n-foo\n+bar\n",
    };

    expect(() =>
      validateAgainstSchema(full, executeStepSchema, { schemaName })
    ).not.toThrow();
  });

  it("rejects non-boolean success", () => {
    const invalid = {
      ...baseResult,
      success: "yes",
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/expected boolean/i);
  });

  it("rejects missing summary", () => {
    const { summary, ...rest } = baseResult;
    const invalid = rest;

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/missing required key "summary"/i);
  });

  it("rejects empty summary", () => {
    const invalid = {
      ...baseResult,
      summary: "",
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/minLength 1/i);
  });

  it("rejects unknown properties", () => {
    const invalid = {
      ...baseResult,
      extra: "nope",
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/unknown key "extra"/i);
  });

  it("rejects invalid mode", () => {
    const invalid = {
      ...baseResult,
      mode: "other",
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/value must be one of apply, fix_regression/i);
  });

  it("rejects non-string in filesTouched", () => {
    const invalid = {
      ...baseResult,
      filesTouched: ["ok", 123],
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/expected string/i);
  });

  it("rejects non-string patch", () => {
    const invalid = {
      ...baseResult,
      patch: 42,
    };

    expect(() =>
      validateAgainstSchema(invalid, executeStepSchema, { schemaName })
    ).toThrow(/expected string/i);
  });
});

