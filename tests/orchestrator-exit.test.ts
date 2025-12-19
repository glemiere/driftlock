import path from "node:path";
import { describe, expect, it, jest } from "@jest/globals";
import type { DriftlockConfig } from "../src/core/config-loader";

jest.mock("../src/cli/tui", () => ({
  tui: {
    isExitRequested: jest.fn(),
    getExitReason: jest.fn(),
    logLeft: jest.fn(() => ({
      withSpinner: () => ({
        stop: jest.fn(),
        success: jest.fn(),
        failure: jest.fn(),
      }),
    })),
    logRight: jest.fn(),
    updateLeft: jest.fn(),
  },
}));

jest.mock("../src/core/plan/build-plan", () => ({
  buildPlan: jest.fn(),
}));

jest.mock("../src/core/plan/validate-plan", () => ({
  validatePlan: jest.fn(),
}));

jest.mock("../src/core/git/git-manager", () => ({
  commitPlanChanges: jest.fn(),
  pushBranch: jest.fn(),
}));

describe("runAuditLoop exit behavior", () => {
  it("records the last committed plan before honoring a queued exit request", async () => {
    const { tui } = await import("../src/cli/tui");
    const { buildPlan } = await import("../src/core/plan/build-plan");
    const { validatePlan } = await import("../src/core/plan/validate-plan");
    const { commitPlanChanges, pushBranch } = await import("../src/core/git/git-manager");
    const { runAuditLoop } = await import("../src/core/orchestrator");

    (tui.isExitRequested as jest.Mock)
      .mockImplementationOnce(() => false)
      .mockImplementationOnce(() => true);

    (buildPlan as jest.Mock).mockResolvedValue({
      name: "complexity: synthetic plan",
      plan: [{ action: "noop-but-committed", steps: [] }],
    });

    (validatePlan as jest.Mock).mockResolvedValue({ valid: true });
    (commitPlanChanges as jest.Mock).mockResolvedValue(true);
    (pushBranch as jest.Mock).mockResolvedValue(true);

    const cwd = process.cwd();
    const asset = (...segments: string[]) => path.resolve(cwd, ...segments);

    const config: DriftlockConfig = {
      auditors: {
        complexity: {
          enabled: true,
          path: asset("assets", "auditors", "complexity.md"),
          validators: ["plan"],
        },
      },
      validators: {
        plan: { path: asset("assets", "validators", "plan.md") },
        "execute-step": { path: asset("assets", "validators", "execute-step.md") },
        step: { path: asset("assets", "validators", "step.md") },
      },
      formatters: {
        plan: {
          path: asset("assets", "formatters", "plan.md"),
          schema: asset("assets", "schemas", "plan.schema.json"),
        },
        executeStep: {
          path: asset("assets", "formatters", "execute-step.md"),
          schema: asset("assets", "schemas", "execute-step.schema.json"),
        },
        testFailureSummary: {
          path: asset("assets", "sanitazors", "quality-tests.md"),
          schema: asset("assets", "schemas", "test-failure-summary.schema.json"),
        },
      },
      qualityGate: {
        build: { enabled: false, run: "true" },
        lint: { enabled: false, run: "true" },
        test: { enabled: false, run: "true" },
      },
      runBaselineQualityGate: false,
      maxValidationRetries: 1,
      maxRegressionAttempts: 1,
      maxThreadLifetimeAttempts: 1,
      pullRequest: {
        enabled: false,
        gitHostSaas: "github",
        formatter: {
          path: asset("assets", "formatters", "pull-request.md"),
          schema: asset("assets", "schemas", "pull-request.schema.json"),
        },
      },
      exclude: [],
      model: "gpt-5.1-codex-mini",
      reasoning: "low",
    };

    const result = await runAuditLoop(["complexity"], config, { branch: "driftlock/test" });
    expect(result.exitReason).toBe("user_exit");
    expect(result.committedPlans).toHaveLength(1);
  });
});
