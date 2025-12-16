import { describe, expect, it } from "@jest/globals";
import { summarizeQualityFailure } from "../src/core/quality/quality-gate";
import { createQualityStages } from "../src/core/quality/quality-gate-runner";

describe("quality-gate summarizeQualityFailure", () => {
  it("returns a summary that only reflects the failing stage result", () => {
    const result = {
      ok: false,
      code: 1,
      stdout: "lint stdout",
      stderr: "lint stderr",
    };

    const summary = summarizeQualityFailure("lint", result);

    expect(summary).toContain("stage=lint");
    expect(summary).toContain("code=1");
    expect(summary).toContain("stdout:");
    expect(summary).toContain("stderr:");
    // Ensure no other stages are mentioned in the summary string.
    expect(summary).not.toContain("stage=test");
    expect(summary).not.toContain("stage=build");
  });
});

describe("createQualityStages", () => {
  it("orders stages to fail fast before tests", () => {
    const stages = createQualityStages({
      config: {
        qualityGate: {
          build: { enabled: true, run: "build" },
          lint: { enabled: true, run: "lint" },
          test: { enabled: true, run: "test" },
        },
      } as any,
      cwd: process.cwd(),
    });

    expect(stages.map((stage) => stage.name)).toEqual(["build", "lint", "test"]);
  });
});
