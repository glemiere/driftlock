import path from "path";
import { promises as fs, constants as fsConstants, existsSync } from "fs";
import defaultConfigJson from "../../config.default.json";
import configSchemaJson from "../../assets/schemas/config.schema.json";
import { validateAgainstSchema } from "../utils/schema-validator";
import { runCommand } from "./utils/run-commands";

export type AuditorConfig = {
  enabled: boolean;
  path: string;
  validators: string[];
  model?: string;
  reasoning?: ReasoningEffort;
};

export type ValidatorConfig = {
  path: string;
  model?: string;
  reasoning?: ReasoningEffort;
};

export type FormatterConfig = {
  path: string;
  schema: string;
  model?: string;
  fixRegressionPath?: string;
  reasoning?: ReasoningEffort;
};

export type QualityGateStageConfig = {
  enabled: boolean;
  run: string;
};

export type BaselineSanitazorConfig = {
  enabled: boolean;
  path: string;
  model?: string;
  reasoning?: ReasoningEffort;
  maxAttempts?: number;
};

export type PullRequestConfig = {
  enabled: boolean;
  gitHostSaas: GitHostSaas;
  formatter: FormatterConfig;
};

export type DriftlockConfig = {
  auditors: Record<string, AuditorConfig>;
  validators: Record<string, ValidatorConfig>;
  formatters: {
    plan: FormatterConfig;
    executeStep: FormatterConfig;
  };
  baselines?: {
    quality?: BaselineSanitazorConfig;
  };
  qualityGate: {
    build: QualityGateStageConfig;
    lint: QualityGateStageConfig;
    test: QualityGateStageConfig;
    lintAutoFix: string | null;
  };
  runBaselineQualityGate: boolean;
  finalQualityGateRegression: boolean;
  maxPlanRetries: number;
  maxValidationRetries: number;
  maxRegressionAttempts: number;
  maxThreadLifetimeAttempts: number;
  turnTimeoutMs: number;
  pullRequest: PullRequestConfig;
  exclude: string[];
  model?: string;
  reasoning?: ReasoningEffort;
};

export type GitHostSaas = "github";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

type AuditorConfigOverride = Partial<AuditorConfig>;

type DriftlockConfigOverrides = {
  auditors?: Record<string, AuditorConfigOverride>;
  validators?: Record<string, ValidatorConfig>;
  baselines?: {
    quality?: Partial<BaselineSanitazorConfig>;
  };
  qualityGate?: Partial<{
    build: Partial<QualityGateStageConfig>;
    lint: Partial<QualityGateStageConfig>;
    test: Partial<QualityGateStageConfig>;
    lintAutoFix: string | null;
  }>;
  formatters?: {
    plan?: Partial<FormatterConfig>;
    executeStep?: Partial<FormatterConfig>;
  };
  pullRequest?: {
    enabled?: boolean;
    gitHostSaas?: GitHostSaas;
    formatter?: Partial<FormatterConfig>;
  };
  runBaselineQualityGate?: boolean;
  finalQualityGateRegression?: boolean;
  maxPlanRetries?: number;
  maxValidationRetries?: number;
  maxRegressionAttempts?: number;
  maxThreadLifetimeAttempts?: number;
  turnTimeoutMs?: number;
  exclude?: string[];
  model?: string;
  reasoning?: ReasoningEffort;
};

type RawConfigObject = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const REQUIRED_VALIDATORS = ["plan"];

function resolveUserConfigPath(cwd: string, userPath: string): string {
  if (path.isAbsolute(userPath)) return userPath;

  const cwdCandidate = path.resolve(cwd, userPath);
  if (existsSync(cwdCandidate)) return cwdCandidate;

  const packageCandidate = path.resolve(PACKAGE_ROOT, userPath);
  if (existsSync(packageCandidate)) return packageCandidate;

  return cwdCandidate;
}

function isPlainObject(value: unknown): value is RawConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) {
    return base;
  }

  if (Array.isArray(base) && Array.isArray(override)) {
    return override as unknown as T;
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const result: RawConfigObject = { ...base };

    for (const [key, overrideValue] of Object.entries(override)) {
      const baseValue = (base as RawConfigObject)[key];
      result[key] =
        baseValue === undefined ? overrideValue : deepMerge(baseValue, overrideValue);
    }

    return result as T;
  }

  return override as T;
}

function getSectionObject(
  root: RawConfigObject,
  key: "auditors" | "validators" | "formatters",
  source: string
): RawConfigObject {
  const section = root[key];

  if (!isPlainObject(section)) {
    throw new Error(`${
      source === "Default" ? "Default" : "User"
    } config "${key}" must be an object.`);
  }

  return section;
}

function normalizeDefaultAuditors(auditorsObj: RawConfigObject): Record<string, AuditorConfig> {
  const auditors: Record<string, AuditorConfig> = {};

  for (const [name, value] of Object.entries(auditorsObj)) {
    if (!isPlainObject(value)) {
      throw new Error(`Default config auditor "${name}" must be an object.`);
    }

    const enabled = value.enabled;
    const auditorPath = value.path;
    const validatorsField = value.validators;
    const model = value.model;
    const reasoning = value.reasoning;

    if (typeof enabled !== "boolean") {
      throw new Error(
        `Default config auditor "${name}.enabled" must be a boolean.`
      );
    }

    if (typeof auditorPath !== "string") {
      throw new Error(
        `Default config auditor "${name}.path" must be a string.`
      );
    }

    if (!Array.isArray(validatorsField)) {
      throw new Error(
        `Default config auditor "${name}.validators" must be an array of strings.`
      );
    }

    if (!validatorsField.every((value) => typeof value === "string")) {
      throw new Error(
        `Default config auditor "${name}.validators" must contain only strings.`
      );
    }

    auditors[name] = {
      enabled,
      path: path.resolve(PACKAGE_ROOT, auditorPath),
      validators: [...validatorsField],
      model: typeof model === "string" ? model : undefined,
      reasoning: typeof reasoning === "string" ? (reasoning as ReasoningEffort) : undefined,
    };
  }

  return auditors;
}

function normalizeDefaultValidators(validatorsObj: RawConfigObject): Record<string, ValidatorConfig> {
  const validators: Record<string, ValidatorConfig> = {};

  for (const [name, value] of Object.entries(validatorsObj)) {
    if (!isPlainObject(value) || typeof value.path !== "string") {
      throw new Error(
        `Default config validator "${name}" must be an object with a string path.`
      );
    }

    validators[name] = {
      path: path.resolve(PACKAGE_ROOT, value.path),
      model: typeof value.model === "string" ? value.model : undefined,
      reasoning: typeof value.reasoning === "string" ? (value.reasoning as ReasoningEffort) : undefined,
    };
  }

  return validators;
}

function normalizeDefaultFormatterConfig(
  name: string,
  raw: unknown
): FormatterConfig {
  if (!isPlainObject(raw)) {
    throw new Error(`Default config formatter "${name}" must be an object.`);
  }

  const formatterPath = raw.path;
  const schemaPath = raw.schema;

  if (typeof formatterPath !== "string") {
    throw new Error(`Default config formatter "${name}.path" must be a string.`);
  }

  if (typeof schemaPath !== "string") {
    throw new Error(`Default config formatter "${name}.schema" must be a string.`);
  }

  return {
    path: path.resolve(PACKAGE_ROOT, formatterPath),
    schema: path.resolve(PACKAGE_ROOT, schemaPath),
    model: typeof raw.model === "string" ? raw.model : undefined,
    fixRegressionPath:
      typeof raw.fixRegressionPath === "string"
        ? path.resolve(PACKAGE_ROOT, raw.fixRegressionPath)
        : undefined,
    reasoning: typeof raw.reasoning === "string" ? (raw.reasoning as ReasoningEffort) : undefined,
  };
}

function normalizeDefaultFormatters(formattersObj: RawConfigObject): DriftlockConfig["formatters"] {
  return {
    plan: normalizeDefaultFormatterConfig("plan", formattersObj.plan),
    executeStep: normalizeDefaultFormatterConfig("executeStep", formattersObj.executeStep),
  };
}

function normalizeDefaultPullRequest(root: RawConfigObject): PullRequestConfig {
  const raw = root.pullRequest;
  if (raw === undefined) {
    return {
      enabled: false,
      gitHostSaas: "github",
      formatter: {
        path: path.resolve(PACKAGE_ROOT, "assets", "formatters", "pull-request.md"),
        schema: path.resolve(PACKAGE_ROOT, "assets", "schemas", "pull-request.schema.json"),
      },
    };
  }

  if (!isPlainObject(raw)) {
    throw new Error('Default config "pullRequest" must be an object when provided.');
  }

  const enabled = raw.enabled;
  if (typeof enabled !== "boolean") {
    throw new Error('Default config "pullRequest.enabled" must be a boolean.');
  }

  const gitHostSaas = (raw as RawConfigObject).gitHostSaas;
  if (typeof gitHostSaas !== "string") {
    throw new Error('Default config "pullRequest.gitHostSaas" must be a string.');
  }

  if (!("formatter" in raw)) {
    throw new Error('Default config "pullRequest.formatter" is required.');
  }

  const formatter = normalizeDefaultFormatterConfig(
    "pullRequest",
    (raw as RawConfigObject).formatter
  );

  return { enabled, gitHostSaas: gitHostSaas as GitHostSaas, formatter };
}

function normalizeDefaultExclude(root: RawConfigObject): string[] {
  if (root.exclude === undefined) {
    return [];
  }

  if (!Array.isArray(root.exclude) || !root.exclude.every((item) => typeof item === "string")) {
    throw new Error('Default config "exclude" must be an array of strings when provided.');
  }

  return root.exclude.map((item) => path.resolve(PACKAGE_ROOT, item));
}

function normalizeDefaultBaselines(
  root: RawConfigObject
): DriftlockConfig["baselines"] {
  const raw = root.baselines;
  if (raw === undefined) return undefined;

  if (!isPlainObject(raw)) {
    throw new Error('Default config "baselines" must be an object when provided.');
  }

  const baselinesObj = raw as RawConfigObject;
  const result: NonNullable<DriftlockConfig["baselines"]> = {};

  if ("quality" in baselinesObj && baselinesObj.quality !== undefined) {
    const qualityRaw = baselinesObj.quality;
    if (!isPlainObject(qualityRaw)) {
      throw new Error('Default config "baselines.quality" must be an object.');
    }

    const qualityObj = qualityRaw as RawConfigObject;
    const enabled = qualityObj.enabled;
    const baselinePath = qualityObj.path;

    if (typeof enabled !== "boolean") {
      throw new Error('Default config "baselines.quality.enabled" must be a boolean.');
    }
    if (typeof baselinePath !== "string") {
      throw new Error('Default config "baselines.quality.path" must be a string.');
    }

    const model = qualityObj.model;
    if (model !== undefined && typeof model !== "string") {
      throw new Error('Default config "baselines.quality.model" must be a string.');
    }

    const reasoning = qualityObj.reasoning;
    if (reasoning !== undefined && typeof reasoning !== "string") {
      throw new Error('Default config "baselines.quality.reasoning" must be a string.');
    }

    const maxAttempts = qualityObj.maxAttempts;
    if (maxAttempts !== undefined && typeof maxAttempts !== "number") {
      throw new Error('Default config "baselines.quality.maxAttempts" must be a number.');
    }

    result.quality = {
      enabled,
      path: path.resolve(PACKAGE_ROOT, baselinePath),
      model: typeof model === "string" ? model : undefined,
      reasoning: typeof reasoning === "string" ? (reasoning as ReasoningEffort) : undefined,
      maxAttempts: typeof maxAttempts === "number" ? maxAttempts : undefined,
    };
  }

  return result;
}

function normalizeDefaultQualityGate(root: RawConfigObject): DriftlockConfig["qualityGate"] {
  const rawGate = root.qualityGate;
  if (!isPlainObject(rawGate)) {
    throw new Error('Default config "qualityGate" must be an object.');
  }

  const gateObj = rawGate as RawConfigObject;

  const normalizeStage = (name: "build" | "lint" | "test"): QualityGateStageConfig => {
    const rawStage = gateObj[name];
    if (!isPlainObject(rawStage)) {
      throw new Error(`Default config "qualityGate.${name}" must be an object.`);
    }

    const enabled = rawStage.enabled;
    const run = rawStage.run;

    if (typeof enabled !== "boolean") {
      throw new Error(`Default config "qualityGate.${name}.enabled" must be a boolean.`);
    }

    if (typeof run !== "string") {
      throw new Error(`Default config "qualityGate.${name}.run" must be a string.`);
    }

    return { enabled, run };
  };

  const lintAutoFixRaw = gateObj.lintAutoFix;
  let lintAutoFix: string | null = null;
  if (lintAutoFixRaw !== undefined) {
    if (lintAutoFixRaw !== null && typeof lintAutoFixRaw !== "string") {
      throw new Error('Default config "qualityGate.lintAutoFix" must be a string or null.');
    }
    lintAutoFix = lintAutoFixRaw as string | null;
  }

  return {
    build: normalizeStage("build"),
    lint: normalizeStage("lint"),
    test: normalizeStage("test"),
    lintAutoFix,
  };
}

function normalizeDefaultConfig(raw: unknown): DriftlockConfig {
  validateAgainstSchema(raw, configSchemaJson, {
    allowPartial: false,
    schemaName: "Default config",
  });

  if (!isPlainObject(raw)) {
    throw new Error("Default config must be a JSON object.");
  }

  const root = raw;

  const auditorsObj = getSectionObject(root, "auditors", "Default");
  const validatorsObj = getSectionObject(root, "validators", "Default");
  const formattersObj = getSectionObject(root, "formatters", "Default");
  const exclude = normalizeDefaultExclude(root);
  const baselines = normalizeDefaultBaselines(root);
  const qualityGate = normalizeDefaultQualityGate(root);
  const pullRequest = normalizeDefaultPullRequest(root);
  const model = typeof root.model === "string" ? root.model : undefined;
  const reasoning = typeof root.reasoning === "string" ? (root.reasoning as ReasoningEffort) : undefined;
  const turnTimeoutMs = typeof root.turnTimeoutMs === "number" ? root.turnTimeoutMs : 0;
  const finalQualityGateRegression =
    typeof root.finalQualityGateRegression === "boolean"
      ? root.finalQualityGateRegression
      : false;

  const auditors = normalizeDefaultAuditors(auditorsObj);
  const validators = normalizeDefaultValidators(validatorsObj);
  const formatters = normalizeDefaultFormatters(formattersObj);

  return {
    auditors,
    validators,
    baselines,
    qualityGate,
    runBaselineQualityGate:
      typeof root.runBaselineQualityGate === "boolean" ? root.runBaselineQualityGate : true,
    finalQualityGateRegression,
    maxPlanRetries:
      typeof root.maxPlanRetries === "number" ? root.maxPlanRetries : 1,
    maxValidationRetries:
      typeof root.maxValidationRetries === "number" ? root.maxValidationRetries : 1,
    maxRegressionAttempts:
      typeof root.maxRegressionAttempts === "number" ? root.maxRegressionAttempts : 3,
    maxThreadLifetimeAttempts:
      typeof root.maxThreadLifetimeAttempts === "number"
        ? root.maxThreadLifetimeAttempts
        : 5,
    turnTimeoutMs,
    formatters,
    pullRequest,
    exclude,
    model,
    reasoning,
  };
}

function buildUserAuditorOverrides(
  auditorsRaw: unknown,
  cwd: string
): Record<string, AuditorConfigOverride> {
  if (!isPlainObject(auditorsRaw)) {
    throw new Error('User config "auditors" must be an object when provided.');
  }

  const auditorsObj = auditorsRaw as RawConfigObject;
  const overrides: Record<string, AuditorConfigOverride> = {};

  for (const [name, value] of Object.entries(auditorsObj)) {
    if (!isPlainObject(value)) {
      throw new Error(`User config auditor "${name}" must be an object.`);
    }

    const auditorOverride: AuditorConfigOverride = {};

    if ("enabled" in value) {
      if (typeof value.enabled !== "boolean") {
        throw new Error(
          `User config auditor "${name}.enabled" must be a boolean.`
        );
      }

      auditorOverride.enabled = value.enabled;
    }

    if ("path" in value) {
      if (typeof value.path !== "string") {
        throw new Error(
          `User config auditor "${name}.path" must be a string.`
        );
      }

      auditorOverride.path = resolveUserConfigPath(cwd, value.path);
    }

    if ("validators" in value) {
      if (!Array.isArray(value.validators)) {
        throw new Error(
          `User config auditor "${name}.validators" must be an array of strings.`
        );
      }

      if (!value.validators.every((validator) => typeof validator === "string")) {
        throw new Error(
          `User config auditor "${name}.validators" must contain only strings.`
        );
      }

      auditorOverride.validators = [...value.validators];
    }

    if ("model" in value) {
      if (value.model !== undefined && typeof value.model !== "string") {
        throw new Error(`User config auditor "${name}.model" must be a string.`);
      }
      auditorOverride.model = value.model as string | undefined;
    }

    if ("reasoning" in value) {
      if (value.reasoning !== undefined && typeof value.reasoning !== "string") {
        throw new Error(`User config auditor "${name}.reasoning" must be a string.`);
      }
      auditorOverride.reasoning = value.reasoning as ReasoningEffort | undefined;
    }

    overrides[name] = auditorOverride;
  }

  return overrides;
}

function buildUserValidatorOverrides(
  validatorsRaw: unknown,
  cwd: string
): Record<string, ValidatorConfig> {
  if (!isPlainObject(validatorsRaw)) {
    throw new Error(
      'User config "validators" must be an object mapping names to paths.'
    );
  }

  const validatorsObj = validatorsRaw as RawConfigObject;
  const overrides: Record<string, ValidatorConfig> = {};

  for (const [name, value] of Object.entries(validatorsObj)) {
    if (typeof value === "string") {
      overrides[name] = { path: resolveUserConfigPath(cwd, value) };
      continue;
    }

    if (!isPlainObject(value) || typeof value.path !== "string") {
      throw new Error(
        `User config validator "${name}" must be a string path or an object with a string path.`
      );
    }

    overrides[name] = {
      path: resolveUserConfigPath(cwd, value.path),
      model: typeof value.model === "string" ? value.model : undefined,
      reasoning:
        typeof value.reasoning === "string"
          ? (value.reasoning as ReasoningEffort)
          : undefined,
    };
  }

  return overrides;
}

function buildUserFormatterOverrides(
  formattersRaw: unknown,
  cwd: string
): DriftlockConfigOverrides["formatters"] {
  if (!isPlainObject(formattersRaw)) {
    throw new Error('User config "formatters" must be an object when provided.');
  }

  const formattersObj = formattersRaw as RawConfigObject;
  const override: DriftlockConfigOverrides["formatters"] = {};

  const normalize = (name: keyof DriftlockConfig["formatters"]) => {
    if (!(name in formattersObj)) return;
    const raw = formattersObj[name];
    if (!isPlainObject(raw)) {
      throw new Error(`User config formatter "${String(name)}" must be an object.`);
    }

    const partial: Partial<FormatterConfig> = {};

    if ("path" in raw) {
      if (typeof raw.path !== "string") {
        throw new Error(`User config formatter "${String(name)}.path" must be a string.`);
      }
      partial.path = resolveUserConfigPath(cwd, raw.path);
    }

    if ("schema" in raw) {
      if (typeof raw.schema !== "string") {
        throw new Error(`User config formatter "${String(name)}.schema" must be a string.`);
      }
      partial.schema = resolveUserConfigPath(cwd, raw.schema);
    }

    if ("model" in raw) {
      if (raw.model !== undefined && typeof raw.model !== "string") {
        throw new Error(`User config formatter "${String(name)}.model" must be a string.`);
      }
      partial.model = raw.model as string | undefined;
    }

    if ("fixRegressionPath" in raw) {
      if (raw.fixRegressionPath !== undefined && typeof raw.fixRegressionPath !== "string") {
        throw new Error(
          `User config formatter "${String(name)}.fixRegressionPath" must be a string.`
        );
      }
      if (typeof raw.fixRegressionPath === "string") {
        partial.fixRegressionPath = resolveUserConfigPath(cwd, raw.fixRegressionPath);
      }
    }

    if ("reasoning" in raw) {
      if (raw.reasoning !== undefined && typeof raw.reasoning !== "string") {
        throw new Error(
          `User config formatter "${String(name)}.reasoning" must be a string.`
        );
      }
      partial.reasoning = raw.reasoning as ReasoningEffort | undefined;
    }

    override[name] = partial;
  };

  normalize("plan");
  normalize("executeStep");

  return override;
}

function buildUserPullRequestOverrides(
  raw: unknown,
  cwd: string
): DriftlockConfigOverrides["pullRequest"] {
  if (!isPlainObject(raw)) {
    throw new Error('User config "pullRequest" must be an object when provided.');
  }

  const prObj = raw as RawConfigObject;
  const override: NonNullable<DriftlockConfigOverrides["pullRequest"]> = {};

  if ("enabled" in prObj) {
    if (typeof prObj.enabled !== "boolean") {
      throw new Error('User config "pullRequest.enabled" must be a boolean.');
    }
    override.enabled = prObj.enabled;
  }

  if ("gitHostSaas" in prObj) {
    if (prObj.gitHostSaas !== undefined && typeof prObj.gitHostSaas !== "string") {
      throw new Error('User config "pullRequest.gitHostSaas" must be a string.');
    }
    override.gitHostSaas = prObj.gitHostSaas as GitHostSaas | undefined;
  }

  if ("formatter" in prObj) {
    const formatterRaw = prObj.formatter;
    if (!isPlainObject(formatterRaw)) {
      throw new Error('User config "pullRequest.formatter" must be an object.');
    }

    const formatterObj = formatterRaw as RawConfigObject;
    const partial: Partial<FormatterConfig> = {};

    if ("path" in formatterObj) {
      if (typeof formatterObj.path !== "string") {
        throw new Error('User config "pullRequest.formatter.path" must be a string.');
      }
      partial.path = resolveUserConfigPath(cwd, formatterObj.path);
    }

    if ("schema" in formatterObj) {
      if (typeof formatterObj.schema !== "string") {
        throw new Error('User config "pullRequest.formatter.schema" must be a string.');
      }
      partial.schema = resolveUserConfigPath(cwd, formatterObj.schema);
    }

    if ("model" in formatterObj) {
      if (formatterObj.model !== undefined && typeof formatterObj.model !== "string") {
        throw new Error('User config "pullRequest.formatter.model" must be a string.');
      }
      partial.model = formatterObj.model as string | undefined;
    }

    if ("reasoning" in formatterObj) {
      if (formatterObj.reasoning !== undefined && typeof formatterObj.reasoning !== "string") {
        throw new Error('User config "pullRequest.formatter.reasoning" must be a string.');
      }
      partial.reasoning = formatterObj.reasoning as ReasoningEffort | undefined;
    }

    override.formatter = partial;
  }

  return override;
}

function buildUserBaselineOverrides(
  raw: unknown,
  cwd: string
): DriftlockConfigOverrides["baselines"] {
  if (!isPlainObject(raw)) {
    throw new Error('User config "baselines" must be an object when provided.');
  }

  const baselinesObj = raw as RawConfigObject;
  const override: NonNullable<DriftlockConfigOverrides["baselines"]> = {};

  if ("quality" in baselinesObj) {
    const qualityRaw = baselinesObj.quality;
    if (qualityRaw !== undefined && !isPlainObject(qualityRaw)) {
      throw new Error('User config "baselines.quality" must be an object when provided.');
    }

    const qualityObj = (qualityRaw ?? {}) as RawConfigObject;
    const partial: Partial<BaselineSanitazorConfig> = {};

    if ("enabled" in qualityObj) {
      if (typeof qualityObj.enabled !== "boolean") {
        throw new Error('User config "baselines.quality.enabled" must be a boolean.');
      }
      partial.enabled = qualityObj.enabled;
    }

    if ("path" in qualityObj) {
      if (typeof qualityObj.path !== "string") {
        throw new Error('User config "baselines.quality.path" must be a string.');
      }
      partial.path = resolveUserConfigPath(cwd, qualityObj.path);
    }

    if ("model" in qualityObj) {
      if (qualityObj.model !== undefined && typeof qualityObj.model !== "string") {
        throw new Error('User config "baselines.quality.model" must be a string.');
      }
      partial.model = qualityObj.model as string | undefined;
    }

    if ("reasoning" in qualityObj) {
      if (qualityObj.reasoning !== undefined && typeof qualityObj.reasoning !== "string") {
        throw new Error('User config "baselines.quality.reasoning" must be a string.');
      }
      partial.reasoning = qualityObj.reasoning as ReasoningEffort | undefined;
    }

    if ("maxAttempts" in qualityObj) {
      if (qualityObj.maxAttempts !== undefined && typeof qualityObj.maxAttempts !== "number") {
        throw new Error('User config "baselines.quality.maxAttempts" must be a number.');
      }
      partial.maxAttempts = qualityObj.maxAttempts as number | undefined;
    }

    override.quality = partial;
  }

  return override;
}

function normalizeUserConfig(raw: unknown, cwd: string): DriftlockConfigOverrides {
  validateAgainstSchema(raw, configSchemaJson, {
    allowPartial: true,
    schemaName: "User config",
  });

  if (!isPlainObject(raw)) {
    throw new Error("User config must be a JSON object.");
  }

  const root = raw;

  const overrides: DriftlockConfigOverrides = {};

  if (root.auditors !== undefined) {
    overrides.auditors = buildUserAuditorOverrides(root.auditors, cwd);
  }

  if (root.validators !== undefined) {
    overrides.validators = buildUserValidatorOverrides(root.validators, cwd);
  }

  if (root.formatters !== undefined) {
    overrides.formatters = buildUserFormatterOverrides(root.formatters, cwd);
  }

  if (root.pullRequest !== undefined) {
    overrides.pullRequest = buildUserPullRequestOverrides(root.pullRequest, cwd);
  }

  if (root.baselines !== undefined) {
    overrides.baselines = buildUserBaselineOverrides(root.baselines, cwd);
  }

  if (root.exclude !== undefined) {
    if (!Array.isArray(root.exclude) || !root.exclude.every((item) => typeof item === "string")) {
      throw new Error('User config "exclude" must be an array of strings when provided.');
    }

    overrides.exclude = root.exclude.map((item) => path.resolve(cwd, item));
  }

  if (root.model !== undefined) {
    if (typeof root.model !== "string") {
      throw new Error('User config "model" must be a string when provided.');
    }
    overrides.model = root.model;
  }

  if (root.reasoning !== undefined) {
    if (typeof root.reasoning !== "string") {
      throw new Error('User config "reasoning" must be a string when provided.');
    }
    overrides.reasoning = root.reasoning as ReasoningEffort;
  }

  if (root.runBaselineQualityGate !== undefined) {
    if (typeof root.runBaselineQualityGate !== "boolean") {
      throw new Error(
        'User config "runBaselineQualityGate" must be a boolean when provided.'
      );
    }
    overrides.runBaselineQualityGate = root.runBaselineQualityGate;
  }

  if (root.finalQualityGateRegression !== undefined) {
    if (typeof root.finalQualityGateRegression !== "boolean") {
      throw new Error(
        'User config "finalQualityGateRegression" must be a boolean when provided.'
      );
    }
    overrides.finalQualityGateRegression = root.finalQualityGateRegression;
  }

  if (root.qualityGate !== undefined) {
    if (!isPlainObject(root.qualityGate)) {
      throw new Error('User config "qualityGate" must be an object when provided.');
    }

    const gateRoot = root.qualityGate as RawConfigObject;
    const gateOverride: NonNullable<DriftlockConfigOverrides["qualityGate"]> = {};

    const normalizeStage = (name: "build" | "lint" | "test") => {
      if (!(name in gateRoot)) return;
      const rawStage = gateRoot[name];
      if (!isPlainObject(rawStage)) {
        throw new Error(`User config "qualityGate.${name}" must be an object.`);
      }

      const stageObj = rawStage as RawConfigObject;
      const stageOverride: Partial<QualityGateStageConfig> = {};

      if ("enabled" in stageObj) {
        if (typeof stageObj.enabled !== "boolean") {
          throw new Error(`User config "qualityGate.${name}.enabled" must be a boolean.`);
        }
        stageOverride.enabled = stageObj.enabled;
      }

      if ("run" in stageObj) {
        if (typeof stageObj.run !== "string") {
          throw new Error(`User config "qualityGate.${name}.run" must be a string.`);
        }
        stageOverride.run = stageObj.run;
      }

      gateOverride[name] = stageOverride;
    };

    normalizeStage("build");
    normalizeStage("lint");
    normalizeStage("test");

    if ("lintAutoFix" in gateRoot) {
      const lintAutoFix = gateRoot.lintAutoFix;
      if (lintAutoFix !== null && typeof lintAutoFix !== "string") {
        throw new Error(
          'User config "qualityGate.lintAutoFix" must be a string or null.'
        );
      }
      gateOverride.lintAutoFix = lintAutoFix as string | null;
    }

    overrides.qualityGate = gateOverride;
  }

  if (root.maxPlanRetries !== undefined) {
    if (typeof root.maxPlanRetries !== "number") {
      throw new Error(
        'User config "maxPlanRetries" must be a number when provided.'
      );
    }
    overrides.maxPlanRetries = root.maxPlanRetries;
  }

  if (root.maxValidationRetries !== undefined) {
    if (typeof root.maxValidationRetries !== "number") {
      throw new Error(
        'User config "maxValidationRetries" must be a number when provided.'
      );
    }
    overrides.maxValidationRetries = root.maxValidationRetries;
  }

  if (root.maxRegressionAttempts !== undefined) {
    if (typeof root.maxRegressionAttempts !== "number") {
      throw new Error(
        'User config "maxRegressionAttempts" must be a number when provided.'
      );
    }
    overrides.maxRegressionAttempts = root.maxRegressionAttempts;
  }

  if (root.maxThreadLifetimeAttempts !== undefined) {
    if (typeof root.maxThreadLifetimeAttempts !== "number") {
      throw new Error(
        'User config "maxThreadLifetimeAttempts" must be a number when provided.'
      );
    }
    overrides.maxThreadLifetimeAttempts = root.maxThreadLifetimeAttempts;
  }

  if (root.turnTimeoutMs !== undefined) {
    if (typeof root.turnTimeoutMs !== "number") {
      throw new Error('User config "turnTimeoutMs" must be a number when provided.');
    }
    overrides.turnTimeoutMs = root.turnTimeoutMs;
  }

  return overrides;
}

function getUserConfigPath(): string {
  return path.resolve(process.cwd(), "driftlock.config.json");
}

async function readUserConfigFile(filePath: string): Promise<unknown | undefined> {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return JSON.parse(contents) as unknown;
  } catch (error) {
    const nodeError = error as { code?: string };

    if (nodeError.code === "ENOENT") {
      return undefined;
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse driftlock.config.json: ${error.message}`
      );
    }

    throw error;
  }
}

export async function loadConfig(): Promise<DriftlockConfig> {
  const defaultConfig = normalizeDefaultConfig(defaultConfigJson);
  const userConfigPath = getUserConfigPath();
  const rawUserConfig = await readUserConfigFile(userConfigPath);

  if (rawUserConfig === undefined) {
    enforceRequiredValidators(defaultConfig);
    await ensureFormatterPathsExist(defaultConfig);
    await ensurePullRequestAssetsExist(defaultConfig);
    await ensurePullRequestToolingAvailable(defaultConfig);
    await ensureValidatorPathsExist(defaultConfig);
    await ensureAuditorPathsExist(defaultConfig);
    await ensureBaselinePathsExist(defaultConfig);
    return defaultConfig;
  }

  const userOverrides = normalizeUserConfig(rawUserConfig, process.cwd());
  const merged = deepMerge<DriftlockConfig>(defaultConfig, userOverrides);

  enforceRequiredValidators(merged);
  ensureValidatorNamesExist(merged);
  await ensureFormatterPathsExist(merged);
  await ensurePullRequestAssetsExist(merged);
  await ensurePullRequestToolingAvailable(merged);
  await ensureValidatorPathsExist(merged);
  await ensureAuditorPathsExist(merged);
  await ensureBaselinePathsExist(merged);

  return merged;
}

function ensureValidatorNamesExist(config: DriftlockConfig): void {
  const knownValidators = new Set(Object.keys(config.validators));

  for (const [name, auditor] of Object.entries(config.auditors)) {
    for (const validatorName of auditor.validators) {
      if (!knownValidators.has(validatorName)) {
        throw new Error(
          `Auditor "${name}" references unknown validator "${validatorName}".`
        );
      }
    }
  }
}

function enforceRequiredValidators(config: DriftlockConfig): void {
  for (const auditor of Object.values(config.auditors)) {
    const mergedValidators = [
      ...REQUIRED_VALIDATORS,
      ...auditor.validators.filter((v) => !REQUIRED_VALIDATORS.includes(v)),
    ];
    auditor.validators = dedupePreserveOrder(mergedValidators);
  }
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}

async function ensureAuditorPathsExist(config: DriftlockConfig): Promise<void> {
  const checks = Object.entries(config.auditors).map(async ([name, auditor]) => {
    try {
      await fs.access(auditor.path, fsConstants.R_OK);
    } catch {
      throw new Error(
        `Auditor "${name}" path does not exist or is not readable: ${auditor.path}`
      );
    }
  });

  await Promise.all(checks);
}

async function ensureBaselinePathsExist(config: DriftlockConfig): Promise<void> {
  const quality = config.baselines?.quality;
  if (!quality || !quality.enabled) return;

  try {
    await fs.access(quality.path, fsConstants.R_OK);
  } catch {
    throw new Error(
      `Baseline sanitazor "quality" path does not exist or is not readable: ${quality.path}`
    );
  }
}

async function ensureValidatorPathsExist(config: DriftlockConfig): Promise<void> {
  const checks = Object.entries(config.validators).map(async ([name, validator]) => {
    try {
      await fs.access(validator.path, fsConstants.R_OK);
    } catch {
      throw new Error(
        `Validator "${name}" path does not exist or is not readable: ${validator.path}`
      );
    }
  });

  await Promise.all(checks);
}

async function ensureFormatterPathsExist(config: DriftlockConfig): Promise<void> {
  const checks = Object.entries(config.formatters).flatMap(([name, formatter]) => {
    const baseChecks = [
      (async () => {
        try {
          await fs.access(formatter.path, fsConstants.R_OK);
        } catch {
          throw new Error(
            `Formatter "${name}" path does not exist or is not readable: ${formatter.path}`
          );
        }
      })(),
      (async () => {
        try {
          await fs.access(formatter.schema, fsConstants.R_OK);
        } catch {
          throw new Error(
            `Formatter "${name}" schema does not exist or is not readable: ${formatter.schema}`
          );
        }
      })(),
    ];

    if (!formatter.fixRegressionPath) {
      return baseChecks;
    }

    return baseChecks.concat(
      (async () => {
        try {
          await fs.access(formatter.fixRegressionPath as string, fsConstants.R_OK);
        } catch {
          throw new Error(
            `Formatter "${name}" fixRegressionPath does not exist or is not readable: ${formatter.fixRegressionPath}`
          );
        }
      })()
    );
  });

  await Promise.all(checks);
}

async function ensurePullRequestAssetsExist(config: DriftlockConfig): Promise<void> {
  if (!config.pullRequest.enabled) return;

  const formatter = config.pullRequest.formatter;
  const checks = [
    (async () => {
      try {
        await fs.access(formatter.path, fsConstants.R_OK);
      } catch {
        throw new Error(
          `Pull request formatter path does not exist or is not readable: ${formatter.path}`
        );
      }
    })(),
    (async () => {
      try {
        await fs.access(formatter.schema, fsConstants.R_OK);
      } catch {
        throw new Error(
          `Pull request formatter schema does not exist or is not readable: ${formatter.schema}`
        );
      }
    })(),
  ];

  await Promise.all(checks);
}

async function ensurePullRequestToolingAvailable(config: DriftlockConfig): Promise<void> {
  if (!config.pullRequest.enabled) return;

  if (config.pullRequest.gitHostSaas === "github") {
    const gh = await runCommand("gh --version", process.cwd());
    if (!gh.ok) {
      throw new Error(
        'GitHub CLI ("gh") is required when pullRequest.gitHostSaas is "github". Install it from https://cli.github.com/ or disable pullRequest.enabled.'
      );
    }
  }
}
