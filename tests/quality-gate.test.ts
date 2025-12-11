import { describe, expect, it } from "@jest/globals";
import { summarizeQualityFailure } from "../src/core/quality/quality-gate";

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
    expect(summary).toContain("stdout=");
    expect(summary).toContain("stderr=");
    // Ensure no other stages are mentioned in the summary string.
    expect(summary).not.toContain("stage=test");
    expect(summary).not.toContain("stage=build");
  });
});
