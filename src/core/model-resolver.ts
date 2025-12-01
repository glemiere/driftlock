import type { DriftlockConfig } from "./config-loader";

export function resolveModel(
  config: DriftlockConfig,
  auditorName?: string,
  validatorName?: string
): string {
  if (validatorName) {
    const validator = config.validators[validatorName];
    if (validator?.model) {
      return validator.model;
    }
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.model) {
      return auditor.model;
    }
  }

  if (config.formatters.model && !validatorName && !auditorName) {
    return config.formatters.model;
  }

  if (config.model) {
    return config.model;
  }

  throw new Error("No model configured. Set a global model or provide overrides.");
}
