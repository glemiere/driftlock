import path from "path";
import { tui } from "../../cli/tui";
import {
  resolveTestFailureSummaryModel,
  resolveTestFailureSummaryReasoning,
} from "../utils/model-resolver";
import { summarizeTestFailures } from "./summarize-test-failures";
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

export function createTestFailureCondenser(
  config: DriftlockConfig,
  auditorName: string,
  cwd: string
): (stdout: string, stderr: string) => Promise<string | undefined> {
  return async (stdout: string, stderr: string): Promise<string | undefined> => {
    const summary = await summarizeTestFailures({
      stdout,
      stderr,
      model: resolveTestFailureSummaryModel(config, auditorName),
      reasoning: resolveTestFailureSummaryReasoning(config, auditorName),
      workingDirectory: cwd,
      formatterPath: config.formatters.testFailureSummary.path,
      schemaPath: config.formatters.testFailureSummary.schema,
      turnTimeoutMs: config.turnTimeoutMs,
      onEvent: (text) => tui.logRight(text),
      onInfo: (text) => tui.logLeft(text),
    });
    return summary ? JSON.stringify(summary) : undefined;
  };
}

function isPrettierLintFailure(result: CommandResult): boolean {
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  return PRETTIER_LINT_REGEX.test(stdout) || PRETTIER_LINT_REGEX.test(stderr);
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
    return `CondensedTestSummary:\n${condensed}`;
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
