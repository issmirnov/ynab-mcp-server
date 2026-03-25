import { z, type ZodRawShape, type ZodTypeAny } from "zod";

type JSONSchema = {
  type?: string;
  enum?: unknown[];
  pattern?: string;
  items?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  required?: string[];
};

function schemaToZod(schema: JSONSchema | undefined): ZodTypeAny {
  if (!schema) {
    return z.any();
  }

  if (schema.enum?.length) {
    const values = schema.enum.filter((value): value is string => typeof value === "string");
    if (values.length === schema.enum.length && values.length > 0) {
      return z.enum(values as [string, ...string[]]);
    }
    return z.any();
  }

  switch (schema.type) {
    case "string": {
      let stringSchema = z.string();
      if (schema.pattern) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      return stringSchema;
    }
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schemaToZod(schema.items));
    case "object":
      return jsonSchemaObjectToZod(schema);
    default:
      return z.any();
  }
}

export function jsonSchemaObjectToZodShape(schema: JSONSchema | undefined): ZodRawShape {
  const shape: Record<string, ZodTypeAny> = {};
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);

  for (const [key, value] of Object.entries(properties)) {
    const propSchema = schemaToZod(value);
    shape[key] = required.has(key) ? propSchema : propSchema.optional();
  }

  return shape;
}

export function jsonSchemaObjectToZod(schema: JSONSchema | undefined) {
  return z.object(jsonSchemaObjectToZodShape(schema));
}
