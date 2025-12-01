import type { AgentMessageItem, CommandExecutionItem, ThreadEvent, ThreadItem } from "@openai/codex-sdk";
import { readJsonFile, readTextFile } from "../utils/fs";
import { validateAgainstSchema } from "../utils/schema-validator";

type BuildPlanOptions = {
  auditorName: string;
  auditorPath: string;
  planFormatter: string;
  planSchema: unknown;
  model: string;
  workingDirectory: string;
  onEvent?: (formatted: string) => void;
  onInfo?: (message: string) => void;
};

type ValidatePlanOptions = {
  auditorName: string;
  validatorName: string;
  validatorPath: string;
  plan: unknown;
  planSchemaPath: string;
  validateSchemaPath: string;
  model: string;
  workingDirectory: string;
  onEvent?: (formatted: string) => void;
  onInfo?: (message: string) => void;
};

type ValidatePlanResult = {
  valid: boolean;
  reason?: string;
};

export async function buildPlan(options: BuildPlanOptions): Promise<unknown> {
  const {
    auditorName,
    auditorPath,
    planFormatter,
    planSchema,
    model,
    workingDirectory,
    onEvent,
    onInfo,
  } = options;
  const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
  const auditorPrompt = await readTextFile(auditorPath);
  const combinedPrompt = combinePrompts(auditorPrompt, planFormatter);

  onInfo?.(`[${auditorName}] generating plan with model: ${model}`);

  try {
    const codex = new Codex();
    const thread = codex.startThread({
      model,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const { events } = await thread.runStreamed(combinedPrompt, {
      outputSchema: planSchema,
    });

    let latestAgentMessage: string | null = null;

    for await (const event of events) {
      const formatted = formatEvent(auditorName, event);
      if (formatted && onEvent) {
        onEvent(formatted);
      }

      const text = extractAgentText(event);
      if (text) {
        latestAgentMessage = text;
      }
    }

    if (latestAgentMessage) {
      onEvent?.(`[${auditorName}] final response:\n${latestAgentMessage}`);
    }

    const parsed = parseJsonSafe(latestAgentMessage);
    return parsed ?? latestAgentMessage;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[${auditorName}] Codex error: ${message}`);
    throw new Error(message);
  }
}

function combinePrompts(auditorPrompt: string, formatter: string): string {
  const parts = [auditorPrompt.trim(), formatter.trim()].filter(Boolean);
  return parts.join("\n\n");
}

function formatEvent(auditorName: string, event: ThreadEvent): string {
  switch (event.type) {
    case "thread.started":
    case "turn.started":
      return `[${auditorName}]`;
    case "turn.completed":
      return `[${auditorName}] (in:${event.usage.input_tokens}, out:${event.usage.output_tokens})`;
    case "turn.failed":
      return `[${auditorName}]: ${event.error.message}`;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return formatItemEvent(auditorName, event.item, event.type);
    case "error":
      return `[${auditorName}] stream error: ${event.message}`;
    default:
      return assertUnreachable(event);
  }
}

function formatItemEvent(
  auditorName: string,
  item: ThreadItem,
  phase: "item.started" | "item.updated" | "item.completed"
): string {
  const prefix = `[${auditorName}] ${item.type}`;

  switch (item.type) {
    case "agent_message":
      return item.text ? `${prefix}: ${item.text}` : prefix;
    case "reasoning":
      return item.text ? `${prefix}: ${item.text}` : prefix;
    case "command_execution":
      return formatCommand(prefix, item);
    case "file_change":
      return `${prefix}: ${item.changes.map((c) => `${c.kind}:${c.path}`).join(", ")}`;
    case "mcp_tool_call":
      return `${prefix}: ${item.server}.${item.tool}`;
    case "web_search":
      return `${prefix}: ${item.query}`;
    case "todo_list":
      return `${prefix}: ${item.items.length} todos`;
    case "error":
      return `${prefix}: ${item.message}`;
    default:
      return prefix;
  }
}

function extractAgentText(event: ThreadEvent): string | null {
  if (event.type !== "item.completed" && event.type !== "item.updated") {
    return null;
  }

  const item = event.item;
  if (isAgentMessage(item) && typeof item.text === "string") {
    return item.text;
  }

  return null;
}

function isAgentMessage(item: ThreadItem): item is AgentMessageItem {
  return item.type === "agent_message";
}

function formatCommand(prefix: string, item: CommandExecutionItem): string {
  const status = item.status ? ` [${item.status}]` : "";
  const command = item.command ? ` ${item.command}` : "";
  return `${prefix}${status}:${command}`.trim();
}

function assertUnreachable(x: never): never {
  throw new Error(`Unhandled event: ${JSON.stringify(x)}`);
}

const dynamicImport: <T>(specifier: string) => Promise<T> = (specifier) =>
  new Function("specifier", "return import(specifier);")(specifier);

function formatCodexError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("Codex Exec exited with code")) {
    return `${raw}. Check that the Codex binary can run (node_modules/.bin/codex), CODEX_API_KEY is set, and the working directory is valid.`;
  }
  return raw;
}

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
    onEvent,
    onInfo,
  } = options;

  const parsedPlan = parsePlan(plan);
  if (!parsedPlan.ok) {
    return { valid: false, reason: parsedPlan.error };
  }

  try {
    const planSchema = (await readJsonFile(planSchemaPath)) as unknown;
    validateAgainstSchema(parsedPlan.value, planSchema as any, {
      schemaName: "Plan schema",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onInfo?.(`[${auditorName} → ${validatorName}] plan schema validation failed: ${message}`);
    return { valid: false, reason: message };
  }

  const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
  const validatorPrompt = await readTextFile(validatorPath);
  const validateSchema = (await readJsonFile(validateSchemaPath)) as unknown;
  const codex = new Codex();

  try {
    const thread = codex.startThread({
      model,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const combinedPrompt = `${validatorPrompt.trim()}\n\nPlan JSON:\n${JSON.stringify(
      parsedPlan.value,
      null,
      2
    )}`;

    const { events } = await thread.runStreamed(combinedPrompt, {
      outputSchema: validateSchema,
    });

    let result: ValidatePlanResult | null = null;

    for await (const event of events) {
      const formatted = formatEvent(`${auditorName} → ${validatorName}`, event);
      if (formatted && onEvent) {
        onEvent(formatted);
      }

      const text = extractAgentText(event);
      if (text && result === null) {
        const parsed = parseValidationResult(text);
        if (parsed) {
          result = parsed;
        }
      }
    }

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

function parseJsonSafe(text: string | null): unknown | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
