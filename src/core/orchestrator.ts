import path from "path";
import { tui } from "../cli/tui";
import { resolveModel } from "./model-resolver";
import { buildPlan, validatePlan } from "./codex";
import type { DriftlockConfig } from "./config-loader";
import { readJsonFile, readTextFile } from "../utils/fs";

type NoopPlan = { noop: true; reason?: string };
type PlanResult = unknown | null;

type PlanContext = {
  planFormatter: string;
  planSchema: unknown;
  validateSchemaPath: string;
};

type GeneratePlanArgs = {
  auditorName: string;
  auditorPath: string;
  config: DriftlockConfig;
  context: PlanContext;
};

type ValidatePlanArgs = {
  auditorName: string;
  plan: unknown;
  config: DriftlockConfig;
  context: PlanContext;
};

export async function runAuditLoop(
  auditors: string[],
  config: DriftlockConfig
): Promise<void> {
  const context = await createPlanContext(config);
  let index = 0;
  let noPlanStreak = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const auditorName = auditors[index];
    const hadPlan = await runSingleAuditor(auditorName, config, context);

    if (tui.isExitRequested()) {
      tui.shutdown();
      process.exit(0);
    }

    if (hadPlan) {
      noPlanStreak = 0;
    } else {
      noPlanStreak += 1;
      if (noPlanStreak >= auditors.length) {
        tui.logLeft("All auditors returned no plan consecutively; exiting.", "success");
        tui.shutdown();
        process.exit(0);
      }
    }

    index = (index + 1) % auditors.length;
  }
}

async function runSingleAuditor(
  auditorName: string,
  config: DriftlockConfig,
  context: PlanContext
): Promise<boolean> {
  const auditor = config.auditors[auditorName];
  if (!auditor || !auditor.enabled) return false;

  const plan = await generatePlanForAuditor({auditorName, auditorPath: auditor.path, config, context});
  if (!plan) return false;

  const isValid = await validatePlanForAuditor({ auditorName, plan, config, context });
  if (!isValid) return false;

  logPlan(auditorName, plan);
  return true;
}

async function createPlanContext(config: DriftlockConfig): Promise<PlanContext> {
  const planFormatter = await readTextFile(config.formatters.plan);
  const planSchema = await readJsonFile(config.formatters.schema);
  const validateSchemaPath = path.resolve(
    __dirname,
    "..",
    "..",
    "assets",
    "schemas",
    "validate-plan.schema.json"
  );

  return { planFormatter, planSchema, validateSchemaPath };
}

function isNoopPlan(plan: unknown): plan is NoopPlan {
  return Boolean(plan && typeof plan === "object" && (plan as NoopPlan).noop === true);
}

async function generatePlanForAuditor(args: GeneratePlanArgs): Promise<PlanResult> {
  const { auditorName, auditorPath, config, context } = args;
  const model = resolveModel(config, auditorName);

  try {
    const plan = await buildPlan({
      auditorName,
      auditorPath,
      model,
      planFormatter: context.planFormatter,
      planSchema: context.planSchema,
      workingDirectory: process.cwd(),
      onEvent: (text) => tui.logRight(text),
      onInfo: (text) => tui.logLeft(text),
    });

    if (plan && isNoopPlan(plan)) {
      const reason = plan.reason ?? "No changes required";
      tui.logLeft(`[${auditorName}] no work: ${reason}`, "warn");
      return null;
    }

    return plan ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    tui.logLeft(`[${auditorName}] plan generation failed: ${message}`, "error");
    return null;
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
    planSchemaPath: config.formatters.schema,
    validateSchemaPath: context.validateSchemaPath,
    model: resolveModel(config, auditorName, validatorName),
    workingDirectory: process.cwd(),
    onEvent: (text) => tui.logRight(text),
    onInfo: (text) => tui.logLeft(text),
  });

  if (!validation.valid) {
    const reason = validation.reason || "Plan failed validation";
    tui.logLeft(`[${auditorName}] plan rejected: ${reason}`, "error");
    return false;
  }

  return true;
}

function logPlan(auditorName: string, plan: unknown): void {
  const pretty = typeof plan === "string" ? plan : JSON.stringify(plan, null, 2);
  tui.logLeft(`[${auditorName}] plan:\n${pretty}`, "success");
}
