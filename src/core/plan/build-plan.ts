import path from "path";
import { readTextFile } from "../../utils/fs";
import type { ThreadEvent } from "@openai/codex-sdk";
import type { ReasoningEffort } from "../config-loader";
import {
  combinePrompts,
  combineWithCoreContext,
  createTurnTimeout,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
  parseJsonSafe,
} from "../utils/codex-utils";

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

export type PlanThread = {
  runStreamed: RunStreamed;
  driftlock?: { model: string; reasoning?: ReasoningEffort };
};

export type PlanRevisionContext = {
  previousPlan?: unknown;
  rejectionReason?: string;
};

export type BuildPlanOptions = {
  auditorName: string;
  auditorPath: string;
  planFormatter: string;
  planSchema: unknown;
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  coreContext?: string | null;
  excludePaths?: string[];
  turnTimeoutMs?: number;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
  thread?: PlanThread | null;
  revision?: PlanRevisionContext;
};

export async function buildPlan(
  options: BuildPlanOptions
): Promise<{ plan: unknown; thread: PlanThread | null }> {
  const {
    auditorName,
    auditorPath,
    planFormatter,
    planSchema,
    model,
    reasoning,
    workingDirectory,
    coreContext,
    excludePaths,
    turnTimeoutMs,
    onEvent,
    onInfo,
    thread: providedThread,
    revision,
  } = options;

  const combinedPrompt = await loadCombinedPrompt(
    auditorPath,
    planFormatter,
    coreContext,
    revision,
    excludePaths ?? [],
    workingDirectory
  );
  onInfo?.(
    `[${auditorName}] generating plan with model: ${model}${
      reasoning ? ` (reasoning: ${reasoning})` : ""
    }`
  );

  try {
    const normalizedReasoning = normalizeModelReasoningEffort(model, reasoning);
    let thread: PlanThread | null = providedThread ?? null;
    const shouldStartNewThread =
      !thread ||
      thread.driftlock?.model !== model ||
      thread.driftlock?.reasoning !== normalizedReasoning;

    if (shouldStartNewThread) {
      thread = await startPlanThread(model, normalizedReasoning, workingDirectory);
      thread.driftlock = { model, reasoning: normalizedReasoning };
    }
    if (!thread) {
      throw new Error("Failed to start Codex plan thread.");
    }

    const { latestAgentMessage, finalLogged } = await streamPlanEvents(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      planSchema,
      auditorName,
      turnTimeoutMs,
      onEvent
    );
    const plan = finalizePlan(latestAgentMessage, finalLogged, auditorName, onEvent);
    return { plan, thread };
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[${auditorName}] Codex error: ${message}`);
    throw new Error(message);
  }
}

async function loadCombinedPrompt(
  auditorPath: string,
  planFormatter: string,
  coreContext?: string | null,
  revision?: PlanRevisionContext,
  excludePaths: string[] = [],
  workingDirectory?: string
): Promise<string> {
  const auditorPrompt = await readTextFile(auditorPath);
  const withFormatter = combinePrompts(auditorPrompt, planFormatter);
  const basePrompt = combineWithCoreContext(coreContext ?? null, withFormatter);
  const excludeContext =
    typeof workingDirectory === "string"
      ? buildExcludeContext(excludePaths, workingDirectory)
      : null;
  const basePromptWithExcludes = excludeContext ? `${basePrompt}\n\n${excludeContext}` : basePrompt;
  const revisionContext = buildRevisionContext(revision);
  return revisionContext
    ? `${basePromptWithExcludes}\n\n${revisionContext}`
    : basePromptWithExcludes;
}

async function startPlanThread(
  model: string,
  reasoning: ReasoningEffort | undefined,
  workingDirectory: string
) {
  const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
  const codex = new Codex();
  return codex.startThread({
    model,
    modelReasoningEffort: reasoning,
    workingDirectory,
    sandboxMode: "workspace-write",
    skipGitRepoCheck: true,
  });
}

async function streamPlanEvents(
  runStreamed: RunStreamed,
  prompt: string,
  planSchema: unknown,
  auditorName: string,
  turnTimeoutMs?: number,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<{ latestAgentMessage: string | null; finalLogged: boolean }> {
  const timeout = createTurnTimeout(turnTimeoutMs);
  try {
    const { events } = await runStreamed(prompt, {
      outputSchema: planSchema,
      ...(timeout.signal ? { signal: timeout.signal } : {}),
    });
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
        const parsed = parseJsonSafe(text);
        if (parsed !== undefined) {
          return { latestAgentMessage: text, finalLogged };
        }
      }
    }

    return { latestAgentMessage, finalLogged };
  } catch (error) {
    if (timeout.didTimeout() && timeout.timeoutMs) {
      throw new Error(`Codex turn timed out after ${timeout.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    timeout.clear();
  }
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

function buildRevisionContext(revision?: PlanRevisionContext): string | null {
  if (!revision) return null;

  const payload = JSON.stringify(
    {
      previousPlan: revision.previousPlan ?? null,
      rejectionReason: revision.rejectionReason ?? null,
    },
    null,
    2
  );

  return [
    "PLAN_REVISION_CONTEXT:",
    `<plan_revision_context trust="untrusted">`,
    payload,
    "</plan_revision_context>",
    "Revise the previous plan to address the rejection reason. Do not re-scan the repository unless the reason explicitly requires new evidence.",
  ].join("\n");
}

function buildExcludeContext(excludePaths: string[], workingDirectory: string): string {
  const unique = Array.from(new Set((excludePaths ?? []).filter(Boolean)));
  if (unique.length === 0) {
    return '<excluded_paths>(none)</excluded_paths>';
  }

  const lines = unique.map((absolutePath) => {
    const relative = path.relative(workingDirectory, absolutePath);
    const display =
      relative && !relative.startsWith("..") && !path.isAbsolute(relative)
        ? relative
        : absolutePath;
    return `- ${display}`;
  });

  return [`<excluded_paths>`, ...lines, `</excluded_paths>`].join("\n");
}
