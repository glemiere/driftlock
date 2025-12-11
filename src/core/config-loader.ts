import path from "path";
import { promises as fs, constants as fsConstants } from "fs";
import defaultConfigJson from "../../config.default.json";
import configSchemaJson from "../../assets/schemas/config.schema.json";
import { validateAgainstSchema } from "../utils/schema-validator";

export type AuditorConfig = {
  enabled: boolean;
  path: string;
  validators: string[];
  model?: string;
};

export type ValidatorConfig = {
  path: string;
  model?: string;
};

export type DriftlockConfig = {
  auditors: Record<string, AuditorConfig>;
  validators: Record<string, ValidatorConfig>;
  formatters: {
    plan: string;
    schema: string;
    model?: string;
  };
  commands: {
    build: string;
    lint: string;
    test: string;
  };
  commandsFailOnly?: {
    build?: string;
    lint?: string;
    test?: string;
  };
  enableBuild: boolean;
  enableLint: boolean;
  enableTest: boolean;
  runBaselineQualityGate: boolean;
  maxValidationRetries: number;
  maxRegressionAttempts: number;
  maxThreadLifetimeAttempts: number;
  failurePolicy: {
    maxConsecutiveStepFailures: number;
    abortOnAnyStepFailure: boolean;
    requireAtLeastOneStepSuccess: boolean;
  };
  exclude: string[];
  model?: string;
};

type AuditorConfigOverride = Partial<AuditorConfig>;

type DriftlockConfigOverrides = {
  auditors?: Record<string, AuditorConfigOverride>;
  validators?: Record<string, ValidatorConfig>;
  commands?: {
    build?: string;
    lint?: string;
    test?: string;
  };
  commandsFailOnly?: {
    build?: string;
    lint?: string;
    test?: string;
  };
  formatters?: {
    plan?: string;
    schema?: string;
    model?: string;
  };
  enableBuild?: boolean;
  enableLint?: boolean;
  enableTest?: boolean;
  runBaselineQualityGate?: boolean;
  maxValidationRetries?: number;
  maxRegressionAttempts?: number;
  maxThreadLifetimeAttempts?: number;
  failurePolicy?: {
    maxConsecutiveStepFailures?: number;
    abortOnAnyStepFailure?: boolean;
    requireAtLeastOneStepSuccess?: boolean;
  };
  exclude?: string[];
  model?: string;
};

type RawConfigObject = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const REQUIRED_VALIDATORS = ["plan"];

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
    };
  }

  return validators;
}

function normalizeDefaultFormatters(formattersObj: RawConfigObject): DriftlockConfig["formatters"] {
  const planPath = formattersObj.plan;
  const schemaPath = formattersObj.schema;

  if (typeof planPath !== "string") {
    throw new Error('Default config "formatters.plan" must be a string path.');
  }

  if (typeof schemaPath !== "string") {
    throw new Error('Default config "formatters.schema" must be a string path.');
  }

  return {
    plan: path.resolve(PACKAGE_ROOT, planPath),
    schema: path.resolve(PACKAGE_ROOT, schemaPath),
  };
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
  const model = typeof root.model === "string" ? root.model : undefined;

  const commandsRoot = root.commands;
  if (
    commandsRoot === undefined ||
    !isPlainObject(commandsRoot) ||
    typeof commandsRoot.build !== "string" ||
    typeof commandsRoot.lint !== "string" ||
    typeof commandsRoot.test !== "string"
  ) {
    throw new Error(
      'Default config "commands" must provide string "build", "lint", and "test" fields.'
    );
  }

  const failurePolicyRoot = root.failurePolicy;
  if (!isPlainObject(failurePolicyRoot)) {
    throw new Error('Default config "failurePolicy" must be an object.');
  }

  const {
    maxConsecutiveStepFailures,
    abortOnAnyStepFailure,
    requireAtLeastOneStepSuccess,
  } = failurePolicyRoot as {
    maxConsecutiveStepFailures?: unknown;
    abortOnAnyStepFailure?: unknown;
    requireAtLeastOneStepSuccess?: unknown;
  };

  if (typeof maxConsecutiveStepFailures !== "number") {
    throw new Error(
      'Default config "failurePolicy.maxConsecutiveStepFailures" must be a number.'
    );
  }

  if (typeof abortOnAnyStepFailure !== "boolean") {
    throw new Error(
      'Default config "failurePolicy.abortOnAnyStepFailure" must be a boolean.'
    );
  }

  if (typeof requireAtLeastOneStepSuccess !== "boolean") {
    throw new Error(
      'Default config "failurePolicy.requireAtLeastOneStepSuccess" must be a boolean.'
    );
  }

  const auditors = normalizeDefaultAuditors(auditorsObj);
  const validators = normalizeDefaultValidators(validatorsObj);
  const formatters = normalizeDefaultFormatters(formattersObj);

  const commandsFailOnlyRoot = root.commandsFailOnly;
  let commandsFailOnly: DriftlockConfig["commandsFailOnly"];
  if (commandsFailOnlyRoot !== undefined) {
    if (!isPlainObject(commandsFailOnlyRoot)) {
      throw new Error('Default config "commandsFailOnly" must be an object when provided.');
    }
    const cfg = commandsFailOnlyRoot as RawConfigObject;
    commandsFailOnly = {};
    if (cfg.build !== undefined) {
      if (typeof cfg.build !== "string") {
        throw new Error('Default config "commandsFailOnly.build" must be a string when provided.');
      }
      commandsFailOnly.build = cfg.build;
    }
    if (cfg.lint !== undefined) {
      if (typeof cfg.lint !== "string") {
        throw new Error('Default config "commandsFailOnly.lint" must be a string when provided.');
      }
      commandsFailOnly.lint = cfg.lint;
    }
    if (cfg.test !== undefined) {
      if (typeof cfg.test !== "string") {
        throw new Error('Default config "commandsFailOnly.test" must be a string when provided.');
      }
      commandsFailOnly.test = cfg.test;
    }
  }

  return {
    auditors,
    validators,
    commands: {
      build: commandsRoot.build,
      lint: commandsRoot.lint,
      test: commandsRoot.test,
    },
    commandsFailOnly,
    enableBuild: typeof root.enableBuild === "boolean" ? root.enableBuild : true,
    enableLint: typeof root.enableLint === "boolean" ? root.enableLint : true,
    enableTest: typeof root.enableTest === "boolean" ? root.enableTest : true,
    runBaselineQualityGate:
      typeof root.runBaselineQualityGate === "boolean" ? root.runBaselineQualityGate : true,
    maxValidationRetries:
      typeof root.maxValidationRetries === "number" ? root.maxValidationRetries : 3,
    maxRegressionAttempts:
      typeof root.maxRegressionAttempts === "number" ? root.maxRegressionAttempts : 3,
    maxThreadLifetimeAttempts:
      typeof root.maxThreadLifetimeAttempts === "number"
        ? root.maxThreadLifetimeAttempts
        : 5,
    failurePolicy: {
      maxConsecutiveStepFailures,
      abortOnAnyStepFailure,
      requireAtLeastOneStepSuccess,
    },
    formatters,
    exclude,
    model,
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

      auditorOverride.path = path.resolve(cwd, value.path);
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
      overrides[name] = { path: path.resolve(cwd, value) };
      continue;
    }

    if (!isPlainObject(value) || typeof value.path !== "string") {
      throw new Error(
        `User config validator "${name}" must be a string path or an object with a string path.`
      );
    }

    overrides[name] = {
      path: path.resolve(cwd, value.path),
      model: typeof value.model === "string" ? value.model : undefined,
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
  const formattersOverride: DriftlockConfigOverrides["formatters"] = {};

  if ("plan" in formattersObj) {
    if (typeof formattersObj.plan !== "string") {
      throw new Error(
        'User config "formatters.plan" must be a string path when provided.'
      );
    }

    formattersOverride.plan = path.resolve(cwd, formattersObj.plan);
  }

  if ("schema" in formattersObj) {
    if (typeof formattersObj.schema !== "string") {
      throw new Error(
        'User config "formatters.schema" must be a string path when provided.'
      );
    }

    formattersOverride.schema = path.resolve(cwd, formattersObj.schema);
  }

  return formattersOverride;
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
    throw new Error("User config may not override formatters; this is configured by default only.");
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

  if (root.enableBuild !== undefined) {
    if (typeof root.enableBuild !== "boolean") {
      throw new Error('User config "enableBuild" must be a boolean when provided.');
    }
    overrides.enableBuild = root.enableBuild;
  }

  if (root.runBaselineQualityGate !== undefined) {
    if (typeof root.runBaselineQualityGate !== "boolean") {
      throw new Error(
        'User config "runBaselineQualityGate" must be a boolean when provided.'
      );
    }
    overrides.runBaselineQualityGate = root.runBaselineQualityGate;
  }

  if (root.commands !== undefined) {
    if (!isPlainObject(root.commands)) {
      throw new Error('User config "commands" must be an object when provided.');
    }

    const commandsRoot = root.commands as RawConfigObject;
    const commandsOverride: DriftlockConfigOverrides["commands"] = {};

    if ("lint" in commandsRoot) {
      if (typeof commandsRoot.lint !== "string") {
        throw new Error('User config "commands.lint" must be a string when provided.');
      }
      commandsOverride.lint = commandsRoot.lint;
    }

    if ("test" in commandsRoot) {
      if (typeof commandsRoot.test !== "string") {
        throw new Error('User config "commands.test" must be a string when provided.');
      }
      commandsOverride.test = commandsRoot.test;
    }

    overrides.commands = commandsOverride;
  }

  if (root.commandsFailOnly !== undefined) {
    if (!isPlainObject(root.commandsFailOnly)) {
      throw new Error('User config "commandsFailOnly" must be an object when provided.');
    }

    const commandsRoot = root.commandsFailOnly as RawConfigObject;
    const commandsFailOnlyOverride: DriftlockConfigOverrides["commandsFailOnly"] = {};

    if ("build" in commandsRoot) {
      if (commandsRoot.build !== undefined && typeof commandsRoot.build !== "string") {
        throw new Error(
          'User config "commandsFailOnly.build" must be a string when provided.'
        );
      }
      commandsFailOnlyOverride.build = commandsRoot.build as string | undefined;
    }

    if ("lint" in commandsRoot) {
      if (commandsRoot.lint !== undefined && typeof commandsRoot.lint !== "string") {
        throw new Error(
          'User config "commandsFailOnly.lint" must be a string when provided.'
        );
      }
      commandsFailOnlyOverride.lint = commandsRoot.lint as string | undefined;
    }

    if ("test" in commandsRoot) {
      if (commandsRoot.test !== undefined && typeof commandsRoot.test !== "string") {
        throw new Error(
          'User config "commandsFailOnly.test" must be a string when provided.'
        );
      }
      commandsFailOnlyOverride.test = commandsRoot.test as string | undefined;
    }

    overrides.commandsFailOnly = commandsFailOnlyOverride;
  }

  if (root.enableLint !== undefined) {
    if (typeof root.enableLint !== "boolean") {
      throw new Error('User config "enableLint" must be a boolean when provided.');
    }
    overrides.enableLint = root.enableLint;
  }

  if (root.enableTest !== undefined) {
    if (typeof root.enableTest !== "boolean") {
      throw new Error('User config "enableTest" must be a boolean when provided.');
    }
    overrides.enableTest = root.enableTest;
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

  if (root.failurePolicy !== undefined) {
    if (!isPlainObject(root.failurePolicy)) {
      throw new Error('User config "failurePolicy" must be an object when provided.');
    }

    const policyRoot = root.failurePolicy as RawConfigObject;
    const policyOverride: DriftlockConfigOverrides["failurePolicy"] = {};

    if ("maxConsecutiveStepFailures" in policyRoot) {
      if (typeof policyRoot.maxConsecutiveStepFailures !== "number") {
        throw new Error(
          'User config "failurePolicy.maxConsecutiveStepFailures" must be a number when provided.'
        );
      }
      policyOverride.maxConsecutiveStepFailures = policyRoot.maxConsecutiveStepFailures;
    }

    if ("abortOnAnyStepFailure" in policyRoot) {
      if (typeof policyRoot.abortOnAnyStepFailure !== "boolean") {
        throw new Error(
          'User config "failurePolicy.abortOnAnyStepFailure" must be a boolean when provided.'
        );
      }
      policyOverride.abortOnAnyStepFailure = policyRoot.abortOnAnyStepFailure;
    }

    if ("requireAtLeastOneStepSuccess" in policyRoot) {
      if (typeof policyRoot.requireAtLeastOneStepSuccess !== "boolean") {
        throw new Error(
          'User config "failurePolicy.requireAtLeastOneStepSuccess" must be a boolean when provided.'
        );
      }
      policyOverride.requireAtLeastOneStepSuccess =
        policyRoot.requireAtLeastOneStepSuccess;
    }

    overrides.failurePolicy = policyOverride;
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
    await ensureValidatorPathsExist(defaultConfig);
    return defaultConfig;
  }

  const userOverrides = normalizeUserConfig(rawUserConfig, process.cwd());
  const merged = deepMerge<DriftlockConfig>(defaultConfig, userOverrides);

  enforceRequiredValidators(merged);
  ensureValidatorNamesExist(merged);
  await ensureValidatorPathsExist(merged);
  await ensureAuditorPathsExist(merged);

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
