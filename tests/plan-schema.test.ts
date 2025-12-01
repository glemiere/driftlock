import { describe, expect, it } from "@jest/globals";
import planSchema from "../assets/schemas/plan.schema.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Plan schema";

const basePlan = {
  plan: [
    {
      action: "Do something",
      why: "Because it's needed",
      filesInvolved: ["file.ts"],
      risk: "LOW",
      category: "security",
    },
  ],
};

describe("plan schema", () => {
  it("rejects numeric risk", () => {
    const invalid = {
      ...basePlan,
      plan: [{ ...basePlan.plan[0], risk: 1 as unknown as string, steps: ["step"] }],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /expected string/i
    );
  });

  it("rejects empty plan array (minItems)", () => {
    const invalid = { plan: [] };
    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /at least 1 item/i
    );
  });

  it("rejects plans with more than 3 items (maxItems)", () => {
    const invalid = {
      plan: [basePlan.plan[0], basePlan.plan[0], basePlan.plan[0], basePlan.plan[0]],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /at most 3 item/i
    );
  });

  it("allows empty filesInvolved array (per schema)", () => {
    const valid = {
      plan: [
        {
          ...basePlan.plan[0],
          filesInvolved: [],
          steps: ["step"],
        },
      ],
    };

    expect(() => validateAgainstSchema(valid, planSchema, { schemaName })).not.toThrow();
  });

  it("rejects nested objects in filesInvolved", () => {
    const invalid = {
      plan: [
        {
          ...basePlan.plan[0],
          filesInvolved: [{ file: "nested" }],
          steps: ["step"],
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /expected string/i
    );
  });

  it("rejects unknown fields in plan items", () => {
    const invalid = {
      plan: [
        {
          ...basePlan.plan[0],
          extraField: "nope",
          steps: ["step"],
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /unknown key "extraField"/i
    );
  });

  it("allows custom category values", () => {
    const valid = {
      plan: [
        {
          ...basePlan.plan[0],
          category: "custom-auditor",
          steps: ["step"],
        },
      ],
    };

    expect(() => validateAgainstSchema(valid, planSchema, { schemaName })).not.toThrow();
  });

  it("rejects missing steps", () => {
    const invalid = {
      plan: [
        {
          action: "Do something",
          why: "Because",
          filesInvolved: ["file.ts"],
          category: "security",
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /missing required key "steps"/i
    );
  });

  it("rejects empty steps array", () => {
    const invalid = {
      plan: [
        {
          ...basePlan.plan[0],
          steps: [],
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /at least 1 item/i
    );
  });

  it("rejects non-string steps", () => {
    const invalid = {
      plan: [
        {
          ...basePlan.plan[0],
          steps: ["valid", 123],
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /expected string/i
    );
  });
});
