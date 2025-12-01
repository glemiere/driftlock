import type { DriftlockConfig } from "./config-loader";
import { sleep } from "../utils/sleep";
import { tui } from "../cli/tui";
import { resolveModel } from "./model-resolver";

export async function runAudit(
  auditors: string[],
  config: DriftlockConfig
): Promise<void> {
  console.log("Starting Driftlock orchestrator loop…");
  console.log("Press Ctrl+C to exit.\n");

  while (true) {
    for (const auditorName of auditors) {
      tui.logLeft(auditorName);

      const model = resolveModel(config, auditorName);
      tui.logLeft(`[${auditorName}] using model: ${model}`);

      // TODO: load auditor prompt
      for (const validatorName of config.auditors[auditorName].validators) {
        const validatorModel = resolveModel(config, auditorName, validatorName);
        tui.logRight(`[${auditorName} → ${validatorName}] using model: ${validatorModel}`);
      }
      // TODO: call plan formatter
      // TODO: run structure validator
      // TODO: run general validator
      // TODO: executor will run here later

      await sleep(500); // tiny delay so the loop doesn’t melt the CPU
    }
  }
}
