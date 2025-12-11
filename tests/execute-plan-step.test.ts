import fs from "fs";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";
import { executePlanStep } from "../src/core/step/execute-plan-step";

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
          return { flag: "thread", runStreamed: mockRunStreamed };
        }
      },
    })),
  };
});

describe("executePlanStep", () => {
  let formatterPath: string;
  let schemaPath: string;
  let tmpDir: string;

  beforeEach(() => {
    mockRunStreamed.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-execstep-"));
    formatterPath = path.join(tmpDir, "formatter.md");
    schemaPath = path.join(tmpDir, "schema.json");
    fs.writeFileSync(formatterPath, "Formatter");
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        success: { type: "boolean" },
        summary: { type: "string" },
        details: { type: "string" },
        filesTouched: { type: "array", items: { type: "string" } },
        filesWritten: { type: "array", items: { type: "string" } },
        patch: { type: "string" },
        mode: { type: "string" },
      },
      required: ["success", "summary", "mode", "details", "filesTouched", "filesWritten", "patch"],
    };
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  });

  it("binds runStreamed to thread context and parses result", async () => {
    mockRunStreamed.mockImplementation(function runStreamed(this: { flag: string }) {
      if (this.flag !== "thread") {
        throw new Error("this context was not preserved");
      }
      return {
        events: (async function* () {
          yield {
            type: "item.completed",
            item: {
              type: "agent_message",
              text: JSON.stringify({
                success: true,
                summary: "ok",
                details: "detail",
                filesTouched: ["file"],
                filesWritten: ["file"],
                patch: "--- a/file\n+++ b/file\n@@\n-foo\n+bar\n",
                mode: "apply",
              }),
            },
          };
        })(),
      };
    });

    const { result } = await executePlanStep({
      stepText: "Do something",
      mode: "apply",
      model: "test-model",
      workingDirectory: process.cwd(),
      formatterPath,
      schemaPath,
      excludePaths: [],
    });

    expect(result).toEqual({
      success: true,
      summary: "ok",
      details: "detail",
      filesTouched: ["file"],
      filesWritten: ["file"],
      patch: "--- a/file\n+++ b/file\n@@\n-foo\n+bar\n",
      mode: "apply",
    });
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });

  it("rejects output touching excluded paths", async () => {
    mockRunStreamed.mockImplementation(function runStreamed(this: { flag: string }) {
      return {
        events: (async function* () {
          yield {
            type: "item.completed",
            item: {
              type: "agent_message",
              text: JSON.stringify({
                success: true,
                summary: "ok",
                details: "detail",
                mode: "apply",
                filesTouched: ["excluded/file.ts"],
                filesWritten: ["excluded/file.ts"],
                patch: "--- a/excluded/file.ts\n+++ b/excluded/file.ts\n@@\n-foo\n+bar\n",
              }),
            },
          };
        })(),
      };
    });

    await expect(
      executePlanStep({
        stepText: "Do something",
        mode: "apply",
        model: "test-model",
        workingDirectory: process.cwd(),
        formatterPath,
        schemaPath,
        excludePaths: [path.join(process.cwd(), "excluded")],
      })
    ).rejects.toThrow(/excluded path/i);
  });
});
