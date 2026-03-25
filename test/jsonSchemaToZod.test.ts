import { describe, expect, it } from "vitest";
import { jsonSchemaObjectToZodShape } from "../src/utils/jsonSchemaToZod.js";

describe("jsonSchemaObjectToZodShape", () => {
  it("maps required and optional properties", () => {
    const shape = jsonSchemaObjectToZodShape({
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    });

    expect(shape.name.safeParse("Ivan").success).toBe(true);
    expect(shape.name.safeParse(undefined).success).toBe(false);
    expect(shape.age.safeParse(undefined).success).toBe(true);
  });
});
