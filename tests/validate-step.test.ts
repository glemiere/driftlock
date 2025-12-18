import fs from "fs";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";
import { validateStep } from "../src/core/step/validate-step";

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

describe("validateStep", () => {
  let validatorPath: string;
  let schemaPath: string;
  let tmpDir: string;

  beforeEach(() => {
    mockRunStreamed.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-validatestep-"));
    validatorPath = path.join(tmpDir, "validator.md");
    schemaPath = path.join(tmpDir, "schema.json");
    fs.writeFileSync(validatorPath, "Validator prompt");
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        valid: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["valid"],
    };
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));
  });

  it("returns parsed validation result", async () => {
    mockRunStreamed.mockImplementation(function runStreamed(this: { flag: string }) {
      if (this.flag !== "thread") {
        throw new Error("this context was not preserved");
      }
      return {
        events: (async function* () {
          yield {
            type: "item.completed",
            item: { type: "agent_message", text: JSON.stringify({ valid: true, reason: "ok" }) },
          };
        })(),
      };
    });

    const result = await validateStep({
      stepDescription: "Do something",
      executorResult: { success: true },
      codeSnapshots: { "src/file.ts": "// code" },
      validatorPath,
      validateSchemaPath: schemaPath,
      model: "test-model",
      workingDirectory: process.cwd(),
    });

    expect(result).toEqual({ valid: true, reason: "ok" });
    expect(mockRunStreamed).toHaveBeenCalledTimes(1);
  });
});
