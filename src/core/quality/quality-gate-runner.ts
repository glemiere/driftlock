import path from "path";
import { promises as fs } from "node:fs";
import { tui } from "../../cli/tui";
import {
  runBuild,
  runLint,
  runTest,
  summarizeQualityFailure,
} from "./quality-gate";
import type { DriftlockConfig } from "../config-loader";
import type {
  QualityStage,
  QualityStageContext,
  QualityStageName,
  StepQualityGateResult,
} from "../types/orchestrator.types";
import { runCommand, type CommandResult } from "../utils/run-commands";

export const assetsPath = (...segments: string[]): string =>
  path.resolve(__dirname, "..", "..", "..", "assets", ...segments);

const PRETTIER_LINT_REGEX = /prettier\/prettier/i;
const TEST_RUNNER_STARTUP_REGEXES = [
  /test runner failed to start/i,
  /failed to start plugin worker/i,
  /nx failed to start plugin worker/i,
  /failed to start worker process/i,
  /worker process failed to start/i,
  /could not start plugin worker/i,
];

export function createTestFailureCondenser(
  artifactsDirectory: string
): (stdout: string, stderr: string) => Promise<string | undefined> {
  return async (stdout: string, stderr: string): Promise<string | undefined> => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const nonce = Math.random().toString(16).slice(2);
      const base = `test-${stamp}-${nonce}`;

      const stdoutPath = path.join(artifactsDirectory, `${base}-stdout.log`);
      const stderrPath = path.join(artifactsDirectory, `${base}-stderr.log`);

      await fs.mkdir(artifactsDirectory, { recursive: true });
      await fs.writeFile(stdoutPath, stdout || "", "utf8");
      await fs.writeFile(stderrPath, stderr || "", "utf8");

      const highlights = extractFailureHighlights(stdout, stderr);

      return [
        "Test failure logs captured (untrusted). Prefer targeted searches (e.g. lines starting with `FAIL` or `●`).",
        `<untrusted_log trust="untrusted" stream="stdout" path="${escapeXmlAttribute(
          stdoutPath
        )}" bytes="${String((stdout || "").length)}" />`,
        `<untrusted_log trust="untrusted" stream="stderr" path="${escapeXmlAttribute(
          stderrPath
        )}" bytes="${String((stderr || "").length)}" />`,
        highlights.length > 0 ? `Highlights:\n${highlights.map((l) => `- ${l}`).join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    } catch {
      return undefined;
    }
  };
}

function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function extractFailureHighlights(stdout: string, stderr: string): string[] {
  const combined = `${stdout || ""}\n${stderr || ""}`;
  const lines = combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const patterns: RegExp[] = [/^fail\s+/i, /^●\s+/, /\b(assertionerror|expect\(|received:|expected:)\b/i];

  const hits: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (hits.length >= 20) break;
    if (!patterns.some((pattern) => pattern.test(line))) continue;
    const clipped = line.length > 240 ? `${line.slice(0, 237)}...` : line;
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    hits.push(clipped);
  }

  return hits;
}

function isPrettierLintFailure(result: CommandResult): boolean {
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  return PRETTIER_LINT_REGEX.test(stdout) || PRETTIER_LINT_REGEX.test(stderr);
}

function isTestRunnerStartupFailure(result: CommandResult): boolean {
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const combined = `${stdout}\n${stderr}`;
  return TEST_RUNNER_STARTUP_REGEXES.some((pattern) => pattern.test(combined));
}

function shellEscape(value: string): string {
  if (value.length === 0) return "''";
  const escaped = value.replace(/'/g, "'\"'\"'");
  return `'${escaped}'`;
}

function buildLintAutoFixCommand(template: string, files: string[]): string | null {
  const uniqueFiles = Array.from(new Set(files.filter(Boolean)));
  if (uniqueFiles.length === 0) return null;
  const escaped = uniqueFiles.map(shellEscape).join(" ");
  if (!escaped) return null;
  if (template.includes("{files}")) {
    return template.replace("{files}", escaped);
  }
  return `${template} ${escaped}`;
}

async function runLintAutoFix(
  cmd: string,
  cwd: string,
  onStdout?: (chunk: string) => void,
  onStderr?: (chunk: string) => void
): Promise<CommandResult> {
  return runCommand(cmd, cwd, { env: { CI: process.env.CI ?? "true" }, onStdout, onStderr });
}

export function createQualityStages(context: QualityStageContext): QualityStage[] {
  const streamLogger = (stageName: QualityStageName) => {
    return (stream: "stdout" | "stderr", chunk: string) => {
      const lines = chunk.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        tui.logRight(`[${stageName}] ${stream}: ${line}`);
      }
    };
  };

  const summarizeStage = (
    stageName: QualityStageName
  ): ((result: CommandResult) => Promise<string>) => {
    return async (result: CommandResult) =>
      summarizeQualityFailure(stageName, result) || "unknown failure";
  };

  const touchedFiles = Array.from(
    new Set((context.touchedFiles ?? []).filter(Boolean))
  );
  const lintAutoFix = context.config.qualityGate.lintAutoFix;
  const lintCommand = context.config.qualityGate.lint.run;

  const maybeAutoFixLint = async (
    result: CommandResult
  ): Promise<CommandResult | null> => {
    if (!lintAutoFix) return null;
    if (!isPrettierLintFailure(result)) return null;
    const cmd = buildLintAutoFixCommand(lintAutoFix, touchedFiles);
    if (!cmd) return null;

    tui.logLeft(
      `[lint] attempting auto-fix for prettier/prettier on ${touchedFiles.length} file(s).`,
      "warn"
    );
    const fixResult = await runLintAutoFix(
      cmd,
      context.cwd,
      (chunk) => streamLogger("lint")("stdout", chunk),
      (chunk) => streamLogger("lint")("stderr", chunk)
    );
    if (!fixResult.ok) {
      tui.logLeft("[lint] auto-fix command failed.", "warn");
      return fixResult;
    }

    return runLint(
      lintCommand,
      context.cwd,
      (chunk) => streamLogger("lint")("stdout", chunk),
      (chunk) => streamLogger("lint")("stderr", chunk)
    );
  };

  return [
    {
      name: "build",
      enabled: context.config.qualityGate.build.enabled,
      run: () =>
        runBuild(
          context.config.qualityGate.build.run,
          context.cwd,
          (chunk) => streamLogger("build")("stdout", chunk),
          (chunk) => streamLogger("build")("stderr", chunk)
        ),
      buildFailureDetail: summarizeStage("build"),
    },
    {
      name: "lint",
      enabled: context.config.qualityGate.lint.enabled,
      run: () =>
        runLint(
          lintCommand,
          context.cwd,
          (chunk) => streamLogger("lint")("stdout", chunk),
          (chunk) => streamLogger("lint")("stderr", chunk)
        ),
      buildFailureDetail: summarizeStage("lint"),
      retryOnFailure: maybeAutoFixLint,
    },
    {
      name: "test",
      enabled: context.config.qualityGate.test.enabled,
      run: () =>
        runTest(
          context.config.qualityGate.test.run,
          context.cwd,
          (chunk) => streamLogger("test")("stdout", chunk),
          (chunk) => streamLogger("test")("stderr", chunk)
        ),
      buildFailureDetail: async (result: CommandResult) =>
        buildTestFailureDetail(result, context.onCondenseTestFailure),
    },
  ];
}

export async function runQualityStages(
  auditorName: string,
  stages: QualityStage[]
): Promise<StepQualityGateResult> {
  for (const stage of stages) {
    if (!stage.enabled) continue;

    let result = await stage.run();
    if (result.ok) continue;

    if (stage.name === "test" && isTestRunnerStartupFailure(result)) {
      tui.logLeft(
        `[${auditorName}] test runner failed to start; treating as soft warning and skipping test gate.`,
        "warn"
      );
      continue;
    }

    if (stage.retryOnFailure) {
      const retried = await stage.retryOnFailure(result);
      if (retried) {
        result = retried;
        if (result.ok) {
          continue;
        }
      }
    }

    const detail = await stage.buildFailureDetail(result);
    const additionalContext = formatQualityGateFailure(stage.name, detail);
    tui.logLeft(`[${auditorName}] ${additionalContext}`, "warn");
    return { passed: false, additionalContext };
  }

  return { passed: true };
}

export async function buildTestFailureDetail(
  result: CommandResult,
  onCondenseTestFailure?: (stdout: string, stderr: string) => Promise<string | undefined>
): Promise<string> {
  const condensed = await maybeCondenseTestFailure(
    onCondenseTestFailure,
    result.stdout,
    result.stderr
  );
  if (condensed) {
    return condensed;
  }

  const baseSummary = summarizeQualityFailure("test", result) || "unknown failure";
  return baseSummary;
}

export function formatQualityGateFailure(stageName: QualityStageName, detail: string): string {
  return `Quality gate failed at ${stageName}: ${detail}`;
}

export async function maybeCondenseTestFailure(
  condense:
    | ((stdout: string, stderr: string) => Promise<string | undefined>)
    | undefined,
  stdout: string = "",
  stderr: string = ""
): Promise<string | undefined> {
  if (!condense) return undefined;
  try {
    return await condense(stdout, stderr);
  } catch {
    return undefined;
  }
}
