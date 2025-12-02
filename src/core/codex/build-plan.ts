import { readTextFile } from "../../utils/fs";
import type { ThreadEvent } from "@openai/codex-sdk";
import {
  combinePrompts,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  parseJsonSafe,
} from "./utils";

export type BuildPlanOptions = {
  auditorName: string;
  auditorPath: string;
  planFormatter: string;
  planSchema: unknown;
  model: string;
  workingDirectory: string;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
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

  const combinedPrompt = await loadCombinedPrompt(auditorPath, planFormatter);
  onInfo?.(`[${auditorName}] generating plan with model: ${model}`);

  try {
    const thread = await startPlanThread(model, workingDirectory);
    const latestAgentMessage = await streamPlanEvents(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      planSchema,
      auditorName,
      onEvent
    );
    return finalizePlan(latestAgentMessage, auditorName, onEvent);
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[${auditorName}] Codex error: ${message}`);
    throw new Error(message);
  }
}

async function loadCombinedPrompt(auditorPath: string, planFormatter: string): Promise<string> {
  const auditorPrompt = await readTextFile(auditorPath);
  return combinePrompts(auditorPrompt, planFormatter);
}

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

async function startPlanThread(model: string, workingDirectory: string) {
  const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
  const codex = new Codex();
  return codex.startThread({
    model,
    workingDirectory,
    skipGitRepoCheck: true,
  });
}

async function streamPlanEvents(
  runStreamed: RunStreamed,
  prompt: string,
  planSchema: unknown,
  auditorName: string,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<string | null> {
  const { events } = await runStreamed(prompt, { outputSchema: planSchema });
  let latestAgentMessage: string | null = null;

  for await (const event of events as AsyncGenerator<ThreadEvent>) {
    const formatted = formatEvent(auditorName, event);
    if (formatted && onEvent) {
      onEvent(formatted, formatted);
    }

    const text = extractAgentText(event);
    if (text) {
      latestAgentMessage = text;
    }
  }

  return latestAgentMessage;
}

function finalizePlan(
  latestAgentMessage: string | null,
  auditorName: string,
  onEvent?: (formatted: string) => void
): unknown {
  if (latestAgentMessage) {
    onEvent?.(`[${auditorName}] final response:\n${latestAgentMessage}`);
  }

  const parsed = parseJsonSafe(latestAgentMessage);
  return parsed ?? latestAgentMessage;
}
