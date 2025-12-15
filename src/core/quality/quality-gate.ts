import { runCommand, type CommandResult } from "../utils/run-commands";

const DEFAULT_TAIL_CHARS = 4000;
const ANSI_REGEX = /\u001b\[[0-9;]*[A-Za-z]/g;

export type QualityGateResult = {
  ok: boolean;
  attempts: number;
  lastStage?: "build" | "test" | "lint";
  stdout?: string;
  stderr?: string;
  code?: number;
  summary?: string;
};

export function checkQualityGateDisabled(args: {
  enableBuild: boolean;
  enableTest: boolean;
  enableLint: boolean;
}): QualityGateResult | null {
  const { enableBuild, enableTest, enableLint } = args;
  const allDisabled = !enableBuild && !enableTest && !enableLint;

  if (!allDisabled) return null;

  return {
    ok: true,
    attempts: 0,
    summary: "Validation disabled (build/lint/test all disabled).",
  };
}

function tail(text: string, maxChars = DEFAULT_TAIL_CHARS): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

function maybePrettyJson(text: string): string {
  const trimmed = text.trim();
  // Try to pretty-print if the whole payload is JSON or newline-delimited JSON.
  const asJsonBlock = (() => {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return null;
    }
  })();
  if (asJsonBlock) return asJsonBlock;

  // Try to pretty-print newline-delimited JSON fragments.
  const lines = trimmed.split(/\r?\n/);
  const parsedLines = lines.map((line) => {
    try {
      return JSON.stringify(JSON.parse(line), null, 2);
    } catch {
      return line;
    }
  });
  return parsedLines.join("\n");
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}

function makeSummary(stage: QualityGateResult["lastStage"], result: CommandResult): string {
  const stdout = tail(maybePrettyJson(stripAnsi(result.stdout || "")));
  const stderr = tail(maybePrettyJson(stripAnsi(result.stderr || "")));
  const lines = [`stage=${stage}`, `code=${result.code}`];
  if (stdout) {
    lines.push("stdout:", stdout);
  }
  if (stderr) {
    lines.push("stderr:", stderr);
  }
  return lines.join("\n");
}

export async function runBuild(
  cmd: string,
  cwd: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<CommandResult> {
  return runCommand(cmd, cwd, { env: { CI: process.env.CI ?? "true" }, onStdout, onStderr });
}

export async function runTest(
  cmd: string,
  cwd: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<CommandResult> {
  return runCommand(cmd, cwd, { env: { CI: process.env.CI ?? "true" }, onStdout, onStderr });
}

export async function runLint(
  cmd: string,
  cwd: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<CommandResult> {
  return runCommand(cmd, cwd, { env: { CI: process.env.CI ?? "true" }, onStdout, onStderr });
}

export function summarizeQualityFailure(
  stage: QualityGateResult["lastStage"],
  result: CommandResult
): string {
  return makeSummary(stage, result);
}
