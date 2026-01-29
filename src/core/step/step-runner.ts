import path from "node:path";
import { tui } from "../../cli/tui";
import { executePlanStep, type ExecutorThread, type ExecutePlanStepResult } from "./execute-plan-step";
import { validateExecuteStep } from "./validate-execute-step";
import type { ReasoningEffort } from "../config-loader";
import { captureWorktreeSnapshot, diffWorktreeSnapshots } from "../git/worktree";
import {
  type ExecuteStepPhaseArgs,
  type StepPhaseResult,
  type StepTracker,
} from "../types/orchestrator.types";
import { collectFiles, readSnapshots } from "./snapshots";

const NOTHING_TO_CHANGE_PHRASES = [
  "nothing to change",
  "nothing can be removed",
  "no changes made",
  "no change to apply",
  "no changes to apply",
  "no patch to apply",
  "no changes needed",
  "no change needed",
  "already lacks",
  "already removed",
  "already doesn't have",
  "already does not have",
  "already re-exported",
  "already exported",
  "already present",
  "already exists",
  "already done",
  "already satisfied",
  "no regression to fix",
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

const TEST_RUNNER_STARTUP_PHRASES = [
  "test runner failed to start",
  "failed to start plugin worker",
  "nx failed to start plugin worker",
  "failed to start worker process",
  "worker process failed to start",
  "could not start plugin worker",
];

function summaryIncludes(summary: string | undefined, phrases: string[]): boolean {
  if (!summary) return false;
  const summaryLower = summary.toLowerCase();
  return phrases.some((phrase) => summaryLower.includes(phrase));
}

function isNothingToChangeSummary(summary: string | undefined): boolean {
  return summaryIncludes(summary, NOTHING_TO_CHANGE_PHRASES);
}

function isTestRunnerStartupFailureSummary(summary: string | undefined): boolean {
  return summaryIncludes(summary, TEST_RUNNER_STARTUP_PHRASES);
}

function failStepDueToThreadLimit(auditorName: string, stepText: string): StepPhaseResult {
  tui.logLeft(`[${auditorName}] thread attempts exhausted for step: ${stepText}`, "error");
  return { kind: "abort" };
}

function formatStepText(
  stepText: string,
  additionalContext: string,
  mode: "apply" | "fix_regression"
): string {
  if (!additionalContext) return stepText;
  const tagName = mode === "fix_regression" ? "failure_summary" : "quality_summary";
  const label = mode === "fix_regression" ? "Failure Summary" : "Quality Summary";
  return `${stepText}\n\n${label}:\n<${tagName} trust="untrusted">\n${additionalContext}\n</${tagName}>`;
}

function handleExecutorFailure(
  result: ExecutePlanStepResult,
  auditorName: string,
  mode: "apply" | "fix_regression"
): StepPhaseResult {
  if (isTestRunnerStartupFailureSummary(result.summary)) {
    tui.logLeft(
      `[${auditorName}] test runner failed to start; skipping step: ${
        result.summary || "no summary"
      }`,
      "warn"
    );
    return { kind: "noop", reason: result.summary || "test runner failed to start" };
  }

  tui.logLeft(
    `[${auditorName}] executor failed step (${mode}): ${result.summary || "no summary"}`,
    "error"
  );

  if (isNothingToChangeSummary(result.summary)) {
    if (mode === "apply") {
      return { kind: "noop", reason: result.summary || "no changes needed" };
    }
    return { kind: "abort" };
  }

  if (mode === "fix_regression") {
    const summaryLower = (result.summary || "").toLowerCase();
    const nonRetryablePhrases = [
      "out of scope",
      "outside scope",
      "outside the scope",
      "scope limit",
      "scope limits",
      "unrelated",
      "not enough context",
      "insufficient context",
      "without broader context",
      "needs broader context",
      "no safe",
      "no minimal fix",
      "cannot be fixed safely",
      "can't be fixed safely",
      "not allowed",
      "cannot resolve",
      "cannot modify",
      "cannot touch",
      "cannot edit",
      "unable to resolve",
      "requires changes in",
      "requires changes to",
    ];
    const nonRetryable = nonRetryablePhrases.some((phrase) =>
      summaryLower.includes(phrase)
    );
    if (nonRetryable) {
      return { kind: "abort" };
    }
  }

  return { kind: "retry", additionalContext: result.summary || "executor failed" };
}

async function runExecutor(args: {
  stepText: string;
  mode: "apply" | "fix_regression";
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  additionalDirectories?: string[];
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
    additionalDirectories,
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
    stepText: formatStepText(stepText, additionalContext, mode),
    mode,
    model,
    reasoning,
    workingDirectory,
    additionalDirectories,
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

  if (!result.success) {
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
  thread: ExecutorThread | null,
  filesForSnapshot?: string[]
): Promise<StepPhaseResult> {
  const snapshotTargets =
    filesForSnapshot && filesForSnapshot.length > 0
      ? new Set(filesForSnapshot)
      : collectFiles(execution);
  const codeSnapshots = await readSnapshots(Array.from(snapshotTargets), workingDirectory);

  return { kind: "proceed", execution, codeSnapshots, thread };
}

function partitionExcludedPaths(
  files: string[],
  workingDirectory: string,
  excludePaths: string[]
): { included: string[]; excluded: string[] } {
  if (!excludePaths || excludePaths.length === 0) {
    return { included: files, excluded: [] };
  }

  const normalizedExcluded = excludePaths.map((excluded) => path.resolve(excluded));
  const included: string[] = [];
  const excluded: string[] = [];

  for (const file of files) {
    const absolute = path.resolve(workingDirectory, file);
    const hitsExcluded = normalizedExcluded.some(
      (excludedPath) =>
        absolute === excludedPath || absolute.startsWith(`${excludedPath}${path.sep}`)
    );
    if (hitsExcluded) {
      excluded.push(file);
    } else {
      included.push(file);
    }
  }

  return { included, excluded };
}

export async function executeStepPhase(args: ExecuteStepPhaseArgs): Promise<StepPhaseResult> {
  const {
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    additionalDirectories,
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

  const workspaceBefore = await captureWorktreeSnapshot(workingDirectory);
  const execution = await runExecutor({
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    additionalDirectories,
    formatterPath,
    schemaPath,
    coreContext,
    excludePaths,
    additionalContext,
    turnTimeoutMs,
    auditorName,
    thread,
  });

  const workspaceAfter = await captureWorktreeSnapshot(workingDirectory);
  let workspaceChangedFiles: string[] | null = null;
  if (workspaceBefore && workspaceAfter) {
    const changed = diffWorktreeSnapshots(workspaceBefore, workspaceAfter);
    const partitioned = partitionExcludedPaths(changed, workingDirectory, excludePaths);
    workspaceChangedFiles = partitioned.included;

    if (partitioned.excluded.length > 0) {
      tui.logLeft(
        `[${auditorName}] workspace changes include excluded paths: ${partitioned.excluded.join(
          ", "
        )}`,
        "error"
      );
      return { kind: "abort", thread: execution.thread ?? thread };
    }
  }

  if (execution.kind === "proceed") {
    if (!workspaceChangedFiles) {
      tui.logLeft(
        `[${auditorName}] executor reported success but git status is unavailable; aborting step: ${stepText}`,
        "warn"
      );
      return { kind: "abort", thread: execution.thread ?? null };
    }

    if (isNothingToChangeSummary(execution.execution.summary)) {
      const threadRef = execution.thread ?? null;
      if (!workspaceChangedFiles) {
        tui.logLeft(
          `[${auditorName}] executor reported no changes but git status is unavailable; aborting step: ${stepText}`,
          "warn"
        );
        return { kind: "abort", thread: threadRef };
      }
      if (workspaceChangedFiles.length === 0) {
        return {
          kind: "noop",
          reason: execution.execution.summary || "no changes needed",
          thread: threadRef,
        };
      }
      tui.logLeft(
        `[${auditorName}] executor reported no changes but git detected modifications: ${workspaceChangedFiles.join(
          ", "
        )}`,
        "warn"
      );
    }
  }

  if (execution.kind === "noop") {
    const threadRef = execution.thread ?? null;
    if (!workspaceChangedFiles) {
      tui.logLeft(
        `[${auditorName}] executor reported no changes but git status is unavailable; aborting step: ${stepText}`,
        "warn"
      );
      return { kind: "abort", thread: threadRef };
    }

    if (workspaceChangedFiles.length > 0) {
      tui.logLeft(
        `[${auditorName}] executor reported no changes but git detected modifications: ${workspaceChangedFiles.join(
          ", "
        )}`,
        "warn"
      );
      return { kind: "abort", thread: threadRef };
    }

    tui.logLeft(
      `[${auditorName}] no changes detected; skipping step: ${stepText}`,
      "success"
    );
    return { kind: "noop", reason: execution.reason, thread: threadRef };
  }

  if (execution.kind !== "proceed") {
    if (workspaceChangedFiles && workspaceChangedFiles.length > 0) {
      tui.logLeft(
        `[${auditorName}] executor failed but workspace changed (${workspaceChangedFiles.length} file(s)): ${workspaceChangedFiles.join(
          ", "
        )}`,
        "warn"
      );
    }
    return execution;
  }

  if (workspaceChangedFiles && workspaceChangedFiles.length === 0) {
    tui.logLeft(
      `[${auditorName}] executor reported success but git detected no file changes for step: ${stepText}`,
      "warn"
    );
    return { kind: "abort", thread: execution.thread ?? null };
  }

  if (workspaceChangedFiles && workspaceChangedFiles.length > 0) {
    execution.execution.filesTouched = workspaceChangedFiles;
    execution.execution.filesWritten = workspaceChangedFiles;
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

  return createExecutionResult(
    execution.execution,
    workingDirectory,
    execution.thread ?? null,
    workspaceChangedFiles ?? undefined
  );
}
