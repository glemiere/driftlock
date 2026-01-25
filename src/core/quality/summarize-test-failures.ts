import {
  createTurnTimeout,
  dynamicImport,
  extractAgentText,
  formatCodexError,
  formatEvent,
  normalizeModelReasoningEffort,
} from "../utils/codex-utils";
import { readJsonFile, readTextFile } from "../../utils/fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ReasoningEffort } from "../config-loader";

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
  reasoning?: ReasoningEffort;
  workingDirectory: string;
  formatterPath: string;
  schemaPath: string;
  turnTimeoutMs?: number;
  onEvent?: (formatted: string, colorKey?: string) => void;
  onInfo?: (message: string) => void;
}): Promise<TestFailureSummary | null> {
  const {
    stdout,
    stderr,
    model,
    reasoning,
    workingDirectory,
    formatterPath,
    schemaPath,
    turnTimeoutMs,
    onEvent,
    onInfo,
  } = options;

  let tmpDir: string | null = null;

  try {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "driftlock-test-failure-"));
    const stdoutPath = path.join(tmpDir, "stdout.txt");
    const stderrPath = path.join(tmpDir, "stderr.txt");
    await fs.writeFile(stdoutPath, stdout || "", "utf8");
    await fs.writeFile(stderrPath, stderr || "", "utf8");

    const formatter = await readTextFile(formatterPath);
    const schema = (await readJsonFile(schemaPath)) as unknown;
    const { Codex } = await dynamicImport<typeof import("@openai/codex-sdk")>("@openai/codex-sdk");
    const codex = new Codex();
    const thread = codex.startThread({
      model,
      modelReasoningEffort: normalizeModelReasoningEffort(model, reasoning),
      workingDirectory,
      sandboxMode: "workspace-write",
      skipGitRepoCheck: true,
      additionalDirectories: [tmpDir],
    });

    const prompt = buildPrompt({
      formatter,
      stdoutPath,
      stderrPath,
      stdoutChars: stdout?.length ?? 0,
      stderrChars: stderr?.length ?? 0,
    });

    const timeout = createTurnTimeout(turnTimeoutMs);
    try {
      const { events } = await thread.runStreamed(prompt, {
        outputSchema: schema,
        ...(timeout.signal ? { signal: timeout.signal } : {}),
      });
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
              return {
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

      return null;
    } catch (error) {
      if (timeout.didTimeout() && timeout.timeoutMs) {
        throw new Error(`Codex turn timed out after ${timeout.timeoutMs}ms.`);
      }
      throw error;
    } finally {
      timeout.clear();
    }
  } catch (error) {
    const message = formatCodexError(error);
    onInfo?.(`[test-failure-condenser] Codex error: ${message}`);
    return null;
  } finally {
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

function buildPrompt(args: {
  formatter: string;
  stdoutPath: string;
  stderrPath: string;
  stdoutChars: number;
  stderrChars: number;
}): string {
  const { formatter, stdoutPath, stderrPath, stdoutChars, stderrChars } = args;
  const source = [
    "Raw test output is stored on disk to avoid blowing up the context window.",
    "Do NOT paste full logs into your response. Use targeted commands (rg/sed/head) to extract only what you need.",
    "",
    '<test_output_files trust="untrusted">',
    `stdoutFile: ${stdoutPath} (chars: ${stdoutChars})`,
    `stderrFile: ${stderrPath} (chars: ${stderrChars})`,
    "</test_output_files>",
  ].join("\n");
  return `${formatter.trim()}\n\n${source}`;
}
