import { readJsonFile, readTextFile } from "../../utils/fs";
import { dynamicImport, extractAgentText, formatCodexError, formatEvent } from "./utils";

export type ValidateStepOptions = {
  stepDescription: string;
  executorResult: unknown;
  allowedFiles: string[];
  codeSnapshots?: Record<string, string>;
  validatorPath: string;
  validateSchemaPath: string;
  model: string;
  workingDirectory: string;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
};

export type ValidateStepResult = {
  valid: boolean;
  reason?: string;
};

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

export async function validateStep(options: ValidateStepOptions): Promise<ValidateStepResult> {
  const {
    stepDescription,
    executorResult,
    allowedFiles,
    codeSnapshots = {},
    validatorPath,
    validateSchemaPath,
    model,
    workingDirectory,
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
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const combinedPrompt = buildValidationPrompt({
      validatorPrompt,
      stepDescription,
      executorResult,
      allowedFiles,
      codeSnapshots,
    });

    const result = await collectValidationResult(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      validateSchema,
      "step-validator",
      onEvent
    );

    if (!result) {
      return { valid: false, reason: "Validator did not return a result." };
    }

    return result;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[step-validator] validation failed: ${message}`);
    return { valid: false, reason: message };
  }
}

function buildValidationPrompt(context: {
  validatorPrompt: string;
  stepDescription: string;
  executorResult: unknown;
  allowedFiles: string[];
  codeSnapshots: Record<string, string>;
}): string {
  const { validatorPrompt, stepDescription, executorResult, allowedFiles, codeSnapshots } = context;
  const snapshotText = Object.entries(codeSnapshots)
    .map(([file, content]) => `FILE: ${file}\n${content}`)
    .join("\n\n");

  return `${validatorPrompt.trim()}\n\nStep Description:\n${stepDescription}\n\nExecutor Result JSON:\n${JSON.stringify(
    executorResult,
    null,
    2
  )}\n\nAllowed Files:\n${allowedFiles.join("\n")}\n\nCode Snapshots:\n${snapshotText || "<none>"}`;
}

async function collectValidationResult(
  runStreamed: RunStreamed,
  prompt: string,
  schema: unknown,
  contextLabel: string,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<ValidateStepResult | null> {
  const { events } = await runStreamed(prompt, {
    outputSchema: schema,
  });

  let result: ValidateStepResult | null = null;

  for await (const event of events) {
    const formatted = formatEvent(contextLabel, event);
    if (formatted && onEvent) {
      onEvent(formatted, formatted);
    }

    const text = extractAgentText(event);
    if (text && result === null) {
      try {
        const parsed = JSON.parse(text) as Partial<ValidateStepResult>;
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
