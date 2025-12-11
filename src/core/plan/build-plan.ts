import { readTextFile } from "../../utils/fs";
import type { ThreadEvent } from "@openai/codex-sdk";
import {
  combinePrompts,
  combineWithCoreContext,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  parseJsonSafe,
} from "../utils/codex-utils";

export type BuildPlanOptions = {
  auditorName: string;
  auditorPath: string;
  planFormatter: string;
  planSchema: unknown;
  model: string;
  workingDirectory: string;
  coreContext?: string | null;
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
    coreContext,
    onEvent,
    onInfo,
  } = options;

  const combinedPrompt = await loadCombinedPrompt(auditorPath, planFormatter, coreContext);
  onInfo?.(`[${auditorName}] generating plan with model: ${model}`);

  try {
    const thread = await startPlanThread(model, workingDirectory);
    const { latestAgentMessage, finalLogged } = await streamPlanEvents(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      planSchema,
      auditorName,
      onEvent
    );
    return finalizePlan(latestAgentMessage, finalLogged, auditorName, onEvent);
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[${auditorName}] Codex error: ${message}`);
    throw new Error(message);
  }
}

async function loadCombinedPrompt(
  auditorPath: string,
  planFormatter: string,
  coreContext?: string | null
): Promise<string> {
  const auditorPrompt = await readTextFile(auditorPath);
  const withFormatter = combinePrompts(auditorPrompt, planFormatter);
  return combineWithCoreContext(coreContext ?? null, withFormatter);
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
): Promise<{ latestAgentMessage: string | null; finalLogged: boolean }> {
  const { events } = await runStreamed(prompt, { outputSchema: planSchema });
  let latestAgentMessage: string | null = null;
  let finalLogged = false;

  for await (const event of events as AsyncGenerator<ThreadEvent>) {
    const formatted = formatEvent(auditorName, event);
    if (formatted && onEvent) {
      onEvent(formatted);
    }

    const text = extractAgentText(event);
    if (text) {
      latestAgentMessage = text;
      if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalLogged = true;
      }
    }
  }

  return { latestAgentMessage, finalLogged };
}

function finalizePlan(
  latestAgentMessage: string | null,
  finalLogged: boolean,
  auditorName: string,
  onEvent?: (formatted: string, colorKey?: string) => void
): unknown {
  if (latestAgentMessage && !finalLogged) {
    onEvent?.(`[${auditorName}] FINAL RESPONSE:\n${latestAgentMessage}`, "success");
  }

  const parsed = parseJsonSafe(latestAgentMessage);
  return parsed ?? latestAgentMessage;
}
