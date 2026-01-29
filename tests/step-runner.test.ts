import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, jest } from "@jest/globals";

const mockExecutePlanStep = jest.fn();
jest.mock("../src/core/step/execute-plan-step", () => ({
  executePlanStep: (...args: unknown[]) => mockExecutePlanStep(...args),
}));

const mockCaptureWorktreeSnapshot = jest.fn();
const mockDiffWorktreeSnapshots = jest.fn();
jest.mock("../src/core/git/worktree", () => ({
  captureWorktreeSnapshot: (...args: unknown[]) => mockCaptureWorktreeSnapshot(...args),
  diffWorktreeSnapshots: (...args: unknown[]) => mockDiffWorktreeSnapshots(...args),
}));

import { executeStepPhase } from "../src/core/step/step-runner";

describe("executeStepPhase", () => {
  it("accepts successful executor output without patch/files when git detects changes", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-step-runner-"));
    const changedFile = "src/a.ts";
    const filePath = path.join(tmpDir, changedFile);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "export const a = 1;\n", "utf8");

    mockExecutePlanStep.mockResolvedValue({
      result: { success: true, summary: "ok", mode: "apply" },
      agentMessage: null,
      thread: null,
    });
    mockCaptureWorktreeSnapshot.mockResolvedValue({ files: new Map() });
    mockDiffWorktreeSnapshots.mockReturnValue([changedFile]);

    const result = await executeStepPhase({
      auditorName: "test",
      stepText: "Do a thing",
      mode: "apply",
      model: "test-model",
      workingDirectory: tmpDir,
      additionalDirectories: [],
      formatterPath: "formatter.md",
      schemaPath: "schema.json",
      coreContext: null,
      excludePaths: [],
      additionalContext: "",
      tracker: { recordAttempt: () => true, isExhausted: () => false },
      thread: null,
    });

    expect(result.kind).toBe("proceed");
    if (result.kind !== "proceed") return;
    expect(result.execution.filesTouched).toEqual([changedFile]);
    expect(result.execution.filesWritten).toEqual([changedFile]);
  });

  it("aborts when git detects excluded-path modifications", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-step-runner-"));
    const excludedDir = path.join(tmpDir, "excluded");
    const changedFile = "excluded/file.ts";

    mockExecutePlanStep.mockResolvedValue({
      result: { success: true, summary: "ok", mode: "apply" },
      agentMessage: null,
      thread: null,
    });
    mockCaptureWorktreeSnapshot.mockResolvedValue({ files: new Map() });
    mockDiffWorktreeSnapshots.mockReturnValue([changedFile]);

    const result = await executeStepPhase({
      auditorName: "test",
      stepText: "Do a thing",
      mode: "apply",
      model: "test-model",
      workingDirectory: tmpDir,
      additionalDirectories: [],
      formatterPath: "formatter.md",
      schemaPath: "schema.json",
      coreContext: null,
      excludePaths: [excludedDir],
      additionalContext: "",
      tracker: { recordAttempt: () => true, isExhausted: () => false },
      thread: null,
    });

    expect(result.kind).toBe("abort");
  });
});

