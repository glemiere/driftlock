import { test } from "node:test";
import assert from "node:assert/strict";
import planSchema from "../schemas/plan.schema.json";
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

test("plan schema rejects numeric risk", () => {
  const invalid = {
    ...basePlan,
    plan: [{ ...basePlan.plan[0], risk: 1 as unknown as string }],
  };

  assert.throws(
    () => validateAgainstSchema(invalid, planSchema, { schemaName }),
    /expected string/i
  );
});

test("plan schema rejects empty plan array (minItems)", () => {
  const invalid = { plan: [] };
  assert.throws(
    () => validateAgainstSchema(invalid, planSchema, { schemaName }),
    /at least 1 item/i
  );
});

test("plan schema rejects plans with more than 3 items (maxItems)", () => {
  const invalid = {
    plan: [
      basePlan.plan[0],
      basePlan.plan[0],
      basePlan.plan[0],
      basePlan.plan[0],
    ],
  };

  assert.throws(
    () => validateAgainstSchema(invalid, planSchema, { schemaName }),
    /at most 3 item/i
  );
});

test("plan schema allows empty filesInvolved array (per schema)", () => {
  const valid = {
    plan: [
      {
        ...basePlan.plan[0],
        filesInvolved: [],
      },
    ],
  };

  assert.doesNotThrow(() =>
    validateAgainstSchema(valid, planSchema, { schemaName })
  );
});

test("plan schema rejects nested objects in filesInvolved", () => {
  const invalid = {
    plan: [
      {
        ...basePlan.plan[0],
        filesInvolved: [{ file: "nested" }],
      },
    ],
  };

  assert.throws(
    () => validateAgainstSchema(invalid, planSchema, { schemaName }),
    /expected string/i
  );
});

test("plan schema rejects unknown fields in plan items", () => {
  const invalid = {
    plan: [
      {
        ...basePlan.plan[0],
        extraField: "nope",
      },
    ],
  };

  assert.throws(
    () => validateAgainstSchema(invalid, planSchema, { schemaName }),
    /unknown key "extraField"/i
  );
});

