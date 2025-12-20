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

export async function runAuditCommand(
  auditorsArg?: string,
  ..._rest: unknown[]
): Promise<void> {
  tui.init();
  tui.setTitle("Driftlock Audit");

  const cwd = process.cwd();
  let gitContext: Awaited<ReturnType<typeof ensureDriftlockBranch>> = {};
  let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
  let outcome: Awaited<ReturnType<typeof runAuditLoop>> | null = null;

  try {
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
  }
}
