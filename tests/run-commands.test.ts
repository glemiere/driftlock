import { describe, expect, it } from "@jest/globals";
import path from "path";
import { runCommand } from "../src/core/utils/run-commands";
import { checkQualityGateDisabled } from "../src/core/quality/quality-gate";

const cwd = path.resolve(__dirname, "..");

describe("runCommand", () => {
  it("returns ok on success", async () => {
    const result = await runCommand('node -e "console.log(\\"hi\\")"', cwd);
    expect(result.ok).toBe(true);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("hi");
  });

  it("returns failure metadata on non-zero exit", async () => {
    const result = await runCommand('node -e "process.exit(2)"', cwd);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(2);
  });
});

describe("checkQualityGateDisabled", () => {
  it("short-circuits when validation is disabled", () => {
    const result = checkQualityGateDisabled({
      enableBuild: false,
      enableTest: false,
      enableLint: false,
    });

    expect(result?.ok).toBe(true);
    expect(result?.attempts).toBe(0);
    expect(result?.summary).toMatch(/disabled/i);
  });

  it("returns null when any gate is enabled", () => {
    const result = checkQualityGateDisabled({
      enableBuild: true,
      enableTest: false,
      enableLint: false,
    });

    expect(result).toBeNull();
  });
});
