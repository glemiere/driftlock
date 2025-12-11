import fs from "fs";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";
import { buildPlan } from "../src/core/plan/build-plan";

const mockRunStreamed = jest.fn();

jest.mock("../src/core/utils/codex-utils", () => {
  const actual = jest.requireActual("../src/core/utils/codex-utils");
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

describe("buildPlan", () => {
  const planSchema = {};
  const planFormatter = "Format";
  let auditorPath: string;

  beforeEach(() => {
    mockRunStreamed.mockReset();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-buildplan-"));
    auditorPath = path.join(tmpDir, "auditor.md");
    fs.writeFileSync(auditorPath, "Auditor prompt");

    mockRunStreamed.mockImplementation(function runStreamed(this: { flag: string }) {
      if (this.flag !== "thread") {
        throw new Error("this context was not preserved");
      }
      return {
        events: (async function* () {
          yield {
            type: "item.completed",
            item: { type: "agent_message", text: JSON.stringify({ plan: [], noop: true, reason: "noop" }) },
          };
        })(),
      };
    });
  });

  it("binds runStreamed to the thread context and returns parsed JSON", async () => {
    const result = await buildPlan({
      auditorName: "doc",
      auditorPath,
      planFormatter,
      planSchema,
      model: "test-model",
      workingDirectory: process.cwd(),
    });

    expect(result).toEqual({ plan: [], noop: true, reason: "noop" });
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });
});
