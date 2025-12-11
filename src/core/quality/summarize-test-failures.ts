import { dynamicImport, extractAgentText, formatCodexError, formatEvent } from "../utils/codex-utils";
import { readJsonFile, readTextFile } from "../../utils/fs";

type RunStreamed = typeof import("@openai/codex-sdk").Thread.prototype.runStreamed;

export type TestFailureSummary = {
  summary: string;
  failingTests?: string[];
  failingFiles?: string[];
  failureMessages?: string[];
  rawSnippets?: string[];
};

export async function summarizeTestFailures(options: {
  stdout: string;
  stderr: string;
  model: string;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
}): Promise<TestFailureSummary | null> {
  const {
    stdout,
    stderr,
    model,
    workingDirectory,
    formatterPath,
    schemaPath,
    onEvent,
    onInfo,
  } = options;

  try {
    const formatter = await readTextFile(formatterPath);
    const schema = (await readJsonFile(schemaPath)) as unknown;
    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const codex = new Codex();
    const thread = codex.startThread({
      model,
      workingDirectory,
      skipGitRepoCheck: true,
    });

    const prompt = buildPrompt({ formatter, stdout, stderr });

    const { events } = await thread.runStreamed(prompt, { outputSchema: schema });
    let latest: TestFailureSummary | null = null;

    for await (const event of events) {
      const formatted = formatEvent("test-failure-condenser", event);
      if (formatted && onEvent) {
        onEvent(formatted);
      }

      const text = extractAgentText(event);
      if (text) {
        try {
          const parsed = JSON.parse(text) as Partial<TestFailureSummary>;
          if (typeof parsed.summary === "string") {
            latest = {
              summary: parsed.summary,
              failingTests: parsed.failingTests,
              failingFiles: parsed.failingFiles,
              failureMessages: parsed.failureMessages,
              rawSnippets: parsed.rawSnippets,
            };
          }
        } catch {
          // ignore parse errors; keep streaming
        }
      }
    }

    return latest;
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[test-failure-condenser] Codex error: ${message}`);
    return null;
  }
}

function buildPrompt(args: {
  formatter: string;
  stdout: string;
  stderr: string;
}): string {
  const { formatter, stdout, stderr } = args;
  const source = `Raw Test Output (stdout):\n${stdout || "<empty>"}\n\nRaw Test Output (stderr):\n${
    stderr || "<empty>"
  }`;
  return `${formatter.trim()}\n\n${source}`;
}
