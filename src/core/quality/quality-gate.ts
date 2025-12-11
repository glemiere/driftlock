import { runCommand, type CommandResult } from "../utils/run-commands";

const DEFAULT_TAIL_CHARS = 4000;

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
    summary: "Validation disabled (build/test/lint all disabled).",
  };
}

function tail(text: string, maxChars = DEFAULT_TAIL_CHARS): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

function makeSummary(stage: QualityGateResult["lastStage"], result: CommandResult): string {
  const stdout = tail(result.stdout || "");
  const stderr = tail(result.stderr || "");
  const parts = [
    `stage=${stage}`,
    `code=${result.code}`,
    stdout ? `stdout=${JSON.stringify(stdout)}` : null,
    stderr ? `stderr=${JSON.stringify(stderr)}` : null,
  ].filter(Boolean) as string[];

  return parts.join(" | ");
}

export async function runBuild(cmd: string, cwd: string): Promise<CommandResult> {
  return runCommand(cmd, cwd);
}

export async function runTest(cmd: string, cwd: string): Promise<CommandResult> {
  return runCommand(cmd, cwd);
}

export async function runLint(cmd: string, cwd: string): Promise<CommandResult> {
  return runCommand(cmd, cwd);
}

export function summarizeQualityFailure(
  stage: QualityGateResult["lastStage"],
  result: CommandResult
): string {
  return makeSummary(stage, result);
}
