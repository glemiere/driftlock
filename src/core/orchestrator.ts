import { promises as fs } from "fs";
import { tui } from "../cli/tui";
import {
  resolveAuditorModel,
  resolveAuditorReasoning,
  resolveExecuteStepModel,
  resolveExecuteStepReasoning,
  resolveValidatorModel,
  resolveValidatorReasoning,
} from "./utils/model-resolver";
import { buildPlan } from "./plan/build-plan";
import { validatePlan } from "./plan/validate-plan";
import { validateStep } from "./step/validate-step";
import type { ExecutePlanStepResult, ExecutorThread } from "./step/execute-plan-step";
import type { DriftlockConfig, ReasoningEffort } from "./config-loader";
import type { GitContext } from "./git/git-manager";
import type {
  GeneratePlanArgs,
  PlanContext,
  PlanItem,
  PlanResult,
  PhaseDecision,
  StepDetails,
  StepTracker,
  StepPhaseResult,
  StepRuntime,
  StepQualityGateResult,
  StepExecutionState,
  ValidatePlanArgs,
} from "./types/orchestrator.types";
import { readJsonFile, readTextFile } from "../utils/fs";
import { checkQualityGateDisabled } from "./quality/quality-gate";
import {
  assetsPath,
  createQualityStages,
  createTestFailureCondenser,
  runQualityStages,
} from "./quality/quality-gate-runner";
import { executeStepPhase } from "./step/step-runner";
import { ThreadAttemptTracker } from "./utils/thread-tracker";
import { parsePlan, isNoopPlan, logPlan } from "./plan/plan-utils";
import { collectFiles, readSnapshots, filesChanged } from "./step/snapshots";
import { rollbackWorkingTree } from "./git/rollback";
import { commitPlanChanges, pushBranch } from "./git/git-manager";
export { ThreadAttemptTracker } from "./utils/thread-tracker";

export async function runAuditLoop(
  auditors: string[],
  config: DriftlockConfig,
  gitContext?: GitContext
): Promise<AuditLoopResult> {
  const context = await createPlanContext(config);
  await maybeRunBaselineQualityGate(config);
  let index = 0;
  let noPlanStreak = 0;
  const committedPlans: CommittedPlanSummary[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (tui.isExitRequested()) {
      const reason = tui.getExitReason?.();
      tui.logLeft(
        `Exit requested${reason ? ` (${reason})` : ""}; stopping before running ${auditors[index]}.`,
        "warn"
      );
      return { exitReason: "user_exit", committedPlans };
    }

    const auditorName = auditors[index];
    const outcome = await runSingleAuditor(auditorName, config, context, gitContext);

    if (outcome.status === "success") {
      noPlanStreak = 0;
      if (outcome.committedPlan) {
        committedPlans.push(outcome.committedPlan);
      }
    } else if (outcome.status === "no-plan") {
      noPlanStreak += 1;
      if (noPlanStreak >= auditors.length) {
        tui.logLeft("All auditors returned no plan consecutively; exiting.", "success");
        return { exitReason: "no_more_plans", committedPlans };
      }
    } else {
      // failure: do not count toward no-plan streak
      noPlanStreak = 0;
    }

    if (tui.isExitRequested()) {
      const reason = tui.getExitReason?.();
      tui.logLeft(
        `Exit requested${reason ? ` (${reason})` : ""}; stopping after ${auditorName}.`,
        "warn"
      );
      return { exitReason: "user_exit", committedPlans };
    }

    index = (index + 1) % auditors.length;
  }
}

export type CommittedPlanSummary = {
  auditorName: string;
  planName: string | null;
  commitMessage: string;
  actions: string[];
};

export type AuditLoopResult = {
  exitReason: "user_exit" | "no_more_plans";
  committedPlans: CommittedPlanSummary[];
};

class BaselineQualityGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaselineQualityGateError";
  }
}

type AuditorOutcome =
  | { status: "success"; committedPlan?: CommittedPlanSummary }
  | { status: "no-plan" }
  | { status: "failed" };

async function runSingleAuditor(
  auditorName: string,
  config: DriftlockConfig,
  context: PlanContext,
  gitContext?: GitContext
): Promise<AuditorOutcome> {
  const auditor = config.auditors[auditorName];
  if (!auditor || !auditor.enabled) return { status: "no-plan" };

  const planResult = await generatePlanForAuditor({
    auditorName,
    auditorPath: auditor.path,
    config,
    context,
  });
  if (planResult.status === "noop") return { status: "no-plan" };
  if (planResult.status === "error") return { status: "failed" };

  const plan = planResult.plan;

  const isValid = await validatePlanForAuditor({ auditorName, plan, config, context });
  if (!isValid) return { status: "failed" };

  logPlan(auditorName, plan);
  const parsedPlan = parsePlan(plan);
  if (!parsedPlan || parsedPlan.plan.length === 0) {
    tui.logLeft(`[${auditorName}] no executable steps in plan.`, "warn");
    return { status: "no-plan" };
  }
  const planName = parsedPlan.name || (typeof plan === "object" && plan && (plan as { name?: string }).name) || null;

  const runtime = createStepRuntime({
    auditorName,
    config,
    context,
    stepLabelPrefix: "step (requires a full green pass)",
    gateFailureFallback: "Quality gate failed (build/lint/test).",
  });

  for (const item of parsedPlan.plan) {
    const executed = await executePlanItem(item, runtime);
    if (!executed) {
      await safeRollback(runtime.cwd, auditorName);
      return { status: "failed" };
    }
  }

  const commitMessage = planName ? planName : `[driftlock] ${auditorName} plan`;
  const committed = await commitPlanChanges(commitMessage, runtime.cwd);
  if (!committed) {
    tui.logLeft(`[${auditorName}] commit skipped or failed (no changes to commit?).`, "warn");
  } else {
    tui.logLeft(`[${auditorName}] plan committed: ${commitMessage}`, "success");
    if (gitContext?.branch) {
      await pushBranch(gitContext, runtime.cwd);
    }
  }

  const committedPlan = committed
    ? {
        auditorName,
        planName,
        commitMessage,
        actions: parsedPlan.plan
          .map((planItem) => planItem.action)
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      }
    : undefined;

  return { status: "success", committedPlan };
}

async function safeRollback(cwd: string, auditorName: string): Promise<void> {
  const spinner = tui
    .logLeft(`[${auditorName}] rolling back plan changes.`, "warn")
    .withSpinner("dots");

  try {
    await rollbackWorkingTree(cwd);
    spinner.success(`[${auditorName}] rolled back plan changes.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.failure(`[${auditorName}] rollback failed: ${message}`);
  }
}

async function createPlanContext(config: DriftlockConfig): Promise<PlanContext> {
  const planFormatter = await readTextFile(config.formatters.plan.path);
  const planSchema = await readJsonFile(config.formatters.plan.schema);
  const validateSchemaPath = assetsPath("schemas", "validate-plan.schema.json");

  const executeFormatterPath = config.formatters.executeStep.path;
  const executeSchemaPath = config.formatters.executeStep.schema;
  const validateStepSchemaPath = assetsPath("schemas", "validate-plan.schema.json");
  const coreContextPath = assetsPath("context", "driftlock-core.md");
  let coreContext: string | null = null;
  try {
    coreContext = await fs.readFile(coreContextPath, "utf8");
  } catch {
    coreContext = null;
  }

  return {
    planFormatter,
    planSchema,
    validateSchemaPath,
    executeFormatterPath,
    executeSchemaPath,
    validateStepSchemaPath,
    coreContext,
  };
}

async function maybeRunBaselineQualityGate(config: DriftlockConfig): Promise<void> {
  if (!config.runBaselineQualityGate) return;

  const cwd = process.cwd();
  const gateDisabled = checkQualityGateDisabled(config.qualityGate);

  if (gateDisabled) {
    tui.logLeft("Baseline quality gate skipped (all quality stages disabled).", "warn");
    return;
  }

  const baseLineGateSpinner = tui.logLeft("Running the quality gate to make sure we have a clean base to work on.", "accent").withSpinner("dots");
  const baselineGate = await runStepQualityGate({
    auditorName: "baseline",
    stepLabel: "baseline quality gate (build/lint/test before auditors)",
    config,
    cwd,
    maxAttempts: 1,
  });

  if (!baselineGate.passed) {
    const message = baselineGate.additionalContext || "build/lint/test did not pass";
    baseLineGateSpinner.failure(`Baseline quality gate failed: ${message}`);
    throw new BaselineQualityGateError(`Baseline quality gate failed: ${message}`);
  }

  baseLineGateSpinner.success("Baseline quality gate passed (build/lint/test all green).");
}

async function runStepQualityGate(args: {
  auditorName: string;
  stepLabel: string;
  config: DriftlockConfig;
  cwd: string;
  onCondenseTestFailure?: (stdout: string, stderr: string) => Promise<string | undefined>;
  maxAttempts?: number;
}): Promise<StepQualityGateResult> {
  const { auditorName, stepLabel, config, cwd, onCondenseTestFailure } = args;

  tui.logLeft(`[${auditorName}] quality gate for ${stepLabel}`, "accent");
  const stages = createQualityStages({ config, cwd, onCondenseTestFailure });
  const configuredMaxAttempts =
    typeof args.maxAttempts === "number" ? args.maxAttempts : config.maxValidationRetries;
  const requiredPasses = Math.max(configuredMaxAttempts || 1, 1);

  for (let pass = 1; pass <= requiredPasses; pass += 1) {
    tui.logLeft(
      `[${auditorName}] quality gate pass ${pass}/${requiredPasses} for ${stepLabel}`
    );

    const gateResult = await runQualityStages(auditorName, stages);
    if (!gateResult.passed) {
      return {
        passed: false,
        additionalContext:
          gateResult.additionalContext ||
          `Quality gate failed during pass ${pass}/${requiredPasses} (build/lint/test).`,
      };
    }
  }

  tui.logLeft(`[${auditorName}] quality gate passed for ${stepLabel}.`, "success");
  return { passed: true };
}

async function runRegressionForStep(args: {
  auditorName: string;
  stepText: string;
  model: string;
  reasoning?: ReasoningEffort;
  validatorModel: string;
  validatorReasoning?: ReasoningEffort;
  config: DriftlockConfig;
  context: PlanContext;
  cwd: string;
  excludePaths: string[];
  tracker: StepTracker;
  regressionAttempts: number;
  additionalContext: string;
  initialSnapshots: Record<string, string>;
  gateFailureFallback: string;
  state: StepExecutionState;
}): Promise<boolean> {
  const {
    auditorName,
    stepText,
    model,
    reasoning,
    validatorModel,
    validatorReasoning,
    config,
    context,
    cwd,
    excludePaths,
    tracker,
    initialSnapshots,
    gateFailureFallback,
    state,
  } = args;

  let regressionAttempts = args.regressionAttempts;
  let additionalContext = args.additionalContext;

  const condense = createTestFailureCondenser(config, auditorName, cwd);

  while (true) {
    const execPhase = await executeStepPhase({
      auditorName,
      stepText,
      mode: "fix_regression",
      model,
      reasoning,
      formatterPath: context.executeFormatterPath,
      schemaPath: context.executeSchemaPath,
      coreContext: context.coreContext,
      excludePaths,
      workingDirectory: cwd,
      additionalContext,
      turnTimeoutMs: config.turnTimeoutMs,
      tracker,
      executeStepValidatorPath: config.validators["execute-step"]?.path,
      executeStepValidatorModel: resolveValidatorModel(config, auditorName, "execute-step"),
      executeStepValidatorReasoning: resolveValidatorReasoning(config, auditorName, "execute-step"),
      validateSchemaPath: context.validateStepSchemaPath,
      thread: state.thread,
    });

    if (execPhase.kind === "abort") {
      state.thread = execPhase.thread ?? state.thread;
      return false;
    }
    if (execPhase.kind === "retry") {
      additionalContext = execPhase.additionalContext;
      state.thread = execPhase.thread ?? state.thread;
      if (shouldAbortRegression(++regressionAttempts, tracker, config)) return false;
      continue;
    }

    state.thread = execPhase.thread ?? state.thread;

    const validationPhase = await validateStepPhase({
      auditorName,
      stepText,
      execution: execPhase.execution,
      codeSnapshots: execPhase.codeSnapshots,
      initialSnapshots,
      validatorModel,
      validatorReasoning,
      config,
      context,
      cwd,
      mode: "fix_regression",
      thread: state.thread,
    });

    if (validationPhase.kind === "abort") {
      state.thread = validationPhase.thread ?? state.thread;
      return false;
    }
    if (validationPhase.kind === "retry") {
      additionalContext = validationPhase.additionalContext;
      state.thread = validationPhase.thread ?? state.thread;
      if (shouldAbortRegression(++regressionAttempts, tracker, config)) return false;
      continue;
    }

    const disabledGate = checkQualityGateDisabled({
      build: config.qualityGate.build,
      lint: config.qualityGate.lint,
      test: config.qualityGate.test,
    });
    if (disabledGate) {
      tui.logLeft(`[${auditorName}] step passed quality gate after 0 attempt(s).`, "success");
      return true;
    }

    const gate = await runStepQualityGate({
      auditorName,
      stepLabel: `step regression: ${stepText}`,
      config,
      cwd,
      onCondenseTestFailure: condense,
    });

    if (gate.passed) {
      return true;
    }

    additionalContext = gate.additionalContext || gateFailureFallback;
    tui.logLeft(
      `[${auditorName}] quality gate failed: ${additionalContext}`,
      "warn"
    );
    if (shouldAbortRegression(++regressionAttempts, tracker, config)) return false;
  }
}

function createStepRuntime(args: {
  auditorName: string;
  config: DriftlockConfig;
  context: PlanContext;
  stepLabelPrefix: string;
  gateFailureFallback: string;
  model?: string;
  regressionModel?: string;
  validatorModel?: string;
  reasoning?: ReasoningEffort;
  regressionReasoning?: ReasoningEffort;
  validatorReasoning?: ReasoningEffort;
  executeStepValidatorPath?: string;
  executeStepValidatorModel?: string;
  executeStepValidatorReasoning?: ReasoningEffort;
}): StepRuntime {
  const cwd = process.cwd();
  return {
    auditorName: args.auditorName,
    config: args.config,
    context: args.context,
    stepLabelPrefix: args.stepLabelPrefix,
    gateFailureFallback: args.gateFailureFallback,
    model: args.model ?? resolveExecuteStepModel(args.config, args.auditorName, "apply"),
    regressionModel:
      args.regressionModel ??
      resolveExecuteStepModel(args.config, args.auditorName, "fix_regression"),
    validatorModel:
      args.validatorModel ??
      resolveValidatorModel(args.config, args.auditorName, "step"),
    reasoning:
      args.reasoning ??
      resolveExecuteStepReasoning(args.config, args.auditorName, "apply"),
    regressionReasoning:
      args.regressionReasoning ??
      resolveExecuteStepReasoning(args.config, args.auditorName, "fix_regression"),
    validatorReasoning:
      args.validatorReasoning ??
      resolveValidatorReasoning(args.config, args.auditorName, "step"),
    executeStepValidatorPath: args.executeStepValidatorPath,
    executeStepValidatorModel: args.executeStepValidatorModel,
    executeStepValidatorReasoning:
      args.executeStepValidatorReasoning ??
      resolveValidatorReasoning(args.config, args.auditorName, "execute-step"),
    cwd,
    excludePaths: args.config.exclude,
    turnTimeoutMs: args.config.turnTimeoutMs,
    condense: createTestFailureCondenser(args.config, args.auditorName, cwd),
  };
}

async function executePlanItem(
  item: PlanItem,
  runtime: StepRuntime,
): Promise<boolean> {
  const steps = Array.isArray(item.steps) ? item.steps : [];

  for (const stepText of steps) {
    const stepDetails: StepDetails = {
      displayStep: stepText,
      stepWithContext: buildStepPromptWithContext(stepText, item),
    };
    const outcome = await runStepPipeline(stepDetails, runtime);
    if (!outcome.success) {
      return false;
    }
  }

  return true;
}

async function runStepPipeline(
  step: StepDetails,
  runtime: StepRuntime
): Promise<{ success: boolean; execution?: ExecutePlanStepResult }> {
  const state = await prepareStepState(runtime);
  let lastExecution: ExecutePlanStepResult | undefined;
  
  tui.logLeft(`[${runtime.auditorName}] starting step: ${step.displayStep}`);

  const applyPhase = await performApplyPhase(step, runtime, state);
  state.thread = applyPhase.thread ?? state.thread;
  if (applyPhase.kind === "proceed") {
    lastExecution = applyPhase.execution;
  }
  const applyDecision = await handlePhaseDecision({
    phaseName: "apply phase",
    phase: applyPhase,
    runtime,
    step,
    state,
  });
  if (applyDecision === "abort") return { success: false };
  if (applyDecision === "completed") return { success: true, execution: lastExecution };
  if (applyPhase.kind !== "proceed") return { success: false };

  const validationPhase = await performValidationPhase(step, runtime, state, applyPhase);
  state.thread = validationPhase.thread ?? state.thread;
  if (validationPhase.kind === "proceed") {
    lastExecution = validationPhase.execution;
  }
  const validationDecision = await handlePhaseDecision({
    phaseName: "validation phase",
    phase: validationPhase,
    runtime,
    step,
    state,
  });
  if (validationDecision === "abort") return { success: false };
  if (validationDecision === "completed") return { success: true, execution: lastExecution };
  if (validationPhase.kind !== "proceed") return { success: false };

  const gateSuccess = await enforceQualityGate(step, runtime, state);
  return { success: gateSuccess, execution: lastExecution };
}

async function prepareStepState(runtime: StepRuntime): Promise<StepExecutionState> {
  return {
    regressionAttempts: 0,
    additionalContext: "",
    tracker: new ThreadAttemptTracker(runtime.config.maxThreadLifetimeAttempts),
    initialSnapshots: await readSnapshots([], runtime.cwd),
    thread: null,
  };
}

async function performApplyPhase(
  step: StepDetails,
  runtime: StepRuntime,
  state: StepExecutionState
): Promise<StepPhaseResult> {
  tui.logLeft(`[${runtime.auditorName}] apply phase for step: ${step.displayStep}`);

  return executeStepPhase({
    auditorName: runtime.auditorName,
    stepText: step.stepWithContext,
    mode: "apply",
    model: runtime.model,
    reasoning: runtime.reasoning,
    formatterPath: runtime.context.executeFormatterPath,
    schemaPath: runtime.context.executeSchemaPath,
    coreContext: runtime.context.coreContext,
    excludePaths: runtime.excludePaths,
    workingDirectory: runtime.cwd,
    additionalContext: state.additionalContext,
    turnTimeoutMs: runtime.turnTimeoutMs,
    tracker: state.tracker,
    executeStepValidatorPath: runtime.executeStepValidatorPath,
    executeStepValidatorModel: runtime.executeStepValidatorModel,
    executeStepValidatorReasoning: runtime.executeStepValidatorReasoning,
    validateSchemaPath: runtime.context.validateStepSchemaPath,
    thread: state.thread,
  });
}

async function performValidationPhase(
  step: StepDetails,
  runtime: StepRuntime,
  state: StepExecutionState,
  exec: Extract<StepPhaseResult, { kind: "proceed" }>
): Promise<StepPhaseResult> {
  tui.logLeft(
    `[${runtime.auditorName}] validation phase for step: ${step.displayStep}`
  );

  return validateStepPhase({
    auditorName: runtime.auditorName,
    stepText: step.stepWithContext,
    execution: exec.execution,
    codeSnapshots: exec.codeSnapshots,
    initialSnapshots: state.initialSnapshots,
    validatorModel: runtime.validatorModel,
    validatorReasoning: runtime.validatorReasoning,
    config: runtime.config,
    context: runtime.context,
    cwd: runtime.cwd,
    mode: "apply",
    thread: state.thread,
  });
}

async function handlePhaseDecision(args: {
  phaseName: string;
  phase: StepPhaseResult;
  runtime: StepRuntime;
  step: StepDetails;
  state: StepExecutionState;
}): Promise<PhaseDecision> {
  const { phaseName, phase, runtime, step, state } = args;

  if ("thread" in phase && phase.thread !== undefined) {
    state.thread = (phase.thread as ExecutorThread | null) ?? state.thread;
  }

  if (phase.kind === "abort") {
    tui.logLeft(
      `[${runtime.auditorName}] ${phaseName} aborted for step: ${step.stepWithContext}`,
      "error"
    );
    return "abort";
  }

  if (phase.kind === "retry") {
    state.additionalContext = phase.additionalContext;
    tui.logLeft(
      `[${runtime.auditorName}] ${phaseName} failed; scheduling regression: ${state.additionalContext}`,
      "warn"
    );
    const recovered = await triggerRegression(step, runtime, state);
    return recovered ? "completed" : "abort";
  }

  tui.logLeft(
    `[${runtime.auditorName}] ${phaseName} succeeded for step: ${step.stepWithContext}`,
    "success"
  );
  return "proceed";
}

async function enforceQualityGate(
  step: StepDetails,
  runtime: StepRuntime,
  state: StepExecutionState
): Promise<boolean> {
  const gateOutcome = await evaluateQualityGate({
    runtime,
    displayStep: step.displayStep,
  });

  if (gateOutcome.status === "passed") {
    return true;
  }

  state.additionalContext = gateOutcome.additionalContext;
  tui.logLeft(
    `[${runtime.auditorName}] quality gate failed: ${state.additionalContext}`,
    "warn"
  );

  return triggerRegression(step, runtime, state);
}

async function triggerRegression(
  step: StepDetails,
  runtime: StepRuntime,
  state: StepExecutionState
): Promise<boolean> {
  state.regressionAttempts += 1;
  if (shouldAbortRegression(state.regressionAttempts, state.tracker, runtime.config)) {
    return false;
  }

  tui.logLeft(
    `[${runtime.auditorName}] entering regression (attempt ${state.regressionAttempts}/${runtime.config.maxRegressionAttempts}) for step: ${step.stepWithContext}`,
    "warn"
  );

  return runRegressionForStep({
    auditorName: runtime.auditorName,
    stepText: step.displayStep,
    model: runtime.regressionModel,
    reasoning: runtime.regressionReasoning,
    validatorModel: runtime.validatorModel,
    validatorReasoning: runtime.validatorReasoning,
    config: runtime.config,
    context: runtime.context,
    cwd: runtime.cwd,
    excludePaths: runtime.excludePaths,
    tracker: state.tracker,
    regressionAttempts: state.regressionAttempts,
    additionalContext: state.additionalContext,
    initialSnapshots: state.initialSnapshots,
    gateFailureFallback: runtime.gateFailureFallback,
    state,
  });
}

async function evaluateQualityGate(args: {
  runtime: StepRuntime;
  displayStep: string;
}): Promise<{ status: "passed" } | { status: "failed"; additionalContext: string }> {
  const { runtime, displayStep } = args;

  const qualityDisabled = checkQualityGateDisabled({
    build: runtime.config.qualityGate.build,
    lint: runtime.config.qualityGate.lint,
    test: runtime.config.qualityGate.test,
  });
  if (qualityDisabled) {
    tui.logLeft(
      `[${runtime.auditorName}] ${runtime.stepLabelPrefix} passed quality gate after 0 attempt(s).`,
      "success"
    );
    return { status: "passed" };
  }

  const gate = await runStepQualityGate({
    auditorName: runtime.auditorName,
    stepLabel: `${runtime.stepLabelPrefix}: ${displayStep}`,
    config: runtime.config,
    cwd: runtime.cwd,
    onCondenseTestFailure: runtime.condense,
  });

  if (gate.passed) {
    return { status: "passed" };
  }

  return {
    status: "failed",
    additionalContext: gate.additionalContext || runtime.gateFailureFallback,
  };
}

type PlanFetchResult =
  | { status: "success"; plan: PlanResult }
  | { status: "noop" }
  | { status: "error" };

async function generatePlanForAuditor(args: GeneratePlanArgs): Promise<PlanFetchResult> {
  const { auditorName, auditorPath, config, context } = args;
  const model = resolveAuditorModel(config, auditorName);
  const reasoning = resolveAuditorReasoning(config, auditorName);

  try {
    const plan = await buildPlan({
      auditorName,
      auditorPath,
      model,
      reasoning,
      planFormatter: context.planFormatter,
      planSchema: context.planSchema,
      workingDirectory: process.cwd(),
      turnTimeoutMs: config.turnTimeoutMs,
      onEvent: (text) => tui.logRight(text),
      onInfo: (text) => tui.logLeft(text),
    });

    if (plan && isNoopPlan(plan)) {
      const reason = plan.reason ?? "No changes required";
      tui.logLeft(`[${auditorName}] no work: ${reason}`, "warn");
      return { status: "noop" };
    }

    if (!plan) {
      return { status: "error" };
    }

    return { status: "success", plan };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tui.logLeft(`[${auditorName}] plan generation failed: ${message}`, "error");
    return { status: "error" };
  }
}

async function validatePlanForAuditor(args: ValidatePlanArgs): Promise<boolean> {
  const { auditorName, plan, config, context } = args;
  const validatorName = "plan";
  const validator = config.validators[validatorName];
  if (!validator) {
    tui.logLeft(`[${auditorName}] missing validator "${validatorName}"`, "error");
    return false;
  }

  const validation = await validatePlan({
    auditorName,
    validatorName,
    validatorPath: validator.path,
    plan,
    planSchemaPath: config.formatters.plan.schema,
    validateSchemaPath: context.validateSchemaPath,
    model: resolveValidatorModel(config, auditorName, validatorName),
    reasoning: resolveValidatorReasoning(config, auditorName, validatorName),
    excludePaths: config.exclude,
    workingDirectory: process.cwd(),
    turnTimeoutMs: config.turnTimeoutMs,
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
  });

  if (!validation.valid) {
    const reason = validation.reason || "Plan failed validation";
    tui.logLeft(`[${auditorName}] plan rejected: ${reason}`, "error");
    const prettyPlan =
      typeof plan === "string" ? plan : (() => {
        try {
          return JSON.stringify(plan, null, 2);
        } catch {
          return String(plan);
        }
      })();
    tui.logLeft(`[${auditorName}] rejected plan content:\n${prettyPlan}`, "warn");
    return false;
  }

  return true;
}

async function validateStepPhase(args: {
  auditorName: string;
  stepText: string;
  execution: ExecutePlanStepResult;
  codeSnapshots: Record<string, string>;
  initialSnapshots: Record<string, string>;
  validatorModel: string;
  validatorReasoning?: ReasoningEffort;
  config: DriftlockConfig;
  context: PlanContext;
  cwd: string;
  mode: "apply" | "fix_regression";
  thread?: ExecutorThread | null;
}): Promise<StepPhaseResult> {
  const {
    auditorName,
    stepText,
    execution,
    codeSnapshots,
    initialSnapshots,
    validatorModel,
    validatorReasoning,
    config,
    context,
    cwd,
    mode,
    thread,
  } = args;

  // For regressions, skip semantic validation and defer safety to the quality gate.
  if (mode === "fix_regression") {
    return { kind: "proceed", execution, codeSnapshots, thread: thread ?? null };
  }

  const filesForSnapshot = collectFiles(execution);
  if (!filesChanged(initialSnapshots, codeSnapshots, Array.from(filesForSnapshot))) {
    tui.logLeft(
      `[${auditorName}] executor reported success but files are unchanged for step: ${stepText}`,
      "warn"
    );
    // Treat this as a non-retryable failure for this step: either the executor
    // metadata is inconsistent or the patch was effectively a no-op. Do not
    // schedule a regression based on this; the safest course is to abort the
    // step so the caller can decide whether to re-run apply or roll back.
    return { kind: "abort", thread: thread ?? null };
  }

  const stepValidation = await validateStep({
    stepDescription: stepText,
    executorResult: execution,
    codeSnapshots,
    validatorPath: config.validators.step.path,
    validateSchemaPath: context.validateStepSchemaPath,
    model: validatorModel,
    reasoning: validatorReasoning,
    workingDirectory: cwd,
    turnTimeoutMs: config.turnTimeoutMs,
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
  });

  if (!stepValidation.valid) {
    tui.logLeft(
      `[${auditorName}] step validation failed (${mode}): ${stepValidation.reason || "unknown"}`,
      "warn"
    );
    return {
      kind: "retry",
      additionalContext: `Step validation failed: ${stepValidation.reason || "unknown"}`,
      thread: thread ?? null,
    };
  }

  return { kind: "proceed", execution, codeSnapshots, thread: thread ?? null };
}

function shouldAbortRegression(
  regressionAttempts: number,
  tracker: StepTracker,
  config: DriftlockConfig
): boolean {
  const hasRegressionCap =
    typeof config.maxRegressionAttempts === "number" && config.maxRegressionAttempts > 0;
  const exceededRegressionCap = hasRegressionCap && regressionAttempts > config.maxRegressionAttempts;
  return exceededRegressionCap || tracker.isExhausted();
}

function buildStepPromptWithContext(stepText: string, item: PlanItem): string {
  const contextParts: string[] = [];
  if (item.action) contextParts.push(`Action: ${item.action}`);
  if (item.why) contextParts.push(`Why: ${item.why}`);
  if (Array.isArray(item.filesInvolved) && item.filesInvolved.length > 0) {
    contextParts.push(`FilesInvolved: ${item.filesInvolved.join(", ")}`);
  }
  if (Array.isArray(item.supportiveEvidence) && item.supportiveEvidence.length > 0) {
    contextParts.push(
      `SupportiveEvidence:\n${item.supportiveEvidence.map((e) => `- ${e}`).join("\n")}`
    );
  }

  const contextText = contextParts.length > 0 ? `\n\nPlanItemContext:\n${contextParts.join("\n")}` : "";
  return `${stepText.trim()}${contextText}`;
}
