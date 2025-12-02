import { describe, expect, it } from "@jest/globals";
import path from "path";
import { runCommand, runValidationLoop } from "../src/core/run-commands";

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

describe("runValidationLoop", () => {
  it("short-circuits when validation is disabled", async () => {
    const result = await runValidationLoop({
      enableBuild: false,
      enableTest: false,
      enableLint: false,
      buildCmd: "",
      testCmd: "",
      lintCmd: "",
      maxRetries: 3,
      cwd,
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(0);
    expect(result.summary).toMatch(/disabled/i);
  });

  it("returns failure metadata when build fails", async () => {
    const result = await runValidationLoop({
      enableBuild: true,
      enableTest: true,
      enableLint: true,
      buildCmd: 'node -e "process.exit(1)"',
      testCmd: 'node -e "console.log(\\"test\\")"',
      lintCmd: 'node -e "console.log(\\"lint\\")"',
      maxRetries: 2,
      cwd,
    });

    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.lastStage).toBe("build");
    expect(result.code).toBe(1);
    expect(result.summary).toMatch(/stage=build/);
  });

  it("requires two consecutive passes", async () => {
    const result = await runValidationLoop({
      enableBuild: true,
      enableTest: true,
      enableLint: true,
      buildCmd: 'node -e "console.log(\\"build\\")"',
      testCmd: 'node -e "console.log(\\"test\\")"',
      lintCmd: 'node -e "console.log(\\"lint\\")"',
      maxRetries: 2,
      cwd,
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.summary).toMatch(/passed twice/i);
  });

  it("fails if maxRetries reached without two passes", async () => {
    const result = await runValidationLoop({
      enableBuild: true,
      enableTest: true,
      enableLint: false,
      buildCmd: 'node -e "console.log(\\"build\\")"',
      testCmd: 'node -e "process.exit(0)"',
      lintCmd: "",
      maxRetries: 1,
      cwd,
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/maxRetries/i);
  });
});
