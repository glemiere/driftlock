import { readJsonFile, readTextFile } from "../../utils/fs";
import type { ReasoningEffort } from "../config-loader";
import {
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
  parseJsonSafe,
} from "../utils/codex-utils";

export type PullRequestPlanSummary = {
  auditorName: string;
  planName: string | null;
  commitMessage: string;
  actions: string[];
};

export type PullRequestSummary = {
  title: string;
  body: string;
};

export async function summarizePullRequest(options: {
  model: string;
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  branch?: string;
  baseBranch?: string;
  committedPlans: PullRequestPlanSummary[];
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
}): Promise<PullRequestSummary | null> {
  const {
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    branch,
    baseBranch,
    committedPlans,
    onEvent,
    onInfo,
  } = options;

  try {
    const formatter = await readTextFile(formatterPath);
    const schema = (await readJsonFile(schemaPath)) as unknown;

    onInfo?.(
      `[pull-request] generating PR summary with model: ${model}${
        reasoning ? ` (reasoning: ${reasoning})` : ""
      }`
    );

    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const codex = new Codex();
    const thread = codex.startThread({
      model,
      modelReasoningEffort: normalizeModelReasoningEffort(model, reasoning),
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const prompt = buildPrompt({
      formatter,
      branch,
      baseBranch,
      committedPlans,
    });

    const { events } = await thread.runStreamed(prompt, { outputSchema: schema });
    let latest: PullRequestSummary | null = null;

    for await (const event of events) {
      const formatted = formatEvent("pull-request", event);
      if (formatted && onEvent) {
        onEvent(formatted);
      }

      const text = extractAgentText(event);
      if (!text) continue;
      const parsed = parseJsonSafe(text);
      if (!parsed || typeof parsed !== "object") continue;

      const obj = parsed as Partial<PullRequestSummary>;
      if (typeof obj.title === "string" && typeof obj.body === "string") {
        latest = { title: obj.title, body: obj.body };
      }
    }

    return latest;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[pull-request] Codex error: ${message}`);
    return null;
  }
}

function buildPrompt(args: {
  formatter: string;
  branch?: string;
  baseBranch?: string;
  committedPlans: PullRequestPlanSummary[];
}): string {
  const { formatter, branch, baseBranch, committedPlans } = args;
  const payload = JSON.stringify(
    {
      branch: branch ?? null,
      baseBranch: baseBranch ?? null,
      committedPlans,
    },
    null,
    2
  );
  return `${formatter.trim()}\n\nRUN_SUMMARY_JSON:\n${payload}`;
}
