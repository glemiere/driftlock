import { test, mock } from "node:test";
import assert from "node:assert/strict";
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
  };
}

test("audit command uses enabled auditors when no args", async () => {
  const config = createConfig();
  mock.method(configLoader, "loadConfig", async () => config);
  const runAuditMock = mock.method(orchestrator, "runAudit", async () => {});

  await runAuditCommand();

  assert.equal(runAuditMock.mock.calls.length, 1);
  assert.deepEqual(runAuditMock.mock.calls[0].arguments[0], ["security", "complexity"]);

  mock.restoreAll();
});

test("audit command uses provided single auditor", async () => {
  const config = createConfig();
  mock.method(configLoader, "loadConfig", async () => config);
  const runAuditMock = mock.method(orchestrator, "runAudit", async () => {});

  await runAuditCommand("security");

  assert.equal(runAuditMock.mock.calls.length, 1);
  assert.deepEqual(runAuditMock.mock.calls[0].arguments[0], ["security"]);

  mock.restoreAll();
});

test("audit command handles comma-separated auditors", async () => {
  const config = createConfig();
  mock.method(configLoader, "loadConfig", async () => config);
  const runAuditMock = mock.method(orchestrator, "runAudit", async () => {});

  await runAuditCommand("security,complexity");

  assert.equal(runAuditMock.mock.calls.length, 1);
  assert.deepEqual(runAuditMock.mock.calls[0].arguments[0], ["security", "complexity"]);

  mock.restoreAll();
});

test("audit command skips disabled auditors and throws when explicitly requested", async () => {
  const config = createConfig({
    auditors: {
      complexity: { enabled: false, path: "/tmp/complexity.md", validators: ["structure"] },
    },
  });
  mock.method(configLoader, "loadConfig", async () => config);
  const runAuditMock = mock.method(orchestrator, "runAudit", async () => {});

  await runAuditCommand();
  assert.equal(runAuditMock.mock.calls.length, 1);
  assert.deepEqual(runAuditMock.mock.calls[0].arguments[0], ["security"]);

  await assert.rejects(() => runAuditCommand("complexity"), /Unknown or disabled auditor/);

  mock.restoreAll();
});

test("audit command rejects unknown auditor names", async () => {
  const config = createConfig();
  mock.method(configLoader, "loadConfig", async () => config);
  const runAuditMock = mock.method(orchestrator, "runAudit", async () => {});

  await assert.rejects(() => runAuditCommand("nosuch"), /Unknown or disabled auditor/);
  assert.equal(runAuditMock.mock.calls.length, 0);

  mock.restoreAll();
});
