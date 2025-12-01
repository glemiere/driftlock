import { loadConfig } from "../../core/config-loader";
import { runAudit } from "../../core/orchestrator";
import { tui } from "../tui";

export async function runAuditCommand(
  auditorsArg?: string,
  ..._rest: unknown[]
): Promise<void> {
  tui.init();
  tui.setTitle("Driftlock Audit");

  const config = await loadConfig();

  const auditors =
    auditorsArg && auditorsArg.trim().length > 0
      ? auditorsArg
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : Object.entries(config.auditors)
          .filter(([, auditor]) => auditor.enabled)
          .map(([name]) => name);

  const invalidAuditors = auditors.filter(
    (name) => !config.auditors[name] || config.auditors[name].enabled === false
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

  const headerInfo = `auditors: ${auditors.join(", ")}`;
  tui.setHeaderInfo(headerInfo);
  tui.logLeft(`Running Driftlock audit for: ${auditors.join(", ")}`);

  try {
    await runAudit(auditors, config);
  } finally {
    tui.shutdown();
  }
}
