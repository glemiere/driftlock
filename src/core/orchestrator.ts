import path from "path";
import { tui } from "../cli/tui";
import { resolveModel } from "./model-resolver";
import { buildPlan, validatePlan } from "./codex";
import type { DriftlockConfig } from "./config-loader";
import { readJsonFile, readTextFile } from "../utils/fs";

type NoopPlan = { noop: true; reason?: string };
type PlanResult = unknown | null;
type GeneratePlanArgs = {
  auditorName: string;
  auditorPath: string;
  config: DriftlockConfig;
  planFormatter: string;
  planSchema: unknown;
};

export async function runAudit(
  auditors: string[],
  config: DriftlockConfig
): Promise<void> {
  const planFormatter = await readTextFile(config.formatters.plan);
  const planSchema = await readJsonFile(config.formatters.schema);
  const validateSchemaPath = path.resolve(
    __dirname,
    "..",
    "..",
    "assets",
    "schemas",
    "validate.schema.json"
  );

  for (const auditorName of auditors) {
    const auditor = config.auditors[auditorName];
    if (!auditor || !auditor.enabled) {
      continue;
    }

    const plan = await generatePlanForAuditor({
      auditorName,
      auditorPath: auditor.path,
      config,
      planFormatter,
      planSchema,
    });

    if (plan) {
      const validatorName = "plan";
      const validator = config.validators[validatorName];
      if (!validator) {
        tui.logLeft(`[${auditorName}] missing validator "${validatorName}"`, "error");
        continue;
      }

      const validation = await validatePlan({
        auditorName,
        validatorName,
        validatorPath: validator.path,
        plan,
        planSchemaPath: config.formatters.schema,
        validateSchemaPath,
        model: resolveModel(config, auditorName, validatorName),
        workingDirectory: process.cwd(),
        onEvent: (text) => tui.logRight(text),
        onInfo: (text) => tui.logLeft(text),
      });

      if (!validation.valid) {
        const reason = validation.reason || "Plan failed validation";
        tui.logLeft(`[${auditorName}] plan rejected: ${reason}`, "error");
        continue;
      }

      const pretty = typeof plan === "string" ? plan : JSON.stringify(plan, null, 2);
      tui.logLeft(`[${auditorName}] plan:\n${pretty}`, "success");
    }
  }
}

function isNoopPlan(plan: unknown): plan is NoopPlan {
  return Boolean(plan && typeof plan === "object" && (plan as NoopPlan).noop === true);
}

async function generatePlanForAuditor(args: GeneratePlanArgs): Promise<PlanResult> {
  const { auditorName, auditorPath, config, planFormatter, planSchema } = args;
  const model = resolveModel(config, auditorName);

  try {
    const plan = await buildPlan({
      auditorName,
      auditorPath,
      model,
      planFormatter,
      planSchema,
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
