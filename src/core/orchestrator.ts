import type { DriftlockConfig } from "./config-loader";
import { sleep } from "../utils/sleep";
import { resolveModel } from "./model-resolver";

export async function runAudit(
  auditors: string[],
  config: DriftlockConfig
): Promise<void> {
  console.log("Starting Driftlock orchestrator loop…");
  console.log("Press Ctrl+C to exit.\n");

  while (true) {
    for (const auditorName of auditors) {
      console.log(auditorName);

      const model = resolveModel(config, auditorName);
      console.log(`[${auditorName}] using model: ${model}`);

      // TODO: load auditor prompt
      for (const validatorName of config.auditors[auditorName].validators) {
        const validatorModel = resolveModel(config, auditorName, validatorName);
        console.log(`[${auditorName} → ${validatorName}] using model: ${validatorModel}`);
      }
      // TODO: call plan formatter
      // TODO: run structure validator
      // TODO: run general validator
      // TODO: executor will run here later

      await sleep(5000); // tiny delay so the loop doesn’t melt the CPU
    }
  }
}
