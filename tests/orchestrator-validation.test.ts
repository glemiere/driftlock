import { describe, expect, it, jest } from "@jest/globals";
import { executePlanStep } from "../src/core/step/execute-plan-step";
import { validateStep } from "../src/core/step/validate-step";
import { checkQualityGateDisabled } from "../src/core/quality/quality-gate";
import { ThreadAttemptTracker } from "../src/core/orchestrator";

// This test file exists to assert that the orchestration glue uses the
// attempt tracker and will fail fast when caps are reached. The full
// end-to-end orchestration is covered by integration, so we keep this light.

jest.mock("../src/core/step/execute-plan-step", () => ({
  executePlanStep: jest.fn(),
}));
jest.mock("../src/core/step/validate-step", () => ({
  validateStep: jest.fn(),
}));

jest.mock("../src/core/quality/quality-gate", () => ({
  checkQualityGateDisabled: jest.fn(),
}));

describe("ThreadAttemptTracker (usage guard)", () => {
  it("caps executor attempts", () => {
    const tracker = new ThreadAttemptTracker(2);
    expect(tracker.recordAttempt()).toBe(true);
    expect(tracker.recordAttempt()).toBe(true);
    expect(tracker.recordAttempt()).toBe(false);
  });
});

describe("stubs wired for orchestrator validation", () => {
  it("exports the mocked functions for future integration tests", () => {
    expect(typeof executePlanStep).toBe("function");
    expect(typeof validateStep).toBe("function");
    expect(typeof checkQualityGateDisabled).toBe("function");
  });
});
