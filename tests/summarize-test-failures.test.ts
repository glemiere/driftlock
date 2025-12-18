import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

import { summarizeTestFailures } from "../src/core/quality/summarize-test-failures";

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

describe("summarizeTestFailures", () => {
  let formatterPath: string;
  let schemaPath: string;
  let tmpDir: string;

  beforeEach(() => {
    mockRunStreamed.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-test-summary-"));
    formatterPath = path.join(tmpDir, "formatter.md");
    schemaPath = path.join(tmpDir, "schema.json");
    fs.writeFileSync(formatterPath, "Formatter");
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        failingTests: { type: "array", items: { type: "string" } },
        failingFiles: { type: "array", items: { type: "string" } },
        failureMessages: { type: "array", items: { type: "string" } },
        rawSnippets: { type: "array", items: { type: "string" } },
      },
      required: ["summary"],
    };
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  });

  it("returns the last valid TestFailureSummary from the stream", async () => {
    mockRunStreamed.mockImplementation(() => ({
      events: (async function* () {
        // First event with non-JSON text
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: "not json" },
        };
        // Second event with valid JSON summary
        yield {
          type: "item.completed",
          item: {
            type: "agent_message",
            text: JSON.stringify({
              summary: "2 tests failed",
              failingTests: ["Suite A › test 1"],
              failingFiles: ["apps/auth/test.spec.ts"],
              failureMessages: ["Expected 200, received 500"],
              rawSnippets: ["FAIL apps/auth/test.spec.ts"],
            }),
          },
        };
      })(),
    }));

    const summary = await summarizeTestFailures({
      stdout: "raw stdout",
      stderr: "raw stderr",
      model: "test-model",
      workingDirectory: process.cwd(),
      formatterPath,
      schemaPath,
      onEvent: () => {},
      onInfo: () => {},
    });

    expect(summary).not.toBeNull();
    expect(summary?.summary).toBe("2 tests failed");
    expect(summary?.failingTests).toEqual(["Suite A › test 1"]);
    expect(summary?.failingFiles).toEqual(["apps/auth/test.spec.ts"]);
    expect(summary?.failureMessages).toEqual(["Expected 200, received 500"]);
    expect(summary?.rawSnippets).toEqual(["FAIL apps/auth/test.spec.ts"]);
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });
});
