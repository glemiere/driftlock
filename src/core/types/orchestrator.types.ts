import type { DriftlockConfig, ReasoningEffort } from "../config-loader";
import type { ExecutePlanStepResult, ExecutorThread } from "../step/execute-plan-step";
import type { CommandResult } from "../utils/run-commands";

export type NoopPlan = { noop: true; reason?: string };
export type PlanResult = unknown | null;

export type PlanContext = {
  planFormatter: string;
  planSchema: unknown;
  validateSchemaPath: string;
  executeFormatterPath: string;
  executeRegressionFormatterPath: string;
  executeSchemaPath: string;
  validateStepSchemaPath: string;
  coreContext: string | null;
};

export type GeneratePlanArgs = {
  auditorName: string;
  auditorPath: string;
  config: DriftlockConfig;
  context: PlanContext;
  thread?: import("../plan/build-plan").PlanThread | null;
  revision?: import("../plan/build-plan").PlanRevisionContext;
};

export type ValidatePlanArgs = {
  auditorName: string;
  plan: unknown;
  config: DriftlockConfig;
  context: PlanContext;
};

export type StepQualityGateResult = {
  passed: boolean;
  additionalContext?: string;
};

export type PlanItem = {
  action?: string;
  why?: string;
  filesInvolved?: string[];
  steps?: string[];
  category?: string;
  risk?: string;
  supportiveEvidence?: string[];
};

export type ParsedPlan = {
  plan: PlanItem[];
  noop?: boolean;
  reason?: string;
  name?: string;
};

export type StepPhaseResult =
  | { kind: "abort"; thread?: ExecutorThread | null }
  | { kind: "retry"; additionalContext: string; thread?: ExecutorThread | null }
  | { kind: "proceed"; execution: ExecutePlanStepResult; codeSnapshots: Record<string, string>; thread: ExecutorThread | null };

export type StepTracker = {
  recordAttempt(): boolean;
  isExhausted(): boolean;
  getAttemptCount?: () => number;
};

export type ExecuteStepPhaseArgs = {
  auditorName: string;
  stepText: string;
  mode: "apply" | "fix_regression";
  model: string;
  reasoning?: ReasoningEffort;
  formatterPath: string;
  schemaPath: string;
  coreContext?: string | null;
  excludePaths: string[];
  workingDirectory: string;
  additionalContext: string;
  turnTimeoutMs?: number;
  tracker: StepTracker;
  executeStepValidatorPath?: string;
  executeStepValidatorModel?: string;
  executeStepValidatorReasoning?: ReasoningEffort;
  validateSchemaPath?: string;
  thread: ExecutorThread | null;
};

export type QualityStageName = "build" | "test" | "lint";

export type QualityStage = {
  name: QualityStageName;
  enabled: boolean;
  run: () => Promise<CommandResult>;
  buildFailureDetail: (result: CommandResult) => Promise<string>;
  retryOnFailure?: (result: CommandResult) => Promise<CommandResult | null>;
};

export type QualityStageContext = {
  config: DriftlockConfig;
  cwd: string;
  onCondenseTestFailure?: (stdout: string, stderr: string) => Promise<string | undefined>;
  touchedFiles?: string[];
};

export type StepRuntime = {
  auditorName: string;
  config: DriftlockConfig;
  context: PlanContext;
  stepLabelPrefix: string;
  gateFailureFallback: string;
  model: string;
  regressionModel: string;
  validatorModel: string;
  reasoning?: ReasoningEffort;
  regressionReasoning?: ReasoningEffort;
  validatorReasoning?: ReasoningEffort;
  executeStepValidatorPath?: string;
  executeStepValidatorModel?: string;
  executeStepValidatorReasoning?: ReasoningEffort;
  cwd: string;
  excludePaths: string[];
  turnTimeoutMs?: number;
  condense: (stdout: string, stderr: string) => Promise<string | undefined>;
};

export type StepExecutionState = {
  regressionAttempts: number;
  additionalContext: string;
  tracker: StepTracker;
  initialSnapshots: Record<string, string>;
  thread: ExecutorThread | null;
};

export type StepDetails = {
  displayStep: string;
  stepWithContext: string;
};

export type PhaseDecision = "proceed" | "completed" | "abort";
