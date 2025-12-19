import { describe, expect, it, jest, beforeEach, afterEach } from "@jest/globals";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

const repoRoot = path.resolve(__dirname, "..");
const sourceConfigPath = path.join(repoRoot, "config.default.json");

async function withTempDir(run: (dir: string) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftlock-init-"));
  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

describe("driftlock init", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  it("copies config.default.json to driftlock.config.json in the current directory", async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      const { runInitCommand } = await import("../src/cli/commands/init");

      const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

      await runInitCommand();

      expect(errorSpy).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();

      const created = await fs.readFile(path.join(dir, "driftlock.config.json"), "utf8");
      const expected = await fs.readFile(sourceConfigPath, "utf8");
      expect(created).toBe(expected);
    });
  });

  it("does not overwrite an existing driftlock.config.json without --force", async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      await fs.writeFile(path.join(dir, "driftlock.config.json"), "existing", "utf8");

      const { runInitCommand } = await import("../src/cli/commands/init");
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

      await runInitCommand({ force: false });

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      const contents = await fs.readFile(path.join(dir, "driftlock.config.json"), "utf8");
      expect(contents).toBe("existing");
    });
  });

  it("overwrites driftlock.config.json with --force", async () => {
    await withTempDir(async (dir) => {
      process.chdir(dir);
      await fs.writeFile(path.join(dir, "driftlock.config.json"), "existing", "utf8");

      const { runInitCommand } = await import("../src/cli/commands/init");
      jest.spyOn(console, "log").mockImplementation(() => undefined);
      jest.spyOn(console, "error").mockImplementation(() => undefined);

      await runInitCommand({ force: true });

      const created = await fs.readFile(path.join(dir, "driftlock.config.json"), "utf8");
      const expected = await fs.readFile(sourceConfigPath, "utf8");
      expect(created).toBe(expected);
    });
  });
});

