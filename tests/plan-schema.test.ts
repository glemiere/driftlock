import { describe, expect, it } from "@jest/globals";
import planSchema from "../assets/schemas/plan.schema.json";
import { validateAgainstSchema } from "../src/utils/schema-validator";

const schemaName = "Plan schema";

const basePlan = {
  noop: false,
  reason: "Work identified",
  plan: [
    {
      action: "Do something",
      why: "Because it's needed",
      filesInvolved: ["file.ts"],
      steps: ["step"],
      supportiveEvidence: ["file.ts: evidence of problem"],
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

  it("rejects plans with more than 3 items (maxItems)", () => {
    const invalid = {
      ...basePlan,
      plan: [basePlan.plan[0], basePlan.plan[0], basePlan.plan[0], basePlan.plan[0]],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /at most 3 item/i
    );
  });

  it("allows empty filesInvolved array (per schema)", () => {
    const valid = {
      ...basePlan,
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
      ...basePlan,
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
      ...basePlan,
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

  it("allows custom category values", () => {
    const valid = {
      ...basePlan,
      plan: [
        {
          ...basePlan.plan[0],
          category: "custom-auditor",
        },
      ],
    };

    expect(() => validateAgainstSchema(valid, planSchema, { schemaName })).not.toThrow();
  });

  it("rejects missing steps", () => {
    const invalid = {
      ...basePlan,
      plan: [
        {
          action: "Do something",
          why: "Because",
          filesInvolved: ["file.ts"],
          category: "security",
          risk: "LOW",
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /missing required key "steps"/i
    );
  });

  it("rejects empty steps array", () => {
    const invalid = {
      ...basePlan,
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
      ...basePlan,
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

  it("rejects missing risk", () => {
    const invalid = {
      ...basePlan,
      plan: [
        {
          action: "Do something",
          why: "Because",
          filesInvolved: ["file.ts"],
          supportiveEvidence: ["file.ts: evidence"],
          category: "security",
          steps: ["step"],
        },
      ],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /missing required key "risk"/i
    );
  });

  it("allows noop plan with reason", () => {
    const valid = {
      ...basePlan,
      noop: true,
      reason: "No changes required",
      plan: [],
    };

    expect(() => validateAgainstSchema(valid, planSchema, { schemaName })).not.toThrow();
  });

  it("rejects noop without reason", () => {
    const invalid = {
      noop: true,
      plan: [],
    };

    expect(() => validateAgainstSchema(invalid, planSchema, { schemaName })).toThrow(
      /missing required key "reason"/i
    );
  });

  it("allows supportiveEvidence as an optional evidence array", () => {
    const valid = {
      ...basePlan,
      plan: [
        {
          ...basePlan.plan[0],
          supportiveEvidence: [
            "apps/auth/src/service.ts: duplicated validation logic near lines 40-80",
          ],
        },
      ],
    };

    expect(() => validateAgainstSchema(valid, planSchema, { schemaName })).not.toThrow();
  });
});
