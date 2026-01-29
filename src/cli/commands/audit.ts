import { loadConfig } from "../../core/config-loader";
import { runAuditLoop } from "../../core/orchestrator";
import { tui } from "../tui";
import {
  assertCleanWorkingTree,
  ensureDriftlockBranch,
  restoreBranch,
  openPullRequest,
} from "../../core/git/git-manager";
import { summarizePullRequest } from "../../core/git/pull-request-summary";
import {
  resolvePullRequestModel,
  resolvePullRequestReasoning,
} from "../../core/utils/model-resolver";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { runCommand } from "../../core/utils/run-commands";

type AuditCommandOptions = {
  debug?: boolean;
};

async function resolveGitExcludePath(cwd: string): Promise<string | null> {
  const result = await runCommand("git rev-parse --git-path info/exclude", cwd);
  if (!result.ok) return null;
  const gitPath = result.stdout.trim();
  if (!gitPath) return null;
  return path.resolve(cwd, gitPath);
}

async function ensureGitExcludePattern(cwd: string, pattern: string): Promise<boolean> {
  const excludePath = await resolveGitExcludePath(cwd);
  if (!excludePath) return false;

  try {
    let content = "";
    try {
      content = await fs.readFile(excludePath, "utf8");
    } catch {
      content = "";
    }

    const existing = new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );
    if (existing.has(pattern)) return true;

    const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    await fs.mkdir(path.dirname(excludePath), { recursive: true });
    await fs.appendFile(excludePath, `${prefix}${pattern}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function isGitIgnored(cwd: string, target: string): Promise<boolean> {
  const result = await runCommand(`git check-ignore -q -- ${target}`, cwd);
  return result.ok;
}

async function isGitTracked(cwd: string, target: string): Promise<boolean> {
  const result = await runCommand(`git ls-files --error-unmatch -- ${target}`, cwd);
  return result.ok;
}

async function resolveDebugLogPath(cwd: string): Promise<string> {
  const preferredFile = "output.txt";

  if (!(await isGitTracked(cwd, preferredFile))) {
    await ensureGitExcludePattern(cwd, preferredFile);
    if (await isGitIgnored(cwd, preferredFile)) {
      return path.join(cwd, preferredFile);
    }
  }

  const driftlockDir = ".driftlock";
  const fallback = path.join(cwd, driftlockDir, "output.txt");
  await ensureGitExcludePattern(cwd, `${driftlockDir}/`);
  if (await isGitIgnored(cwd, driftlockDir)) {
    return fallback;
  }

  return path.join(os.tmpdir(), `driftlock-output-${Date.now()}.txt`);
}

export async function runAuditCommand(
  auditorsArg?: string,
  options?: AuditCommandOptions,
  ..._rest: unknown[]
): Promise<void> {
  tui.init();
  tui.setTitle("Driftlock Audit");

  const cwd = process.cwd();
  const debugEnabled = Boolean(options?.debug);
  let debugLogPath: string | null = null;
  let gitContext: Awaited<ReturnType<typeof ensureDriftlockBranch>> = {};
  let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
  let outcome: Awaited<ReturnType<typeof runAuditLoop>> | null = null;

  try {
    if (debugEnabled) {
      try {
        debugLogPath = await resolveDebugLogPath(cwd);
        tui.enableDebugLogFile(debugLogPath);
        tui.logLeft(`Debug log enabled: ${debugLogPath}`, "success");
      } catch (error) {
        debugLogPath = null;
        const message = error instanceof Error ? error.message : String(error);
        tui.logLeft(`Failed to enable debug log file: ${message}`, "warn");
      }
    }

    const loadedConfig = await loadConfig();
    config = loadedConfig;

    const auditors =
      auditorsArg && auditorsArg.trim().length > 0
        ? auditorsArg
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
        : Object.entries(loadedConfig.auditors)
            .filter(([, auditor]) => auditor.enabled)
            .map(([name]) => name);

    const invalidAuditors = auditors.filter(
      (name) =>
        !loadedConfig.auditors[name] || loadedConfig.auditors[name].enabled === false
    );

    if (invalidAuditors.length > 0) {
      throw new Error(
        `Unknown or disabled auditor(s): ${invalidAuditors.join(", ")}`
      );
    }

    if (auditors.length === 0) {
      console.log("No auditors selected or enabled to run.");
      return;
    }

    await assertCleanWorkingTree(cwd);
    gitContext = await ensureDriftlockBranch(cwd);

    const headerInfo = `auditors: ${auditors.join(", ")}`;
    tui.setHeaderInfo(headerInfo);
    tui.logLeft(`Running Driftlock audit for: ${auditors.join(", ")}`);

    outcome = await runAuditLoop(auditors, loadedConfig, gitContext);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.exitCode = 1;
    if (!(error instanceof Error && error.name === "BaselineQualityGateError")) {
      tui.logLeft(message, "error");
    }
  } finally {
    await restoreBranch(gitContext, cwd);
    tui.shutdown();

    if (
      config &&
      outcome &&
      gitContext.branch &&
      config.pullRequest.enabled &&
      outcome.committedPlans.length > 0
    ) {
      const info = (text: string) => console.log(text);
      const prSummary = await summarizePullRequest({
        model: resolvePullRequestModel(config),
        reasoning: resolvePullRequestReasoning(config),
        workingDirectory: cwd,
        formatterPath: config.pullRequest.formatter.path,
        schemaPath: config.pullRequest.formatter.schema,
        turnTimeoutMs: config.turnTimeoutMs,
        branch: gitContext.branch,
        baseBranch: gitContext.originalBranch,
        committedPlans: outcome.committedPlans,
        onEvent: (text) => console.log(text),
        onInfo: info,
      });

      await openPullRequest(gitContext, cwd, {
        title: prSummary?.title,
        body: prSummary?.body,
        baseBranch: gitContext.originalBranch,
      });
    }

    if (debugLogPath) {
      await tui.disableDebugLogFile();
    }
  }
}
