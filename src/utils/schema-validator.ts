type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  patternProperties?: Record<string, JsonSchema>;
  $defs?: Record<string, JsonSchema>;
  $ref?: string;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  enum?: unknown[];
  const?: unknown;
  oneOf?: JsonSchema[];
};

export type SchemaValidationOptions = {
  allowPartial?: boolean;
  schemaName?: string;
};

export function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  options: SchemaValidationOptions = {}
): void {
  const { allowPartial = false, schemaName = "Schema" } = options;
  validate(value, schema, schema, schemaName, "$", allowPartial);
}

function validate(
  value: unknown,
  schema: JsonSchema,
  rootSchema: JsonSchema,
  schemaName: string,
  path: string,
  allowPartial: boolean
): void {
  const resolvedSchema = resolveRef(schema, rootSchema, schemaName, path);

  if (resolvedSchema.oneOf && resolvedSchema.oneOf.length > 0) {
    const errors: string[] = [];
    for (const option of resolvedSchema.oneOf) {
      try {
        validate(value, option, rootSchema, schemaName, path, allowPartial);
        return;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    throw new Error(
      `${schemaName} validation failed at ${path}: value did not match any schema in oneOf. Errors: ${errors.join(
        " | "
      )}`
    );
  }

  if ("const" in resolvedSchema) {
    if (value !== resolvedSchema.const) {
      throw new Error(
        `${schemaName} validation failed at ${path}: expected constant value ${JSON.stringify(
          resolvedSchema.const
        )}.`
      );
    }
  }

  if (resolvedSchema.type === "object") {
    ensureObject(value, schemaName, path);
    const obj = value as Record<string, unknown>;

    const properties = resolvedSchema.properties ?? {};
    const required = allowPartial ? [] : resolvedSchema.required ?? [];
    const additional = resolvedSchema.additionalProperties;
    const patterns = resolvedSchema.patternProperties ?? {};

    for (const key of required) {
      if (!(key in obj)) {
        throw new Error(
          `${schemaName} validation failed at ${path}: missing required key "${key}".`
        );
      }
    }

    for (const [key, val] of Object.entries(obj)) {
      if (key in properties) {
        validate(val, properties[key], rootSchema, schemaName, `${path}.${key}`, allowPartial);
        continue;
      }

      const matchedPattern = findMatchingPattern(patterns, key);
      if (matchedPattern) {
        validate(val, matchedPattern, rootSchema, schemaName, `${path}.${key}`, allowPartial);
        continue;
      }

      if (additional === false) {
        throw new Error(
          `${schemaName} validation failed at ${path}: unknown key "${key}".`
        );
      }

      if (isJsonSchema(additional)) {
        validate(val, additional, rootSchema, schemaName, `${path}.${key}`, allowPartial);
      }
    }

    return;
  }

  if (resolvedSchema.type === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`${schemaName} validation failed at ${path}: expected array.`);
    }

    if (
      typeof resolvedSchema.minItems === "number" &&
      value.length < resolvedSchema.minItems
    ) {
      throw new Error(
        `${schemaName} validation failed at ${path}: expected at least ${resolvedSchema.minItems} item(s).`
      );
    }

    if (
      typeof resolvedSchema.maxItems === "number" &&
      value.length > resolvedSchema.maxItems
    ) {
      throw new Error(
        `${schemaName} validation failed at ${path}: expected at most ${resolvedSchema.maxItems} item(s).`
      );
    }

    if (resolvedSchema.items) {
      value.forEach((item, index) =>
        validate(
          item,
          resolvedSchema.items as JsonSchema,
          rootSchema,
          schemaName,
          `${path}[${index}]`,
          allowPartial
        )
      );
    }
    return;
  }

  if (resolvedSchema.type === "string") {
    if (typeof value !== "string") {
      throw new Error(`${schemaName} validation failed at ${path}: expected string.`);
    }

    if (
      typeof resolvedSchema.minLength === "number" &&
      value.length < resolvedSchema.minLength
    ) {
      throw new Error(
        `${schemaName} validation failed at ${path}: expected string minLength ${resolvedSchema.minLength}.`
      );
    }

    if (resolvedSchema.enum && !resolvedSchema.enum.includes(value)) {
      throw new Error(
        `${schemaName} validation failed at ${path}: value must be one of ${resolvedSchema.enum.join(
          ", "
        )}.`
      );
    }

    return;
  }

  if (resolvedSchema.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${schemaName} validation failed at ${path}: expected boolean.`);
    }
    return;
  }

  // If no type specified, accept any.
}

function resolveRef(
  schema: JsonSchema,
  rootSchema: JsonSchema,
  schemaName: string,
  path: string
): JsonSchema {
  if (!schema.$ref) {
    return schema;
  }

  const ref = schema.$ref;
  const prefix = "#/$defs/";

  if (!ref.startsWith(prefix)) {
    throw new Error(
      `${schemaName} validation failed at ${path}: unsupported $ref "${ref}".`
    );
  }

  const defName = ref.slice(prefix.length);
  const target = rootSchema.$defs?.[defName];

  if (!target) {
    throw new Error(
      `${schemaName} validation failed at ${path}: missing $defs entry for "${defName}".`
    );
  }

  return target;
}

function findMatchingPattern(
  patterns: Record<string, JsonSchema>,
  key: string
): JsonSchema | undefined {
  for (const [pattern, schema] of Object.entries(patterns)) {
    const regex = new RegExp(pattern);
    if (regex.test(key)) {
      return schema;
    }
  }
  return undefined;
}

function ensureObject(value: unknown, schemaName: string, path: string): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${schemaName} validation failed at ${path}: expected object.`);
  }
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null;
}
