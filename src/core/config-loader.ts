import path from "path";
import { promises as fs } from "fs";
import defaultConfigJson from "../../config.default.json";

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
};

type AuditorConfigOverride = Partial<AuditorConfig>;

type DriftlockConfigOverrides = {
  auditors?: Record<string, AuditorConfigOverride>;
  validators?: Record<string, string>;
  formatters?: {
    plan?: string;
    schema?: string;
  };
};

const PACKAGE_ROOT = path.resolve(__dirname, "..", "..");

function isPlainObject(value: unknown): value is Record<string, unknown> {
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
    const result: Record<string, unknown> = { ...base };
    for (const [key, overrideValue] of Object.entries(override)) {
      const baseValue = (base as Record<string, unknown>)[key];
      if (baseValue === undefined) {
        result[key] = overrideValue;
      } else {
        result[key] = deepMerge(baseValue, overrideValue);
      }
    }

    return result as T;
  }

  return override as T;
}

function ensureNoExtraTopLevelKeys(raw: Record<string, unknown>, source: string) {
  const allowedKeys = new Set(["$schema", "auditors", "validators", "formatters"]);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) {
      throw new Error(
        `${source} config has unknown top-level key "${key}". ` +
          `Allowed keys are: auditors, validators, formatters, $schema.`
      );
    }
  }
}

function normalizeDefaultConfig(raw: unknown): DriftlockConfig {
  if (!isPlainObject(raw)) {
    throw new Error("Default config must be a JSON object.");
  }

  ensureNoExtraTopLevelKeys(raw, "Default");

  const auditorsRaw = raw.auditors as unknown;
  const validatorsRaw = raw.validators as unknown;
  const formattersRaw = raw.formatters as unknown;

  if (!isPlainObject(auditorsRaw)) {
    throw new Error('Default config "auditors" must be an object.');
  }

  if (!isPlainObject(validatorsRaw)) {
    throw new Error('Default config "validators" must be an object.');
  }

  if (!isPlainObject(formattersRaw)) {
    throw new Error('Default config "formatters" must be an object.');
  }

  const auditorsObj = auditorsRaw as Record<string, unknown>;
  const validatorsObj = validatorsRaw as Record<string, unknown>;
  const formattersObj = formattersRaw as Record<string, unknown>;

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

    if (!validatorsField.every((v) => typeof v === "string")) {
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

  const validators: Record<string, string> = {};

  for (const [name, value] of Object.entries(validatorsObj)) {
    if (typeof value !== "string") {
      throw new Error(
        `Default config validator "${name}" must be a string path.`
      );
    }

    validators[name] = path.resolve(PACKAGE_ROOT, value);
  }

  const planPath = formattersObj.plan;
  const schemaPath = formattersObj.schema;

  if (typeof planPath !== "string") {
    throw new Error('Default config "formatters.plan" must be a string path.');
  }

  if (typeof schemaPath !== "string") {
    throw new Error('Default config "formatters.schema" must be a string path.');
  }

  const formatters = {
    plan: path.resolve(PACKAGE_ROOT, planPath),
    schema: path.resolve(PACKAGE_ROOT, schemaPath),
  };

  return {
    auditors,
    validators,
    formatters,
  };
}

function normalizeUserConfig(raw: unknown, cwd: string): DriftlockConfigOverrides {
  if (!isPlainObject(raw)) {
    throw new Error("User config must be a JSON object.");
  }

  ensureNoExtraTopLevelKeys(raw, "User");

  const overrides: DriftlockConfigOverrides = {};

  if (raw.auditors !== undefined) {
    const auditorsRaw = raw.auditors as unknown;

    if (!isPlainObject(auditorsRaw)) {
      throw new Error('User config "auditors" must be an object when provided.');
    }

    const auditorsObj = auditorsRaw as Record<string, unknown>;

    overrides.auditors = {};

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

        if (!value.validators.every((v) => typeof v === "string")) {
          throw new Error(
            `User config auditor "${name}.validators" must contain only strings.`
          );
        }

        auditorOverride.validators = [...value.validators];
      }

      overrides.auditors[name] = auditorOverride;
    }
  }

  if (raw.validators !== undefined) {
    const validatorsRaw = raw.validators as unknown;

    if (!isPlainObject(validatorsRaw)) {
      throw new Error(
        'User config "validators" must be an object mapping names to paths.'
      );
    }

    const validatorsObj = validatorsRaw as Record<string, unknown>;

    overrides.validators = {};

    for (const [name, value] of Object.entries(validatorsObj)) {
      if (typeof value !== "string") {
        throw new Error(
          `User config validator "${name}" must be a string path.`
        );
      }

      overrides.validators[name] = path.resolve(cwd, value);
    }
  }

  if (raw.formatters !== undefined) {
    const formattersRaw = raw.formatters as unknown;

    if (!isPlainObject(formattersRaw)) {
      throw new Error('User config "formatters" must be an object when provided.');
    }

    const formattersObj = formattersRaw as Record<string, unknown>;

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

    overrides.formatters = formattersOverride;
  }

  return overrides;
}

export async function loadConfig(): Promise<DriftlockConfig> {
  const defaultConfig = normalizeDefaultConfig(defaultConfigJson);

  const userConfigPath = path.resolve(process.cwd(), "driftlock.config.json");

  let userOverrides: DriftlockConfigOverrides | undefined;

  try {
    const contents = await fs.readFile(userConfigPath, "utf8");
    let parsed: unknown;

    try {
      parsed = JSON.parse(contents);
    } catch (err) {
      throw new Error(
        `Failed to parse driftlock.config.json: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    userOverrides = normalizeUserConfig(parsed, process.cwd());
  } catch (err) {
    const error = err as { code?: string };
    if (error.code !== "ENOENT") {
      throw err;
    }
  }

  if (!userOverrides) {
    return defaultConfig;
  }

  const merged = deepMerge<DriftlockConfig>(defaultConfig, userOverrides);

  return merged;
}
