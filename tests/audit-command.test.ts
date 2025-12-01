import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import { runAuditCommand } from "../src/cli/commands/audit";
import * as configLoader from "../src/core/config-loader";
import * as orchestrator from "../src/core/orchestrator";

function createConfig(overrides: Partial<configLoader.DriftlockConfig> = {}): configLoader.DriftlockConfig {
  return {
    auditors: {
      security: {
        enabled: true,
        path: "/tmp/security.md",
        validators: ["structure", "general"],
      },
      complexity: {
        enabled: true,
        path: "/tmp/complexity.md",
        validators: ["structure", "general"],
      },
      consistency: {
        enabled: false,
        path: "/tmp/consistency.md",
        validators: ["structure", "general"],
      },
      ...(overrides.auditors ?? {}),
    },
    validators: {
      structure: "/tmp/structure.md",
      general: "/tmp/general.md",
      ...(overrides.validators ?? {}),
    },
    formatters: {
      plan: "/tmp/plan.md",
      schema: "/tmp/plan.schema.json",
      ...(overrides.formatters ?? {}),
    },
    exclude: overrides.exclude ?? [],
  };
}

describe("audit command", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses enabled auditors when no args", async () => {
    const config = createConfig();
    jest.spyOn(configLoader, "loadConfig").mockResolvedValue(config);
    const runAuditMock = jest.spyOn(orchestrator, "runAudit").mockResolvedValue();

    await runAuditCommand();

    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(runAuditMock).toHaveBeenCalledWith(["security", "complexity"], config);
  });

  it("uses provided single auditor", async () => {
    const config = createConfig();
    jest.spyOn(configLoader, "loadConfig").mockResolvedValue(config);
    const runAuditMock = jest.spyOn(orchestrator, "runAudit").mockResolvedValue();

    await runAuditCommand("security");

    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(runAuditMock).toHaveBeenCalledWith(["security"], config);
  });

  it("handles comma-separated auditors", async () => {
    const config = createConfig();
    jest.spyOn(configLoader, "loadConfig").mockResolvedValue(config);
    const runAuditMock = jest.spyOn(orchestrator, "runAudit").mockResolvedValue();

    await runAuditCommand("security,complexity");

    expect(runAuditMock).toHaveBeenCalledTimes(1);
    expect(runAuditMock).toHaveBeenCalledWith(["security", "complexity"], config);
  });

  it("skips disabled auditors and throws when explicitly requested", async () => {
    const config = createConfig({
      auditors: {
        complexity: { enabled: false, path: "/tmp/complexity.md", validators: ["structure"] },
      },
    });
    jest.spyOn(configLoader, "loadConfig").mockResolvedValue(config);
    const runAuditMock = jest.spyOn(orchestrator, "runAudit").mockResolvedValue();

    await runAuditCommand();
    expect(runAuditMock).toHaveBeenCalledWith(["security"], config);

    await expect(runAuditCommand("complexity")).rejects.toThrow(/Unknown or disabled auditor/);
  });

  it("rejects unknown auditor names", async () => {
    const config = createConfig();
    jest.spyOn(configLoader, "loadConfig").mockResolvedValue(config);
    const runAuditMock = jest.spyOn(orchestrator, "runAudit").mockResolvedValue();

    await expect(runAuditCommand("nosuch")).rejects.toThrow(/Unknown or disabled auditor/);
    expect(runAuditMock).not.toHaveBeenCalled();
  });
});
