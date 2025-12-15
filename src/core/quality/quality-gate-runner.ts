import path from "path";
import { tui } from "../../cli/tui";
import { resolveModel } from "../utils/model-resolver";
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
import type { CommandResult } from "../utils/run-commands";

export const assetsPath = (...segments: string[]): string =>
  path.resolve(__dirname, "..", "..", "..", "assets", ...segments);

export function createTestFailureCondenser(
  config: DriftlockConfig,
  auditorName: string,
  cwd: string
): (stdout: string, stderr: string) => Promise<string | undefined> {
  return async (stdout: string, stderr: string): Promise<string | undefined> => {
    const summary = await summarizeTestFailures({
      stdout,
      stderr,
      model: resolveModel(config, auditorName, "step"),
      workingDirectory: cwd,
      formatterPath: assetsPath("sanitazors", "quality-tests.md"),
      schemaPath: assetsPath("schemas", "test-failure-summary.schema.json"),
      onEvent: (text) => tui.logRight(text),
      onInfo: (text) => tui.logLeft(text),
    });
    return summary ? JSON.stringify(summary) : undefined;
  };
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

  return [
    {
      name: "build",
      enabled: context.config.enableBuild,
      run: () =>
        runBuild(
          context.config.commands.build,
          context.cwd,
          (chunk) => streamLogger("build")("stdout", chunk),
          (chunk) => streamLogger("build")("stderr", chunk)
        ),
      buildFailureDetail: summarizeStage("build"),
    },
    {
      name: "lint",
      enabled: context.config.enableLint,
      run: () =>
        runLint(
          context.config.commands.lint,
          context.cwd,
          (chunk) => streamLogger("lint")("stdout", chunk),
          (chunk) => streamLogger("lint")("stderr", chunk)
        ),
      buildFailureDetail: summarizeStage("lint"),
    },
    {
      name: "test",
      enabled: context.config.enableTest,
      run: () =>
        runTest(
          context.config.commands.test,
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

    const result = await stage.run();
    if (result.ok) continue;

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
