import { jest } from "@jest/globals";
import path from "path";
import { validatePlan } from "../src/core/plan/validate-plan";

const mockRunStreamed = jest.fn();

jest.mock("../src/core/utils/codex-utils", () => {
  const actual = jest.requireActual<typeof import("../src/core/utils/codex-utils")>(
    "../src/core/utils/codex-utils"
  );
  return {
    ...actual,
    dynamicImport: jest.fn(async () => ({
      Codex: class {
        startThread() {
          return { runStreamed: mockRunStreamed };
        }
      },
    })),
  };
});

describe("validatePlan exclusions", () => {
  const root = path.resolve(__dirname, "..");

  beforeEach(() => {
    mockRunStreamed.mockReset();
  });

  it("rejects plans that touch excluded paths", async () => {
    const plan = {
      plan: [
        {
          action: "Add central AGENTS.md",
          why: "Document available auditors",
          filesInvolved: ["AGENTS.md", ".ai/auditors/security.md"],
          steps: ["Create AGENTS.md linking to security auditor"],
          supportiveEvidence: ["AGENTS.md missing; security auditor exists under .ai/auditors"],
          category: "Documentation",
          risk: "LOW",
        },
      ],
      noop: false,
      reason: "Missing AGENTS.md",
    };

    const result = await validatePlan({
      auditorName: "documentation",
      validatorName: "plan",
      validatorPath: path.resolve(root, "assets/validators/plan.md"),
      plan,
      planSchemaPath: path.resolve(root, "assets/schemas/plan.schema.json"),
      validateSchemaPath: path.resolve(root, "assets/schemas/validate-plan.schema.json"),
      model: "test-model",
      workingDirectory: root,
      excludePaths: [path.resolve(root, ".ai")],
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/excluded paths/i);
  });

  it("passes validation results through when no exclusions are hit", async () => {
    mockRunStreamed.mockImplementation(() => ({
      events: (async function* () {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: JSON.stringify({ valid: true }) },
        };
      })(),
    }));

    const plan = {
      plan: [
        {
          action: "Touch non-excluded file",
          why: "Safe",
          filesInvolved: ["README.md"],
          steps: ["Update README"],
           supportiveEvidence: ["README.md exists and is not excluded"],
          category: "Documentation",
          risk: "LOW",
        },
      ],
      noop: false,
      reason: "work to do",
    };

    const result = await validatePlan({
      auditorName: "documentation",
      validatorName: "plan",
      validatorPath: path.resolve(root, "assets/validators/plan.md"),
      plan,
      planSchemaPath: path.resolve(root, "assets/schemas/plan.schema.json"),
      validateSchemaPath: path.resolve(root, "assets/schemas/validate-plan.schema.json"),
      model: "test-model",
      workingDirectory: root,
    });

    expect(result.valid).toBe(true);
  });

  it("returns validator rejection reason", async () => {
    mockRunStreamed.mockImplementation(() => ({
      events: (async function* () {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: JSON.stringify({ valid: false, reason: "too big" }) },
        };
      })(),
    }));

    const plan = {
      plan: [
        {
          action: "Touch non-excluded file",
          why: "Safe",
          filesInvolved: ["README.md"],
          steps: ["Update README"],
          supportiveEvidence: ["README.md exists and is not excluded"],
          category: "Documentation",
          risk: "LOW",
        },
      ],
      noop: false,
      reason: "work to do",
    };

    const result = await validatePlan({
      auditorName: "documentation",
      validatorName: "plan",
      validatorPath: path.resolve(root, "assets/validators/plan.md"),
      plan,
      planSchemaPath: path.resolve(root, "assets/schemas/plan.schema.json"),
      validateSchemaPath: path.resolve(root, "assets/schemas/validate-plan.schema.json"),
      model: "test-model",
      workingDirectory: root,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too big");
  });

  it("rejects invalid plan schema before validator", async () => {
    const invalidPlan = { noop: false, reason: "missing required fields", plan: [{}] };

    const result = await validatePlan({
      auditorName: "documentation",
      validatorName: "plan",
      validatorPath: path.resolve(root, "assets/validators/plan.md"),
      plan: invalidPlan,
      planSchemaPath: path.resolve(root, "assets/schemas/plan.schema.json"),
      validateSchemaPath: path.resolve(root, "assets/schemas/validate-plan.schema.json"),
      model: "test-model",
      workingDirectory: root,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/missing required key/i);
    expect(mockRunStreamed).not.toHaveBeenCalled();
  });

  it("parses stringified plans", async () => {
    mockRunStreamed.mockImplementation(() => ({
      events: (async function* () {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: JSON.stringify({ valid: true }) },
        };
      })(),
    }));

    const planObj = {
      plan: [
        {
          action: "Update README",
          why: "Clarity",
          filesInvolved: ["README.md"],
          steps: ["Edit README"],
          supportiveEvidence: ["Outdated section in README.md"],
          category: "Documentation",
          risk: "LOW",
        },
      ],
      noop: false,
      reason: "work to do",
    };

    const result = await validatePlan({
      auditorName: "documentation",
      validatorName: "plan",
      validatorPath: path.resolve(root, "assets/validators/plan.md"),
      plan: JSON.stringify(planObj),
      planSchemaPath: path.resolve(root, "assets/schemas/plan.schema.json"),
      validateSchemaPath: path.resolve(root, "assets/schemas/validate-plan.schema.json"),
      model: "test-model",
      workingDirectory: root,
    });

    expect(result.valid).toBe(true);
  });
});
