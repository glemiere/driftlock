import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { loadConfig } from "../src/core/config-loader";

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

test("loadConfig returns defaults when no user config present", async () => {
  process.chdir(repoRoot);
  const config = await loadConfig();

  assert.ok(config.auditors.security);
  assert.equal(config.auditors.security.enabled, true);
  assert.ok(path.isAbsolute(config.auditors.security.path));
  assert.ok(path.isAbsolute(config.validators.structure));
  assert.ok(path.isAbsolute(config.formatters.plan));
});

test("loadConfig merges user overrides and resolves paths", async () => {
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

    assert.equal(config.auditors.consistency.enabled, false);
    const expectedPath = path.resolve(dir, "./.ai/auditors/security.md");
    assert.ok(
      config.auditors.security.path.endsWith(".ai/auditors/security.md"),
      "security auditor path should be resolved"
    );
    assert.equal(await fs.realpath(config.auditors.security.path), await fs.realpath(expectedPath));
    assert.ok(config.auditors.complexity.enabled, "default auditor remains intact");
    assert.ok(path.isAbsolute(config.validators.structure));
  });
});

test("loadConfig throws when user auditor path is missing", async () => {
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

    await assert.rejects(
      () => loadConfig(),
      /Auditor "security" path does not exist or is not readable/i
    );
  });
});

test("loadConfig rejects invalid JSON", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "driftlock.config.json"), "{ invalid");
    process.chdir(dir);

    await assert.rejects(
      () => loadConfig(),
      /Failed to parse driftlock\.config\.json/i
    );
  });
});

test("loadConfig rejects unknown top-level keys", async () => {
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

    await assert.rejects(
      () => loadConfig(),
      /unknown key "unknown"/i
    );
  });
});

test("loadConfig enforces auditor validator types", async () => {
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

    await assert.rejects(
      () => loadConfig(),
      /expected string/i
    );
  });
});

test("loadConfig respects disabled auditors from user config", async () => {
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
    assert.equal(config.auditors.security.enabled, false);
  });
});

test("user validators array replaces defaults completely", async () => {
  await withTempDir(async (dir) => {
    const auditorDir = path.join(dir, ".ai", "auditors");
    await fs.mkdir(auditorDir, { recursive: true });
    const customSecurity = path.join(auditorDir, "security.md");
    await fs.writeFile(customSecurity, "# custom");

    const userConfig = {
      auditors: {
        security: { validators: ["structure"], path: "./.ai/auditors/security.md" },
      },
    };

    await fs.writeFile(
      path.join(dir, "driftlock.config.json"),
      JSON.stringify(userConfig, null, 2)
    );

    process.chdir(dir);

    const config = await loadConfig();
    assert.deepEqual(config.auditors.security.validators, ["structure"]);
  });
});

test("auditor override merges missing fields and replaces arrays", async () => {
  await withTempDir(async (dir) => {
    const userConfig = {
      auditors: {
        reliability: {
          validators: ["structure"],
        },
      },
    };

    await fs.writeFile(
      path.join(dir, "driftlock.config.json"),
      JSON.stringify(userConfig, null, 2)
    );

    process.chdir(dir);

    const config = await loadConfig();
    assert.deepEqual(config.auditors.reliability.validators, ["structure"]);
    assert.ok(
      config.auditors.reliability.path.includes("auditors/reliability.md"),
      "path should remain default"
    );
  });
});

test("user can add new auditor not in defaults", async () => {
  await withTempDir(async (dir) => {
    const extraDir = path.join(dir, "auditors");
    await fs.mkdir(extraDir, { recursive: true });
    const customPath = path.join(extraDir, "custom.md");
    await fs.writeFile(customPath, "# custom auditor");

    const userConfig = {
      auditors: {
        custom: { enabled: true, path: "./auditors/custom.md", validators: ["structure"] },
      },
    };

    await fs.writeFile(
      path.join(dir, "driftlock.config.json"),
      JSON.stringify(userConfig, null, 2)
    );

    process.chdir(dir);

    const config = await loadConfig();
    assert.ok(config.auditors.custom);
    assert.equal(config.auditors.custom.enabled, true);
    assert.equal(config.auditors.custom.validators[0], "structure");
  });
});

test("auditor with enabled false still keeps custom validators", async () => {
  await withTempDir(async (dir) => {
    const extraDir = path.join(dir, "auditors");
    await fs.mkdir(extraDir, { recursive: true });
    const customPath = path.join(extraDir, "security.md");
    await fs.writeFile(customPath, "# custom");

    const userConfig = {
      auditors: {
        security: {
          enabled: false,
          validators: ["structure"],
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
    assert.equal(config.auditors.security.enabled, false);
    assert.deepEqual(config.auditors.security.validators, ["structure"]);
  });
});

test("auditor names are case-sensitive and treated as distinct entries", async () => {
  await withTempDir(async (dir) => {
    const auditorDir = path.join(dir, ".ai", "auditors");
    await fs.mkdir(auditorDir, { recursive: true });
    const securityFile = path.join(auditorDir, "Security.md");
    await fs.writeFile(securityFile, "# Security auditor");

    const userConfig = {
      auditors: {
        Security: { enabled: true, path: "./.ai/auditors/Security.md", validators: ["structure"] },
      },
    };

    await fs.writeFile(
      path.join(dir, "driftlock.config.json"),
      JSON.stringify(userConfig, null, 2)
    );

    process.chdir(dir);

    const config = await loadConfig();
    assert.ok(config.auditors.Security);
    assert.ok(config.auditors.security, "default security remains intact");
  });
});

test("relative paths resolve consistently for different notations", async () => {
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
        custom: { enabled: true, path: paths.parent, validators: ["structure"] },
      },
    };

    await fs.writeFile(
      path.join(dir, "driftlock.config.json"),
      JSON.stringify(userConfig, null, 2)
    );

    process.chdir(dir);

    const config = await loadConfig();
    assert.equal(await fs.realpath(config.auditors.security.path), await fs.realpath(path.resolve(dir, paths.dotSlash)));
    assert.equal(await fs.realpath(config.auditors.consistency.path), await fs.realpath(path.resolve(dir, paths.noDot)));
    assert.equal(await fs.realpath(config.auditors.custom.path), await fs.realpath(path.resolve(dir, paths.parent)));
  });
});

test("auditors must reference known validators", async () => {
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

    await assert.rejects(
      () => loadConfig(),
      /unknown validator "unknown"/i
    );
  });
});

test("empty user config does not mutate defaults and keeps defaults intact", async () => {
  await withTempDir(async (dir) => {
    await fs.writeFile(path.join(dir, "driftlock.config.json"), "{}");
    process.chdir(dir);

    const config1 = await loadConfig();
    const config2 = await loadConfig();

    assert.ok(config1.auditors.security.validators.includes("general"));
    assert.ok(config2.auditors.security.validators.includes("general"));
  });
});

test.afterEach(() => {
  process.chdir(originalCwd);
});
