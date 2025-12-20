import { tui } from "../../cli/tui";
import { executePlanStep, type ExecutorThread, type ExecutePlanStepResult } from "./execute-plan-step";
import { validateExecuteStep } from "./validate-execute-step";
import type { ReasoningEffort } from "../config-loader";
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
  const nothingToChangePhrases = [
    "nothing to change",
    "nothing can be removed",
    "no changes made",
    "no change to apply",
    "no changes to apply",
    "no patch to apply",
    "already lacks",
    "already removed",
    "already doesn't have",
    "already does not have",
    "no regression fix is necessary",
    "no regression fix necessary",
    "no regression fix is needed",
    "no regression fix needed",
    "no regression fix required",
    "no fix is necessary",
    "no fix necessary",
    "no fix required",
    "nothing to delete",
    "nothing to remove",
    "no-op",
    "noop",
  ];
  const nothingToChange = nothingToChangePhrases.some((phrase) =>
    summaryLower.includes(phrase)
  );
  if (nothingToChange) {
    return { kind: "abort" };
  }

  return { kind: "retry", additionalContext: result.summary || "executor failed" };
}

async function runExecutor(args: {
  stepText: string;
  mode: "apply" | "fix_regression";
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  coreContext?: string | null;
  excludePaths: string[];
  additionalContext: string;
  turnTimeoutMs?: number;
  auditorName: string;
  thread: ExecutorThread | null;
}): Promise<StepPhaseResult> {
  const {
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    turnTimeoutMs,
    auditorName,
    thread,
  } = args;

  const { result, thread: usedThread } = await executePlanStep({
    stepText: formatStepText(stepText, additionalContext),
    mode,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    turnTimeoutMs,
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
    thread,
  });

  if (!result) {
    tui.logLeft(
      `[${auditorName}] executor returned no result for step: ${stepText} (possible Codex error)`,
      "error"
    );
    return { kind: "abort", thread: usedThread ?? thread };
  }

  if (!result.success || !result.patch) {
    const failure = handleExecutorFailure(result, auditorName, mode);
    failure.thread = usedThread ?? thread;
    return failure;
  }

  return {
    kind: "proceed",
    execution: result,
    codeSnapshots: {},
    thread: usedThread ?? thread ?? null,
  };
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
  executeStepValidatorReasoning?: ReasoningEffort;
  validateSchemaPath?: string;
  turnTimeoutMs?: number;
  thread: ExecutorThread | null;
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
    executeStepValidatorReasoning,
    validateSchemaPath,
    turnTimeoutMs,
    thread,
  } = args;

  // Skip executor validation for regression attempts; allow the quality gate to enforce safety.
  if (mode === "fix_regression") {
    return { kind: "proceed", execution, codeSnapshots: {}, thread };
  }

  if (!executeStepValidatorPath || !executeStepValidatorModel || !validateSchemaPath) {
    return { kind: "proceed", execution, codeSnapshots: {}, thread };
  }

  const executionValidation = await validateExecuteStep({
    stepDescription: stepText,
    executorResult: execution,
    validatorPath: executeStepValidatorPath,
    validateSchemaPath,
    model: executeStepValidatorModel,
    reasoning: executeStepValidatorReasoning,
    workingDirectory,
    coreContext,
    turnTimeoutMs,
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
      thread,
    };
  }

  return { kind: "proceed", execution, codeSnapshots: {}, thread };
}

async function createExecutionResult(
  execution: ExecutePlanStepResult,
  workingDirectory: string,
  thread: ExecutorThread | null
): Promise<StepPhaseResult> {
  const filesForSnapshot = collectFiles(execution);
  const codeSnapshots = await readSnapshots(Array.from(filesForSnapshot), workingDirectory);

  return { kind: "proceed", execution, codeSnapshots, thread };
}

export async function executeStepPhase(args: ExecuteStepPhaseArgs): Promise<StepPhaseResult> {
  const {
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    turnTimeoutMs,
    auditorName,
    tracker,
    executeStepValidatorPath,
    executeStepValidatorModel,
    executeStepValidatorReasoning,
    validateSchemaPath,
    thread,
  } = args;

  if (!tracker.recordAttempt()) {
    const failure = failStepDueToThreadLimit(auditorName, stepText);
    failure.thread = thread;
    return failure;
  }

  const execution = await runExecutor({
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    turnTimeoutMs,
    auditorName,
    thread,
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
    executeStepValidatorReasoning,
    validateSchemaPath,
    turnTimeoutMs,
    thread: execution.thread ?? null,
  });
  if (validation.kind !== "proceed") {
    return validation;
  }

  return createExecutionResult(execution.execution, workingDirectory, execution.thread ?? null);
}
