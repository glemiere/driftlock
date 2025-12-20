import { describe, expect, it, afterEach, beforeEach, jest } from "@jest/globals";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

jest.mock("../src/core/utils/run-commands", () => ({
  runCommand: jest.fn(),
}));

const mockedRunCommand = (
  require("../src/core/utils/run-commands") as typeof import("../src/core/utils/run-commands")
).runCommand as jest.MockedFunction<
  typeof import("../src/core/utils/run-commands").runCommand
>;

const loadConfig = async () => (await import("../src/core/config-loader")).loadConfig();

const originalCwd = process.cwd();
const repoRoot = path.resolve(__dirname, "..");

async function withTempDir(run: (dir: string) => Promise<void>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftlock-test-"));
  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

describe("config-loader", () => {
  beforeEach(() => {
    mockedRunCommand.mockResolvedValue({ ok: true, stdout: "gh version 0.0.0", stderr: "", code: 0 });
  });

  it("returns defaults when no user config present", async () => {
    process.chdir(repoRoot);
    const config = await loadConfig();

    expect(config.auditors.security).toBeDefined();
    expect(config.auditors.security.enabled).toBe(true);
    expect(path.isAbsolute(config.auditors.security.path)).toBe(true);
    expect(typeof config.model).toBe("string");
    expect(typeof config.reasoning).toBe("string");
    expect(path.isAbsolute(config.validators.plan.path)).toBe(true);
    expect(path.isAbsolute(config.validators["execute-step"].path)).toBe(true);
    expect(path.isAbsolute(config.validators.step.path)).toBe(true);
    expect(path.isAbsolute(config.formatters.plan.path)).toBe(true);
    expect(path.isAbsolute(config.formatters.plan.schema)).toBe(true);
    expect(path.isAbsolute(config.formatters.executeStep.path)).toBe(true);
    expect(path.isAbsolute(config.formatters.executeStep.schema)).toBe(true);
    expect(typeof config.formatters.executeStep.fixRegressionModel).toBe("string");
    expect(typeof config.formatters.executeStep.fixRegressionReasoning).toBe("string");
    expect(path.isAbsolute(config.formatters.testFailureSummary.path)).toBe(true);
    expect(path.isAbsolute(config.formatters.testFailureSummary.schema)).toBe(true);
    expect(Array.isArray(config.exclude)).toBe(true);
    expect(typeof config.qualityGate.build.run).toBe("string");
    expect(typeof config.qualityGate.lint.run).toBe("string");
    expect(typeof config.qualityGate.test.run).toBe("string");
    expect(typeof config.qualityGate.build.enabled).toBe("boolean");
    expect(typeof config.qualityGate.lint.enabled).toBe("boolean");
    expect(typeof config.qualityGate.test.enabled).toBe("boolean");
    expect(typeof config.pullRequest.enabled).toBe("boolean");
    expect(typeof config.pullRequest.gitHostSaas).toBe("string");
    expect(path.isAbsolute(config.pullRequest.formatter.path)).toBe(true);
    expect(path.isAbsolute(config.pullRequest.formatter.schema)).toBe(true);
    expect(typeof config.pullRequest.formatter.model).toBe("string");
    expect(typeof config.pullRequest.formatter.reasoning).toBe("string");
    expect(typeof config.maxValidationRetries).toBe("number");
    expect(typeof config.maxRegressionAttempts).toBe("number");
    expect(typeof config.maxThreadLifetimeAttempts).toBe("number");
    expect(typeof config.turnTimeoutMs).toBe("number");
  });

  it("loads successfully when driftlock.config.json is a copy of config.default.json", async () => {
    await withTempDir(async (dir) => {
      const defaultConfigContents = await fs.readFile(
        path.join(repoRoot, "config.default.json"),
        "utf8"
      );
      await fs.writeFile(path.join(dir, "driftlock.config.json"), defaultConfigContents);

      process.chdir(dir);
      const config = await loadConfig();

      expect(config.auditors.security.path).toBe(
        path.resolve(repoRoot, "assets", "auditors", "security.md")
      );
      expect(config.validators.plan.path).toBe(
        path.resolve(repoRoot, "assets", "validators", "plan.md")
      );
      expect(config.formatters.plan.path).toBe(
        path.resolve(repoRoot, "assets", "formatters", "plan.md")
      );
      expect(config.pullRequest.formatter.path).toBe(
        path.resolve(repoRoot, "assets", "formatters", "pull-request.md")
      );
    });
  });

  it("supports model and reasoning overrides for auditors, validators, and formatters", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        model: "default-model",
        reasoning: "low",
        auditors: {
          security: { model: "auditor-model", reasoning: "high" },
        },
        validators: {
          plan: { path: "./validators/plan.md", model: "validator-model", reasoning: "medium" },
        },
        formatters: {
          executeStep: { model: "formatter-model", reasoning: "minimal" },
        },
        pullRequest: {
          formatter: { model: "pr-model", reasoning: "minimal" },
        },
      };

      const validatorDir = path.join(dir, "validators");
      await fs.mkdir(validatorDir, { recursive: true });
      await fs.writeFile(path.join(validatorDir, "plan.md"), "# plan validator");

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.model).toBe("default-model");
      expect(config.reasoning).toBe("low");
      expect(config.auditors.security.model).toBe("auditor-model");
      expect(config.auditors.security.reasoning).toBe("high");
      expect(config.validators.plan.model).toBe("validator-model");
      expect(config.validators.plan.reasoning).toBe("medium");
      expect(config.formatters.executeStep.model).toBe("formatter-model");
      expect(config.formatters.executeStep.reasoning).toBe("minimal");
      expect(config.pullRequest.formatter.model).toBe("pr-model");
      expect(config.pullRequest.formatter.reasoning).toBe("minimal");
    });
  });

  it("merges user overrides and resolves paths", async () => {
    await withTempDir(async (dir) => {
      const auditorDir = path.join(dir, ".ai", "auditors");
      await fs.mkdir(auditorDir, { recursive: true });
      const customAuditorPath = path.join(auditorDir, "security.md");
      await fs.writeFile(customAuditorPath, "# custom security auditor");

      const userConfig = {
        auditors: {
          consistency: { enabled: false },
          security: { path: "./.ai/auditors/security.md" },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();

      expect(config.auditors.consistency.enabled).toBe(false);
      const expectedPath = path.resolve(dir, "./.ai/auditors/security.md");
      expect(config.auditors.security.path.endsWith(".ai/auditors/security.md")).toBe(true);
      expect(await fs.realpath(config.auditors.security.path)).toBe(
        await fs.realpath(expectedPath)
      );
      expect(config.auditors.complexity.enabled).toBe(true);
      expect(path.isAbsolute(config.validators.plan.path)).toBe(true);
      expect(path.isAbsolute(config.validators["execute-step"].path)).toBe(true);
      expect(path.isAbsolute(config.validators.step.path)).toBe(true);
    });
  });

  it("throws when user auditor path is missing", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        auditors: {
          security: { path: "./missing.md" },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(
        /Auditor "security" path does not exist or is not readable/i
      );
    });
  });

  it("rejects invalid JSON", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "driftlock.config.json"), "{ invalid");
      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(/Failed to parse driftlock\.config\.json/i);
    });
  });

  it("rejects unknown top-level keys", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        auditors: {},
        unknown: true,
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(/unknown key "unknown"/i);
    });
  });

  it("enforces auditor validator types", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        auditors: {
          security: { validators: [123] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(/expected string/i);
    });
  });

  it("respects disabled auditors from user config", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        auditors: {
          security: { enabled: false },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.security.enabled).toBe(false);
    });
  });

  it("user validators array still includes required defaults", async () => {
    await withTempDir(async (dir) => {
      const auditorDir = path.join(dir, ".ai", "auditors");
      await fs.mkdir(auditorDir, { recursive: true });
      const customSecurity = path.join(auditorDir, "security.md");
      await fs.writeFile(customSecurity, "# custom");

      const userConfig = {
        auditors: {
          security: { validators: ["plan"], path: "./.ai/auditors/security.md" },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.security.validators).toEqual(["plan"]);
    });
  });

  it("auditor override merges missing fields and replaces arrays", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        auditors: {
          reliability: {
            validators: ["plan"],
          },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.reliability.validators).toEqual(["plan"]);
      expect(config.auditors.reliability.path.includes("auditors/reliability.md")).toBe(true);
    });
  });

  it("user can add new auditor not in defaults", async () => {
    await withTempDir(async (dir) => {
      const extraDir = path.join(dir, "auditors");
      await fs.mkdir(extraDir, { recursive: true });
      const customPath = path.join(extraDir, "custom.md");
      await fs.writeFile(customPath, "# custom auditor");

      const userConfig = {
        auditors: {
          custom: { enabled: true, path: "./auditors/custom.md", validators: ["plan"] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.custom).toBeDefined();
      expect(config.auditors.custom.enabled).toBe(true);
      expect(config.auditors.custom.validators).toEqual(["plan"]);
    });
  });

  it("auditor with enabled false still keeps custom validators", async () => {
    await withTempDir(async (dir) => {
      const extraDir = path.join(dir, "auditors");
      await fs.mkdir(extraDir, { recursive: true });
      const customPath = path.join(extraDir, "security.md");
      await fs.writeFile(customPath, "# custom");

      const userConfig = {
        auditors: {
          security: {
            enabled: false,
            validators: ["plan"],
            path: "./auditors/security.md",
          },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.security.enabled).toBe(false);
      expect(config.auditors.security.validators).toEqual(["plan"]);
    });
  });

  it("auditor names are case-sensitive and treated as distinct entries", async () => {
    await withTempDir(async (dir) => {
      const auditorDir = path.join(dir, ".ai", "auditors");
      await fs.mkdir(auditorDir, { recursive: true });
      const securityFile = path.join(auditorDir, "Security.md");
      await fs.writeFile(securityFile, "# Security auditor");

      const userConfig = {
        auditors: {
          Security: { enabled: true, path: "./.ai/auditors/Security.md", validators: ["plan"] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.auditors.Security).toBeDefined();
      expect(config.auditors.security).toBeDefined();
    });
  });

  it("relative paths resolve consistently for different notations", async () => {
    await withTempDir(async (dir) => {
      const auditorDir = path.join(dir, "auditors");
      const parentDir = path.resolve(dir, "..");
      await fs.mkdir(auditorDir, { recursive: true });
      await fs.mkdir(path.join(parentDir, "shared"), { recursive: true });

      const paths = {
        dotSlash: "./auditors/security.md",
        noDot: "auditors/security.md",
        parent: "../shared/parent.md",
      };

      await fs.writeFile(path.join(auditorDir, "security.md"), "#");
      await fs.writeFile(path.join(parentDir, "shared/parent.md"), "#");

      const userConfig = {
        auditors: {
          security: { path: paths.dotSlash },
          consistency: { path: paths.noDot },
          custom: { enabled: true, path: paths.parent, validators: ["plan"] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(await fs.realpath(config.auditors.security.path)).toBe(
        await fs.realpath(path.resolve(dir, paths.dotSlash))
      );
      expect(await fs.realpath(config.auditors.consistency.path)).toBe(
        await fs.realpath(path.resolve(dir, paths.noDot))
      );
      expect(await fs.realpath(config.auditors.custom.path)).toBe(
        await fs.realpath(path.resolve(dir, paths.parent))
      );
    });
  });

  it("auditors must reference known validators", async () => {
    await withTempDir(async (dir) => {
      const auditorDir = path.join(dir, "auditors");
      await fs.mkdir(auditorDir, { recursive: true });
      const customPath = path.join(auditorDir, "security.md");
      await fs.writeFile(customPath, "# custom");

      const userConfig = {
        auditors: {
          security: { path: "./auditors/security.md", validators: ["unknown"] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(/unknown validator "unknown"/i);
    });
  });

  it("rejects formatter overrides pointing to unreadable paths", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        formatters: {
          plan: {
            path: "./missing/plan.md",
            schema: "./missing/plan.schema.json",
          },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(
        /Formatter "plan" path does not exist or is not readable/i
      );
    });
  });

  it("exclude array resolves paths relative to cwd and replaces defaults", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        exclude: ["./tmp", "../shared"],
      };

      await fs.mkdir(path.join(dir, "tmp"), { recursive: true });
      await fs.mkdir(path.join(path.dirname(dir), "shared"), { recursive: true });

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      const config = await loadConfig();
      expect(config.exclude.map((p) => fs.realpath(p))).toBeDefined();
      const resolved = await Promise.all(config.exclude.map((p) => fs.realpath(p)));
      expect(resolved).toEqual([
        await fs.realpath(path.resolve(dir, "./tmp")),
        await fs.realpath(path.resolve(dir, "../shared")),
      ]);
    });
  });

  it("validators must have readable paths", async () => {
    await withTempDir(async (dir) => {
      const userConfig = {
        validators: {
          custom: { path: "./validators/custom.md" },
        },
        auditors: {
          security: { path: "./auditors/security.md", validators: ["plan"] },
        },
      };

      await fs.writeFile(
        path.join(dir, "driftlock.config.json"),
        JSON.stringify(userConfig, null, 2)
      );

      process.chdir(dir);

      await expect(loadConfig()).rejects.toThrow(/Validator "custom" path does not exist/i);
    });
  });

  it("empty user config does not mutate defaults and keeps defaults intact", async () => {
    await withTempDir(async (dir) => {
      await fs.writeFile(path.join(dir, "driftlock.config.json"), "{}");
      process.chdir(dir);

      const config1 = await loadConfig();
      const config2 = await loadConfig();

      expect(config1.auditors.security.validators.includes("plan")).toBe(true);
      expect(config2.auditors.security.validators.includes("plan")).toBe(true);
    });
  });
});

afterEach(() => {
  process.chdir(originalCwd);
});
