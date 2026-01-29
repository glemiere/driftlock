import { describe, expect, it } from "@jest/globals";

import planSchema from "../assets/schemas/plan.schema.json";
import executeStepSchema from "../assets/schemas/execute-step.schema.json";
import validatePlanSchema from "../assets/schemas/validate-plan.schema.json";
import pullRequestSchema from "../assets/schemas/pull-request.schema.json";
import testFailureSummarySchema from "../assets/schemas/test-failure-summary.schema.json";

type JsonSchema = { type?: unknown; additionalProperties?: unknown };

function expectCodexOutputSchema(schema: JsonSchema, name: string) {
  expect(schema.type).toBe("object");
  expect(schema.additionalProperties).toBe(false);
  const properties = (schema as { properties?: unknown }).properties;
  const required = (schema as { required?: unknown }).required;
  expect(properties && typeof properties === "object" && !Array.isArray(properties)).toBe(true);
  expect(Array.isArray(required)).toBe(true);

  const requiredSet = new Set(
    (required as unknown[]).filter((value): value is string => typeof value === "string")
  );
  for (const key of Object.keys(properties as Record<string, unknown>)) {
    expect(requiredSet.has(key)).toBe(true);
  }
}

describe("Codex output schemas", () => {
  it("use top-level object schemas (Codex requirement)", () => {
    expectCodexOutputSchema(planSchema as JsonSchema, "plan.schema.json");
    expectCodexOutputSchema(executeStepSchema as JsonSchema, "execute-step.schema.json");
    expectCodexOutputSchema(validatePlanSchema as JsonSchema, "validate-plan.schema.json");
    expectCodexOutputSchema(pullRequestSchema as JsonSchema, "pull-request.schema.json");
    expectCodexOutputSchema(testFailureSummarySchema as JsonSchema, "test-failure-summary.schema.json");
  });
});
