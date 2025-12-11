import path from "path";
import { readJsonFile, readTextFile } from "../../utils/fs";
import { validateAgainstSchema } from "../../utils/schema-validator";
import {
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
} from "../utils/codex-utils";

export type ValidatePlanOptions = {
  auditorName: string;
  validatorName: string;
  validatorPath: string;
  plan: unknown;
  planSchemaPath: string;
  validateSchemaPath: string;
  model: string;
  workingDirectory: string;
  excludePaths?: string[];
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
};

export type ValidatePlanResult = {
  valid: boolean;
  reason?: string;
};

export async function validatePlan(options: ValidatePlanOptions): Promise<ValidatePlanResult> {
  const {
    auditorName,
    validatorName,
    validatorPath,
    plan,
    planSchemaPath,
    validateSchemaPath,
    model,
    workingDirectory,
    excludePaths = [],
    onEvent,
    onInfo,
  } = options;

  const parsed = parsePlan(plan);
  if (!parsed.ok) {
    return { valid: false, reason: parsed.error };
  }

  const schemaResult = await ensurePlanSchemaValid({
    plan: parsed.value,
    planSchemaPath,
    auditorName,
    validatorName,
    onInfo,
  });
  if (!schemaResult.valid) {
    return schemaResult;
  }

  const exclusionResult = ensureNoExcludedPaths({
    plan: parsed.value,
    excludedPaths: excludePaths,
    workingDirectory,
    auditorName,
    validatorName,
    onInfo,
  });
  if (!exclusionResult.valid) {
    return exclusionResult;
  }

  return runValidator({
    auditorName,
    validatorName,
    validatorPath,
    validateSchemaPath,
    plan: parsed.value,
    model,
    workingDirectory,
    onEvent,
    onInfo,
  });
}

type PlanSchemaContext = {
  plan: unknown;
  planSchemaPath: string;
  auditorName: string;
  validatorName: string;
  onInfo?: (message: string) => void;
};

async function ensurePlanSchemaValid(context: PlanSchemaContext): Promise<ValidatePlanResult> {
  const { plan, planSchemaPath, auditorName, validatorName, onInfo } = context;
  try {
    const planSchema = (await readJsonFile(planSchemaPath)) as unknown;
    validateAgainstSchema(plan, planSchema as any, {
      schemaName: "Plan schema",
    });
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onInfo?.(`[${auditorName}] plan schema validation failed: ${message}`);
    return { valid: false, reason: message };
  }
}

type RunValidatorArgs = {
  auditorName: string;
  validatorName: string;
  validatorPath: string;
  validateSchemaPath: string;
  plan: unknown;
  model: string;
  workingDirectory: string;
  onEvent?: (formatted: string) => void;
  onInfo?: (message: string) => void;
};

async function runValidator(args: RunValidatorArgs): Promise<ValidatePlanResult> {
  const {
    auditorName,
    validatorName,
    validatorPath,
    validateSchemaPath,
    plan,
    model,
    workingDirectory,
    onEvent,
    onInfo,
  } = args;

  try {
    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const validatorPrompt = await readTextFile(validatorPath);
    const validateSchema = (await readJsonFile(validateSchemaPath)) as unknown;
    const codex = new Codex();

    const thread = codex.startThread({
      model,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const combinedPrompt = buildValidationPrompt(validatorPrompt, plan);
    const result = await collectValidationResult(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      validateSchema,
      `${auditorName} → ${validatorName}`,
      onEvent
    );

    if (!result) {
      return { valid: false, reason: "Validator did not return a result." };
    }

    return result;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[${auditorName} → ${validatorName}] validation failed: ${message}`);
    return { valid: false, reason: message };
  }
}

type ExclusionContext = {
  plan: unknown;
  excludedPaths?: string[];
  workingDirectory: string;
  auditorName: string;
  validatorName: string;
  onInfo?: (message: string) => void;
};

function ensureNoExcludedPaths(context: ExclusionContext): ValidatePlanResult {
  const { plan, excludedPaths, workingDirectory, auditorName, validatorName, onInfo } = context;
  if (!excludedPaths || excludedPaths.length === 0) {
    return { valid: true };
  }

  const normalizedExcluded = excludedPaths.map((p) => path.resolve(p));
  const planItems = Array.isArray((plan as { plan?: unknown }).plan)
    ? ((plan as { plan: unknown[] }).plan as unknown[])
    : [];

  const hits: string[] = [];

  for (const item of planItems) {
    const files = (item as { filesInvolved?: unknown }).filesInvolved;
    if (!Array.isArray(files)) continue;

    for (const file of files) {
      if (typeof file !== "string") continue;
      const absoluteFile = path.resolve(workingDirectory, file);
      const touchesExcluded = normalizedExcluded.some(
        (excludedPath) =>
          absoluteFile === excludedPath || absoluteFile.startsWith(`${excludedPath}${path.sep}`)
      );
      if (touchesExcluded) {
        hits.push(file);
      }
    }
  }

  if (hits.length > 0) {
    const uniqueHits = Array.from(new Set(hits));
    const reason = `Plan touches excluded paths: ${uniqueHits.join(", ")}`;
    onInfo?.(`[${auditorName} → ${validatorName}] ${reason}`);
    return { valid: false, reason };
  }

  return { valid: true };
}

function parsePlan(plan: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof plan === "string") {
    try {
      return { ok: true, value: JSON.parse(plan) as unknown };
    } catch (error) {
      return { ok: false, error: `Failed to parse plan JSON: ${(error as Error).message}` };
    }
  }
  if (plan === null || plan === undefined) {
    return { ok: false, error: "Plan is empty." };
  }
  return { ok: true, value: plan };
}

function parseValidationResult(text: string): ValidatePlanResult | null {
  try {
    const parsed = JSON.parse(text) as Partial<ValidatePlanResult>;
    if (typeof parsed.valid === "boolean") {
      return { valid: parsed.valid, reason: parsed.reason };
    }
  } catch {
    // ignore parse errors; continue to next event
  }
  return null;
}

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

async function collectValidationResult(
  runStreamed: RunStreamed,
  prompt: string,
  schema: unknown,
  contextLabel: string,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<ValidatePlanResult | null> {
  const { events } = await runStreamed(prompt, {
    outputSchema: schema,
  });

  let result: ValidatePlanResult | null = null;

  for await (const event of events) {
    const formatted = formatEvent(contextLabel, event);
    if (formatted && onEvent) {
      onEvent(formatted, formatted);
    }

    const text = extractAgentText(event);
    if (text && result === null) {
      const parsed = parseValidationResult(text);
      if (parsed) {
        result = parsed;
      }
    }
  }

  return result;
}

function buildValidationPrompt(validatorPrompt: string, plan: unknown): string {
  return `${validatorPrompt.trim()}\n\nPlan JSON:\n${JSON.stringify(plan, null, 2)}`;
}
