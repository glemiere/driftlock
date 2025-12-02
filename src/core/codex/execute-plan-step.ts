import path from "path";
import { readJsonFile, readTextFile } from "../../utils/fs";
import {
  combinePrompts,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  parseJsonSafe,
} from "./utils";

type StepMode = "apply" | "fix_regression";

export type ExecutePlanStepOptions = {
  stepText: string;
  mode: StepMode;
  model: string;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  excludePaths?: string[];
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
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
): Promise<{ result: ExecutePlanStepResult | undefined; agentMessage: string | null }> {
  const {
    stepText,
    mode,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    excludePaths = [],
    onEvent,
    onInfo,
  } = options;

  const formatter = await readTextFile(formatterPath);
  const outputSchema = (await readJsonFile(schemaPath)) as unknown;
  const combinedPrompt = combinePrompts(buildStepPrompt(stepText, mode), formatter);

  onInfo?.(`[execute-step] running executor in mode="${mode}" with model: ${model}`);

  try {
    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const codex = new Codex();
    const thread = codex.startThread({
      model,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const { latestAgentMessage } = await streamExecutorEvents(
      thread.runStreamed.bind(thread),
      combinedPrompt,
      outputSchema,
      mode,
      onEvent
    );

    const parsed = parseJsonSafe(latestAgentMessage) as ExecutePlanStepResult | undefined;
    if (parsed) {
      enforceExcludes(parsed, workingDirectory, excludePaths);
    }

    return { result: parsed, agentMessage: latestAgentMessage };
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[execute-step] Codex error: ${message}`);
    throw new Error(message);
  }
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

