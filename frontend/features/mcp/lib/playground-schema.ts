export type SimpleParameter = {
  name: string;
  type: "string" | "integer" | "number";
  description: string;
  required: boolean;
  minimum?: number;
  maximum?: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Unsupported constraints stay in JSON mode and are validated by the backend.
export function simpleParameters(schema: Record<string, unknown> | null): SimpleParameter[] | null {
  if (
    !schema ||
    Object.keys(schema).some(
      (key) =>
        ![
          "type",
          "properties",
          "required",
          "additionalProperties",
          "title",
          "description",
          "$schema",
        ].includes(key),
    )
  )
    return null;
  if (schema.type !== undefined && schema.type !== "object") return null;
  if (isObject(schema.additionalProperties)) return null;
  const properties = schema.properties ?? {};
  if (!isObject(properties)) return null;
  const parameters: SimpleParameter[] = [];
  for (const [name, property] of Object.entries(properties)) {
    if (
      !isObject(property) ||
      !["string", "integer", "number"].includes(String(property.type)) ||
      Object.keys(property).some(
        (key) => !["type", "description", "title", "default", "minimum", "maximum"].includes(key),
      )
    )
      return null;
    parameters.push({
      name,
      type: property.type as SimpleParameter["type"],
      description: typeof property.description === "string" ? property.description : "",
      required: Array.isArray(schema.required) && schema.required.includes(name),
      minimum: typeof property.minimum === "number" ? property.minimum : undefined,
      maximum: typeof property.maximum === "number" ? property.maximum : undefined,
    });
  }
  return parameters;
}

function defaults(schema: Record<string, unknown>): Record<string, unknown> {
  if (isObject(schema.default)) return schema.default;
  if (!isObject(schema.properties)) return {};
  return Object.fromEntries(
    Object.entries(schema.properties).flatMap(([name, property]) => {
      if (!isObject(property)) return [];
      // Compacted MCP schemas can advertise null defaults for non-null types.
      if (
        Object.hasOwn(property, "default") &&
        (property.default !== null ||
          property.type === "null" ||
          (Array.isArray(property.type) && property.type.includes("null")))
      )
        return [[name, property.default]];
      if (
        property.type === "object" &&
        Array.isArray(schema.required) &&
        schema.required.includes(name)
      )
        return [[name, defaults(property)]];
      return [];
    }),
  );
}

export function defaultArguments(schema: Record<string, unknown> | null) {
  return JSON.stringify(schema ? defaults(schema) : {}, null, 2);
}

export function parseArguments(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isObject(value)) throw new Error("Arguments must be a JSON object.");
  return value;
}

export function validateArguments(
  parameters: SimpleParameter[] | null,
  arguments_: Record<string, unknown>,
) {
  const errors: Record<string, string> = {};
  for (const parameter of parameters ?? []) {
    const value = arguments_[parameter.name];
    if (value === undefined) {
      if (parameter.required) errors[parameter.name] = `${parameter.name} is required.`;
    } else if (
      parameter.type === "string"
        ? typeof value !== "string"
        : typeof value !== "number" ||
          !Number.isFinite(value) ||
          (parameter.type === "integer" && !Number.isInteger(value))
    ) {
      errors[parameter.name] = `Enter a valid ${parameter.type}.`;
    } else if (
      typeof value === "number" &&
      ((parameter.minimum !== undefined && value < parameter.minimum) ||
        (parameter.maximum !== undefined && value > parameter.maximum))
    ) {
      errors[parameter.name] = "Value is outside the allowed range.";
    }
  }
  return errors;
}
