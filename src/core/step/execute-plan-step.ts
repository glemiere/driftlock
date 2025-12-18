import path from "path";
import { readJsonFile, readTextFile } from "../../utils/fs";
import type { ReasoningEffort } from "../config-loader";
import {
  combinePrompts,
  combineWithCoreContext,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
  parseJsonSafe,
} from "../utils/codex-utils";

type StepMode = "apply" | "fix_regression";
export type ExecutorThread = {
  runStreamed: RunStreamed;
  driftlock?: { model: string; reasoning?: ReasoningEffort };
};

export type ExecutePlanStepOptions = {
  stepText: string;
  mode: StepMode;
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  coreContext?: string | null;
  excludePaths?: string[];
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
  thread?: ExecutorThread | null;
};

export type ExecutePlanStepResult = {
  success: boolean;
  summary: string;
  details?: string;
  filesTouched?: string[];
  filesWritten?: string[];
  patch?: string;
  mode: StepMode;
};

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

export async function executePlanStep(
  options: ExecutePlanStepOptions
): Promise<{
  result: ExecutePlanStepResult | undefined;
  agentMessage: string | null;
  thread: ExecutorThread | null;
}> {
  const {
    stepText,
    mode,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    excludePaths = [],
    coreContext,
    onEvent,
    onInfo,
    thread: providedThread,
  } = options;

  const formatter = await readTextFile(formatterPath);
  const outputSchema = (await readJsonFile(schemaPath)) as unknown;
  const basePrompt = combinePrompts(buildStepPrompt(stepText, mode), formatter);
  const combinedPrompt = combineWithCoreContext(coreContext ?? null, basePrompt);

  const normalizedReasoning = normalizeModelReasoningEffort(model, reasoning);

  onInfo?.(
    `[execute-step] running executor in mode="${mode}" with model: ${model}${
      normalizedReasoning ? ` (reasoning: ${normalizedReasoning})` : ""
    }`
  );

  let latestAgentMessage: string | null = null;
  let parsed: ExecutePlanStepResult | undefined;

  let thread: ExecutorThread | null = providedThread ?? null;

  try {
    const shouldStartNewThread =
      !thread ||
      thread.driftlock?.model !== model ||
      thread.driftlock?.reasoning !== normalizedReasoning;

    if (shouldStartNewThread) {
      const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>(
        "@openai/codex-sdk"
      );
      const codex = new Codex();
      thread = codex.startThread({
        model,
        modelReasoningEffort: normalizedReasoning,
        workingDirectory,
        sandboxMode: "workspace-write",
        skipGitRepoCheck: true,
      }) as unknown as ExecutorThread;
      thread.driftlock = { model, reasoning: normalizedReasoning };
    }

    if (!thread) {
      throw new Error("Failed to start Codex thread.");
    }

    const streamed = await streamExecutorEvents(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      outputSchema,
      mode,
      onEvent
    );

    latestAgentMessage = streamed.latestAgentMessage;
    parsed = parseJsonSafe(latestAgentMessage) as ExecutePlanStepResult | undefined;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[execute-step] Codex error: ${message}`);
    return { result: undefined, agentMessage: null, thread };
  }

  if (parsed) {
    enforceExcludes(parsed, workingDirectory, excludePaths);
  }

  return { result: parsed, agentMessage: latestAgentMessage, thread };
}

function buildStepPrompt(stepText: string, mode: StepMode): string {
  return `${stepText.trim()}\n\nMODE: ${mode}`;
}

async function streamExecutorEvents(
  runStreamed: RunStreamed,
  prompt: string,
  outputSchema: unknown,
  mode: StepMode,
  onEvent?: (formatted: string, colorKey?: string) => void
): Promise<{ latestAgentMessage: string | null }> {
  const { events } = await runStreamed(prompt, { outputSchema });
  let latestAgentMessage: string | null = null;

  for await (const event of events) {
    const formatted = formatEvent(`execute-step:${mode}`, event);
    if (formatted && onEvent) {
      onEvent(formatted);
    }

    const text = extractAgentText(event);
    if (text) {
      latestAgentMessage = text;
    }
  }

  return { latestAgentMessage };
}

function enforceExcludes(
  result: ExecutePlanStepResult,
  workingDirectory: string,
  excludePaths: string[]
): void {
  if (!excludePaths || excludePaths.length === 0) return;

  const normalizedExcluded = excludePaths.map((p) => path.resolve(p));
  const filesFromResult = new Set<string>();

  const gather = (files?: string[]) => {
    if (!files) return;
    for (const file of files) {
      if (typeof file === "string") {
        filesFromResult.add(file);
      }
    }
  };

  gather(result.filesTouched);
  gather(result.filesWritten);
  gather(extractFilesFromPatch(result.patch));

  for (const file of filesFromResult) {
    const absolute = path.resolve(workingDirectory, file);
    const hitsExcluded = normalizedExcluded.some(
      (excludedPath) =>
        absolute === excludedPath || absolute.startsWith(`${excludedPath}${path.sep}`)
    );
    if (hitsExcluded) {
      throw new Error(`Executor output touches excluded path: ${file}`);
    }
  }
}

function extractFilesFromPatch(patch?: string): string[] {
  if (!patch || typeof patch !== "string") return [];
  const files = new Set<string>();
  const lines = patch.split("\n");
  for (const line of lines) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const filePart = parts[1];
        if (filePart === "/dev/null") continue;
        const normalized = filePart.replace(/^a\//, "").replace(/^b\//, "");
        files.add(normalized);
      }
    }
  }
  return Array.from(files);
}
