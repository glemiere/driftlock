import type { DriftlockConfig, ReasoningEffort } from "../config-loader";

type ExecuteStepMode = "apply" | "fix_regression";

function resolveGlobalModel(config: DriftlockConfig): string {
  if (config.model) return config.model;
  throw new Error("No model configured. Set a global model or provide overrides.");
}

function resolveGlobalReasoning(config: DriftlockConfig): ReasoningEffort | undefined {
  return config.reasoning;
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

export function resolveAuditorReasoning(
  config: DriftlockConfig,
  auditorName?: string
): ReasoningEffort | undefined {
  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.reasoning) {
      return auditor.reasoning;
    }
  }

  if (config.formatters.plan.reasoning) {
    return config.formatters.plan.reasoning;
  }

  return resolveGlobalReasoning(config);
}

export function resolveExecuteStepModel(
  config: DriftlockConfig,
  auditorName?: string,
  mode: ExecuteStepMode = "apply"
): string {
  if (mode === "fix_regression" && config.formatters.executeStep.fixRegressionModel) {
    return config.formatters.executeStep.fixRegressionModel;
  }

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

export function resolveExecuteStepReasoning(
  config: DriftlockConfig,
  auditorName?: string,
  mode: ExecuteStepMode = "apply"
): ReasoningEffort | undefined {
  if (mode === "fix_regression" && config.formatters.executeStep.fixRegressionReasoning) {
    return config.formatters.executeStep.fixRegressionReasoning;
  }

  if (config.formatters.executeStep.reasoning) {
    return config.formatters.executeStep.reasoning;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.reasoning) {
      return auditor.reasoning;
    }
  }

  return resolveGlobalReasoning(config);
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

export function resolveValidatorReasoning(
  config: DriftlockConfig,
  auditorName: string | undefined,
  validatorName: string
): ReasoningEffort | undefined {
  const validator = config.validators[validatorName];
  if (validator?.reasoning) {
    return validator.reasoning;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.reasoning) {
      return auditor.reasoning;
    }
  }

  return resolveGlobalReasoning(config);
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

export function resolveTestFailureSummaryReasoning(
  config: DriftlockConfig,
  auditorName?: string
): ReasoningEffort | undefined {
  if (config.formatters.testFailureSummary.reasoning) {
    return config.formatters.testFailureSummary.reasoning;
  }

  const stepValidator = config.validators.step;
  if (stepValidator?.reasoning) {
    return stepValidator.reasoning;
  }

  if (auditorName) {
    const auditor = config.auditors[auditorName];
    if (auditor?.reasoning) {
      return auditor.reasoning;
    }
  }

  return resolveGlobalReasoning(config);
}

export function resolvePullRequestModel(config: DriftlockConfig): string {
  if (config.pullRequest.formatter.model) {
    return config.pullRequest.formatter.model;
  }

  return resolveGlobalModel(config);
}

export function resolvePullRequestReasoning(
  config: DriftlockConfig
): ReasoningEffort | undefined {
  if (config.pullRequest.formatter.reasoning) {
    return config.pullRequest.formatter.reasoning;
  }

  return resolveGlobalReasoning(config);
}
