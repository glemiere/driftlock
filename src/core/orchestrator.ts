import type { DriftlockConfig } from "./config-loader";

export async function runAudit(
  auditors: string[],
  config: DriftlockConfig
): Promise<void> {
  for (const auditorName of auditors) {
    const auditorConfig = config.auditors[auditorName];

    // TODO: load auditor prompt
    // TODO: call plan formatter
    // TODO: run structure validator
    // TODO: run general validator
    // TODO: executor will run here later

    void auditorConfig;
  }
}
