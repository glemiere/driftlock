import { readJsonFile, readTextFile } from "../../utils/fs";
import type { ReasoningEffort } from "../config-loader";
import {
  combineWithCoreContext,
  createTurnTimeout,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
} from "../utils/codex-utils";

export type ValidateStepOptions = {
  stepDescription: string;
  executorResult: unknown;
  codeSnapshots?: Record<string, string>;
  validatorPath: string;
  validateSchemaPath: string;
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  coreContext?: string | null;
  turnTimeoutMs?: number;
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
    codeSnapshots = {},
    validatorPath,
    validateSchemaPath,
    model,
    reasoning,
    workingDirectory,
    coreContext,
    turnTimeoutMs,
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
      sandboxMode: "workspace-write",
      skipGitRepoCheck: true,
    });

    const combinedPrompt = combineWithCoreContext(
      coreContext ?? null,
      buildValidationPrompt({
        validatorPrompt,
        stepDescription,
        executorResult,
        codeSnapshots,
      })
    );

    const result = await collectValidationResult(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      validateSchema,
      "step-validator",
      turnTimeoutMs,
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
  codeSnapshots: Record<string, string>;
}): string {
  const { validatorPrompt, stepDescription, executorResult, codeSnapshots } = context;
  const snapshotText = Object.entries(codeSnapshots)
    .map(([file, content]) => `FILE: ${file}\n${content}`)
    .join("\n\n");

  return `${validatorPrompt.trim()}\n\nStep Description:\n<step_description trust="untrusted">\n${stepDescription}\n</step_description>\n\nExecutor Result JSON:\n<executor_result_json trust="untrusted">\n${JSON.stringify(
    executorResult,
    null,
    2
  )}\n</executor_result_json>\n\nCode Snapshots:\n<code_snapshots trust="untrusted">\n${
    snapshotText || "<none>"
  }\n</code_snapshots>`;
}

async function collectValidationResult(
  runStreamed: RunStreamed,
  prompt: string,
  schema: unknown,
  contextLabel: string,
  turnTimeoutMs?: number,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<ValidateStepResult | null> {
  const timeout = createTurnTimeout(turnTimeoutMs);
  try {
    const { events } = await runStreamed(prompt, {
      outputSchema: schema,
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });

    for await (const event of events) {
      const formatted = formatEvent(contextLabel, event);
      if (formatted && onEvent) {
        onEvent(formatted, formatted);
      }

      const text = extractAgentText(event);
      if (text) {
        try {
          const parsed = JSON.parse(text) as Partial<ValidateStepResult>;
          if (typeof parsed.valid === "boolean") {
            return { valid: parsed.valid, reason: parsed.reason };
          }
        } catch {
          // ignore parse errors; continue to next event
        }
      }
    }
    return null;
  } catch (error) {
    if (timeout.didTimeout() && timeout.timeoutMs) {
      throw new Error(`Codex turn timed out after ${timeout.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    timeout.clear();
  }
}
