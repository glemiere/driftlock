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

  it("supports stdin input", async () => {
    const result = await runCommand("cat", cwd, { input: "hello" });
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("hello");
  });
});

describe("checkQualityGateDisabled", () => {
  it("short-circuits when validation is disabled", () => {
    const result = checkQualityGateDisabled({
      build: { enabled: false },
      lint: { enabled: false },
      test: { enabled: false },
    });

    expect(result?.ok).toBe(true);
    expect(result?.attempts).toBe(0);
    expect(result?.summary).toMatch(/disabled/i);
  });

  it("returns null when any gate is enabled", () => {
    const result = checkQualityGateDisabled({
      build: { enabled: true },
      lint: { enabled: false },
      test: { enabled: false },
    });

    expect(result).toBeNull();
  });
});
