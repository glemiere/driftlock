import { tui } from "../../cli/tui";
import { executePlanStep } from "./execute-plan-step";
import { validateExecuteStep } from "./validate-execute-step";
import type { ExecutePlanStepResult } from "./execute-plan-step";
import {
  type ExecuteStepPhaseArgs,
  type StepPhaseResult,
  type StepTracker,
} from "../types/orchestrator.types";
import { collectFiles, readSnapshots } from "./snapshots";

function failStepDueToThreadLimit(auditorName: string, stepText: string): StepPhaseResult {
  tui.logLeft(`[${auditorName}] thread attempts exhausted for step: ${stepText}`, "error");
  return { kind: "abort" };
}

function formatStepText(stepText: string, additionalContext: string): string {
  if (!additionalContext) return stepText;
  return `${stepText}\n\nContext:\n${additionalContext}`;
}

function handleExecutorFailure(
  result: ExecutePlanStepResult,
  auditorName: string,
  mode: "apply" | "fix_regression"
): StepPhaseResult {
  tui.logLeft(
    `[${auditorName}] executor failed step (${mode}): ${result.summary || "no summary"}`,
    "error"
  );

  const summaryLower = (result.summary || "").toLowerCase();
  const nothingToChange =
    summaryLower.includes("nothing to change") ||
    summaryLower.includes("nothing can be removed") ||
    summaryLower.includes("no changes made");
  if (nothingToChange) {
    return { kind: "abort" };
  }

  return { kind: "retry", additionalContext: result.summary || "executor failed" };
}

async function runExecutor(args: {
  stepText: string;
  mode: "apply" | "fix_regression";
  model: string;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  coreContext?: string | null;
  excludePaths: string[];
  additionalContext: string;
  auditorName: string;
}): Promise<StepPhaseResult> {
  const {
    stepText,
    mode,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    auditorName,
  } = args;

  const { result } = await executePlanStep({
    stepText: formatStepText(stepText, additionalContext),
    mode,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
  });

  if (!result) {
    tui.logLeft(
      `[${auditorName}] executor returned no result for step: ${stepText} (possible Codex error)`,
      "error"
    );
    return { kind: "abort" };
  }

  if (!result.success || !result.patch) {
    return handleExecutorFailure(result, auditorName, mode);
  }

  return { kind: "proceed", execution: result, codeSnapshots: {} };
}

async function runExecuteStepValidator(args: {
  auditorName: string;
  mode: "apply" | "fix_regression";
  stepText: string;
  execution: ExecutePlanStepResult;
  coreContext?: string | null;
  workingDirectory: string;
  executeStepValidatorPath?: string;
  executeStepValidatorModel?: string;
  validateSchemaPath?: string;
}): Promise<StepPhaseResult> {
  const {
    auditorName,
    mode,
    stepText,
    execution,
    coreContext,
    workingDirectory,
    executeStepValidatorPath,
    executeStepValidatorModel,
    validateSchemaPath,
  } = args;

  if (!executeStepValidatorPath || !executeStepValidatorModel || !validateSchemaPath) {
    return { kind: "proceed", execution, codeSnapshots: {} };
  }

  const executionValidation = await validateExecuteStep({
    stepDescription: stepText,
    executorResult: execution,
    validatorPath: executeStepValidatorPath,
    validateSchemaPath,
    model: executeStepValidatorModel,
    workingDirectory,
    coreContext,
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
  });

  if (!executionValidation.valid) {
    tui.logLeft(
      `[${auditorName}] execute-step validation failed (${mode}): ${
        executionValidation.reason || "unknown"
      }`,
      "warn"
    );
    return {
      kind: "retry",
      additionalContext: `Execute-step validation failed: ${
        executionValidation.reason || "unknown"
      }`,
    };
  }

  return { kind: "proceed", execution, codeSnapshots: {} };
}

async function createExecutionResult(
  execution: ExecutePlanStepResult,
  workingDirectory: string
): Promise<StepPhaseResult> {
  const filesForSnapshot = collectFiles(execution);
  const codeSnapshots = await readSnapshots(Array.from(filesForSnapshot), workingDirectory);

  return { kind: "proceed", execution, codeSnapshots };
}

export async function executeStepPhase(args: ExecuteStepPhaseArgs): Promise<StepPhaseResult> {
  const {
    stepText,
    mode,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    auditorName,
    tracker,
    executeStepValidatorPath,
    executeStepValidatorModel,
    validateSchemaPath,
  } = args;

  if (!tracker.recordAttempt()) {
    return failStepDueToThreadLimit(auditorName, stepText);
  }

  const execution = await runExecutor({
    stepText,
    mode,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    auditorName,
  });
  if (execution.kind !== "proceed") {
    return execution;
  }

  const validation = await runExecuteStepValidator({
    auditorName,
    mode,
    stepText,
    execution: execution.execution,
    coreContext,
    workingDirectory,
    executeStepValidatorPath,
    executeStepValidatorModel,
    validateSchemaPath,
  });
  if (validation.kind !== "proceed") {
    return validation;
  }

  return createExecutionResult(execution.execution, workingDirectory);
}
