import { readJsonFile, readTextFile } from "../../utils/fs";
import type { ReasoningEffort } from "../config-loader";
import {
  combineWithCoreContext,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
} from "../utils/codex-utils";

export type ValidateExecuteStepOptions = {
  stepDescription: string;
  executorResult: unknown;
  validatorPath: string;
  validateSchemaPath: string;
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  coreContext?: string | null;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
};

export type ValidateExecuteStepResult = {
  valid: boolean;
  reason?: string;
};

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

export async function validateExecuteStep(
  options: ValidateExecuteStepOptions
): Promise<ValidateExecuteStepResult> {
  const {
    stepDescription,
    executorResult,
    validatorPath,
    validateSchemaPath,
    model,
    reasoning,
    workingDirectory,
    coreContext,
    onEvent,
    onInfo,
  } = options;

  try {
    const validatorPrompt = await readTextFile(validatorPath);
    const validateSchema = (await readJsonFile(validateSchemaPath)) as unknown;
    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const codex = new Codex();

    const thread = codex.startThread({
      model,
      modelReasoningEffort: normalizeModelReasoningEffort(model, reasoning),
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const combinedPrompt = combineWithCoreContext(
      coreContext ?? null,
      buildValidationPrompt({
        validatorPrompt,
        stepDescription,
        executorResult,
      })
    );

    const result = await collectValidationResult(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      validateSchema,
      "execute-step-validator",
      onEvent
    );

    if (!result) {
      return { valid: false, reason: "Validator did not return a result." };
    }

    return result;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[execute-step-validator] validation failed: ${message}`);
    return { valid: false, reason: message };
  }
}

function buildValidationPrompt(context: {
  validatorPrompt: string;
  stepDescription: string;
  executorResult: unknown;
}): string {
  const { validatorPrompt, stepDescription, executorResult } = context;

  return `${validatorPrompt.trim()}\n\nStep Description:\n${stepDescription}\n\nExecutor Result JSON:\n${JSON.stringify(
    executorResult,
    null,
    2
  )}`;
}

async function collectValidationResult(
  runStreamed: RunStreamed,
  prompt: string,
  schema: unknown,
  contextLabel: string,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<ValidateExecuteStepResult | null> {
  const { events } = await runStreamed(prompt, {
    outputSchema: schema,
  });

  let result: ValidateExecuteStepResult | null = null;

  for await (const event of events) {
    const formatted = formatEvent(contextLabel, event);
    if (formatted && onEvent) {
      onEvent(formatted, formatted);
    }

    const text = extractAgentText(event);
    if (text && result === null) {
      try {
        const parsed = JSON.parse(text) as Partial<ValidateExecuteStepResult>;
        if (typeof parsed.valid === "boolean") {
          result = { valid: parsed.valid, reason: parsed.reason };
        }
      } catch {
        // ignore parse errors; continue to next event
      }
    }
  }

  return result;
}
