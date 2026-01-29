import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";

import { tui } from "../src/cli/tui";

describe("tui debug log file", () => {
  it("writes logLeft output to a file when enabled", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-tui-debug-"));
    const logPath = path.join(tmpDir, "output.txt");

    tui.enableDebugLogFile(logPath);
    tui.logLeft("Hello");
    tui.logLeft("Boom", "error");
    await tui.disableDebugLogFile();

    const contents = fs.readFileSync(logPath, "utf8");
    expect(contents).toMatch(/\[\d{2}:\d{2}:\d{2}\] Hello/);
    expect(contents).toMatch(/\[\d{2}:\d{2}:\d{2}\] Boom/);
    expect(contents).not.toMatch(/\u001b\[[0-9;]*[A-Za-z]/);
  });
});

