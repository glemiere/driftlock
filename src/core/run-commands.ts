import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number;
};

export type ValidationLoopResult = {
  ok: boolean;
  attempts: number;
  lastStage?: "build" | "test" | "lint";
  stdout?: string;
  stderr?: string;
  code?: number;
  summary?: string;
};

export type ValidationLoopArgs = {
  enableBuild: boolean;
  enableTest: boolean;
  enableLint: boolean;
  buildCmd: string;
  testCmd: string;
  lintCmd: string;
  maxRetries: number;
  cwd: string;
};

const DEFAULT_TAIL_CHARS = 4000;

function tail(text: string, maxChars = DEFAULT_TAIL_CHARS): string {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.slice(-maxChars);
}

async function runSingleCommand(cmd: string, cwd: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number; signal?: string };
    const code = typeof execError.code === "number" ? execError.code : 1;
    return {
      ok: false,
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      code,
    };
  }
}

export async function runCommand(cmd: string, cwd: string): Promise<CommandResult> {
  return runSingleCommand(cmd, cwd);
}

function makeSummary(stage: ValidationLoopResult["lastStage"], result: CommandResult): string {
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

export async function runValidationLoop(args: ValidationLoopArgs): Promise<ValidationLoopResult> {
  const {
    enableBuild,
    enableTest,
    enableLint,
    buildCmd,
    testCmd,
    lintCmd,
    maxRetries,
    cwd,
  } = args;

  const allDisabled = !enableBuild && !enableTest && !enableLint;
  if (allDisabled) {
    return {
      ok: true,
      attempts: 0,
      summary: "Validation disabled (build/test/lint all disabled).",
    };
  }

  let attempts = 0;
  let consecutivePasses = 0;

  while (attempts < maxRetries) {
    attempts += 1;

    if (enableBuild) {
      const buildResult = await runSingleCommand(buildCmd, cwd);
      if (!buildResult.ok) {
        return {
          ok: false,
          attempts,
          lastStage: "build",
          stdout: tail(buildResult.stdout),
          stderr: tail(buildResult.stderr),
          code: buildResult.code,
          summary: makeSummary("build", buildResult),
        };
      }
    }

    if (enableTest) {
      const testResult = await runSingleCommand(testCmd, cwd);
      if (!testResult.ok) {
        return {
          ok: false,
          attempts,
          lastStage: "test",
          stdout: tail(testResult.stdout),
          stderr: tail(testResult.stderr),
          code: testResult.code,
          summary: makeSummary("test", testResult),
        };
      }
    }

    if (enableLint) {
      const lintResult = await runSingleCommand(lintCmd, cwd);
      if (!lintResult.ok) {
        return {
          ok: false,
          attempts,
          lastStage: "lint",
          stdout: tail(lintResult.stdout),
          stderr: tail(lintResult.stderr),
          code: lintResult.code,
          summary: makeSummary("lint", lintResult),
        };
      }
    }

    consecutivePasses += 1;
    if (consecutivePasses >= 2) {
      return {
        ok: true,
        attempts,
        summary: "Build/Test/Lint passed twice consecutively.",
      };
    }
  }

  return {
    ok: false,
    attempts,
    summary: `Reached maxRetries (${maxRetries}) without two consecutive build/test/lint passes.`,
  };
}
