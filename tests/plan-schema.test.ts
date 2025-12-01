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
      plan: [{ ...basePlan.plan[0], risk: 1 as unknown as string }],
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
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /unknown key "extraField"/i
    );
  });
});
