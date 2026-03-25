import { describe, expect, it } from "vitest";
import { getBudgetId } from "../src/utils/commonUtils.js";

describe("getBudgetId", () => {
  it("prefers explicit budget id", () => {
    expect(getBudgetId("explicit-id", "default-id")).toBe("explicit-id");
  });

  it("falls back to runtime default budget id", () => {
    expect(getBudgetId(undefined, "default-id")).toBe("default-id");
  });

  it("throws when no budget id is available", () => {
    expect(() => getBudgetId(undefined, undefined)).toThrow(/Budget ID is required/);
  });
});
