import path from "path";
import { promises as fs, constants as fsConstants } from "fs";
import defaultConfigJson from "../../config.default.json";
import configSchemaJson from "../../assets/schemas/config.schema.json";
import { validateAgainstSchema } from "../utils/schema-validator";

export type AuditorConfig = {
  enabled: boolean;
  path: string;
  validators: string[];
};

export type DriftlockConfig = {
  auditors: Record<string, AuditorConfig>;
  validators: Record<string, string>;
  formatters: {
    plan: string;
    schema: string;
  };
  exclude: string[];
};

type AuditorConfigOverride = Partial<AuditorConfig>;

type DriftlockConfigOverrides = {
  auditors?: Record<string, AuditorConfigOverride>;
  validators?: Record<string, string>;
  formatters?: {
    plan?: string;
    schema?: string;
  };
  exclude?: string[];
};

type RawConfigObject = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");
const REQUIRED_VALIDATORS = ["structure", "general"];

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

function normalizeDefaultValidators(validatorsObj: RawConfigObject): Record<string, string> {
  const validators: Record<string, string> = {};

  for (const [name, value] of Object.entries(validatorsObj)) {
    if (typeof value !== "string") {
      throw new Error(
        `Default config validator "${name}" must be a string path.`
      );
    }

    validators[name] = path.resolve(PACKAGE_ROOT, value);
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

  const auditors = normalizeDefaultAuditors(auditorsObj);
  const validators = normalizeDefaultValidators(validatorsObj);
  const formatters = normalizeDefaultFormatters(formattersObj);

  return {
    auditors,
    validators,
    formatters,
    exclude,
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
): Record<string, string> {
  if (!isPlainObject(validatorsRaw)) {
    throw new Error(
      'User config "validators" must be an object mapping names to paths.'
    );
  }

  const validatorsObj = validatorsRaw as RawConfigObject;
  const overrides: Record<string, string> = {};

  for (const [name, value] of Object.entries(validatorsObj)) {
    if (typeof value !== "string") {
      throw new Error(
        `User config validator "${name}" must be a string path.`
      );
    }

    overrides[name] = path.resolve(cwd, value);
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
    overrides.formatters = buildUserFormatterOverrides(root.formatters, cwd);
  }

  if (root.exclude !== undefined) {
    if (!Array.isArray(root.exclude) || !root.exclude.every((item) => typeof item === "string")) {
      throw new Error('User config "exclude" must be an array of strings when provided.');
    }

    overrides.exclude = root.exclude.map((item) => path.resolve(cwd, item));
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
  const checks = Object.entries(config.validators).map(async ([name, validatorPath]) => {
    try {
      await fs.access(validatorPath, fsConstants.R_OK);
    } catch {
      throw new Error(
        `Validator "${name}" path does not exist or is not readable: ${validatorPath}`
      );
    }
  });

  await Promise.all(checks);
}
