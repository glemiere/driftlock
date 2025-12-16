import type { DriftlockConfig } from "../config-loader";

function resolveGlobalModel(config: DriftlockConfig): string {
  if (config.model) return config.model;
  throw new Error("No model configured. Set a global model or provide overrides.");
}

export function resolveAuditorModel(config: DriftlockConfig, auditorName?: string): string {
  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.model) {
      return auditor.model;
    }
  }

  if (config.formatters.plan.model) {
    return config.formatters.plan.model;
  }

  return resolveGlobalModel(config);
}

export function resolveExecuteStepModel(config: DriftlockConfig, auditorName?: string): string {
  if (config.formatters.executeStep.model) {
    return config.formatters.executeStep.model;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.model) {
      return auditor.model;
    }
  }

  return resolveGlobalModel(config);
}

export function resolveValidatorModel(
  config: DriftlockConfig,
  auditorName: string | undefined,
  validatorName: string
): string {
  const validator = config.validators[validatorName];
  if (validator?.model) {
    return validator.model;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.model) {
      return auditor.model;
    }
  }

  return resolveGlobalModel(config);
}

export function resolveTestFailureSummaryModel(
  config: DriftlockConfig,
  auditorName?: string
): string {
  if (config.formatters.testFailureSummary.model) {
    return config.formatters.testFailureSummary.model;
  }

  const stepValidator = config.validators.step;
  if (stepValidator?.model) {
    return stepValidator.model;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.model) {
      return auditor.model;
    }
  }

  return resolveGlobalModel(config);
}

export function resolvePullRequestModel(config: DriftlockConfig): string {
  if (config.pullRequest.formatter.model) {
    return config.pullRequest.formatter.model;
  }

  return resolveGlobalModel(config);
}
