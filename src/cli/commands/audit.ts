import { loadConfig } from "../../core/config-loader";
import { runAudit } from "../../core/orchestrator";

export async function runAuditCommand(
  auditorsArg?: string,
  ..._rest: unknown[]
): Promise<void> {
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

  if (auditors.length === 0) {
    console.log("No auditors selected or enabled to run.");
    return;
  }

  console.log(`Running Driftlock audit for: ${auditors.join(", ")}`);

  await runAudit(auditors, config);
}

