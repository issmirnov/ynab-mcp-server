import { describe, expect, it, vi } from "vitest";
import { readYnabResource } from "../src/resources/ynabResources.js";
import {
  getBudgetsCacheKey,
  getCategoriesCacheKey,
  getDefaultBudgetCacheKey,
  getMonthCacheKey,
} from "../src/resources/cacheKeys.js";
import {
  invalidateBudgetPreferenceCaches,
  invalidateBudgetScopedCaches,
} from "../src/resources/invalidation.js";

function createKvStub() {
  const store = new Map<string, string>();

  return {
    store,
    kv: {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    } as unknown as KVNamespace,
  };
}

function createEnv(kv: KVNamespace) {
  return {
    OAUTH_KV: kv,
  } as Env;
}

describe("YNAB resources", () => {
  it("caches budgets resource reads", async () => {
    const { kv } = createKvStub();
    const getBudgets = vi.fn(async () => ({
      data: {
        budgets: [{ id: "budget-1", name: "Colorado" }],
      },
    }));
    const api = {
      budgets: { getBudgets },
    } as any;

    const env = createEnv(kv);
    const props = { ynabUserId: "user-1" };

    const first = await readYnabResource(new URL("ynab://budgets"), env, props, api);
    const second = await readYnabResource(new URL("ynab://budgets"), env, props, api);

    expect(getBudgets).toHaveBeenCalledTimes(1);
    expect(first.contents[0].mimeType).toBe("application/json");
    expect(second.contents[0].text).toContain("Colorado");
  });

  it("reads default categories using the stored default budget", async () => {
    const { kv, store } = createKvStub();
    store.set(
      "ynab:prefs:user-1",
      JSON.stringify({
        defaultBudgetId: "budget-1",
        defaultBudgetName: "Colorado",
      })
    );

    const api = {
      budgets: {
        getBudgets: vi.fn(async () => ({
          data: {
            budgets: [{ id: "budget-1", name: "Colorado" }],
          },
        })),
      },
      categories: {
        getCategories: vi.fn(async (budgetId: string) => ({
          data: {
            category_groups: [
              {
                id: "group-1",
                name: "Monthly Bills",
                categories: [
                  {
                    id: "cat-1",
                    name: "Rent",
                    deleted: false,
                    hidden: false,
                  },
                ],
              },
            ],
          },
        })),
      },
      months: {
        getBudgetMonth: vi.fn(),
      },
    } as any;

    const result = await readYnabResource(
      new URL("ynab://budgets/default/categories"),
      createEnv(kv),
      { ynabUserId: "user-1" },
      api
    );

    expect(api.categories.getCategories).toHaveBeenCalledWith("default");
    expect(result.contents[0].text).toContain("Rent");
  });

  it("reads default budget data from YNAB when no MCP override is stored", async () => {
    const { kv } = createKvStub();
    const api = {
      budgets: {
        getBudgets: vi.fn(async () => ({
          data: {
            budgets: [
              { id: "budget-1", name: "Colorado" },
              { id: "budget-2", name: "Business" },
            ],
          },
        })),
        getBudgetById: vi.fn(async (budgetId: string) => ({
          data: {
            budget: {
              id: "budget-1",
              name: "Colorado",
            },
          },
        })),
      },
      categories: {
        getCategories: vi.fn(),
      },
      months: {
        getBudgetMonth: vi.fn(),
      },
    } as any;

    const result = await readYnabResource(
      new URL("ynab://budgets/default"),
      createEnv(kv),
      { ynabUserId: "user-1" },
      api
    );

    expect(api.budgets.getBudgetById).toHaveBeenCalledWith("default");
    expect(result.contents[0].text).toContain("\"selectionSource\": \"ynab_default\"");
  });
});

describe("resource cache invalidation", () => {
  it("deletes preference-scoped resource cache keys", async () => {
    const { kv, store } = createKvStub();
    const userId = "user-1";

    store.set(getBudgetsCacheKey(userId), "{}");
    store.set(getDefaultBudgetCacheKey(userId), "{}");

    await invalidateBudgetPreferenceCaches(kv, userId);

    expect(store.has(getBudgetsCacheKey(userId))).toBe(false);
    expect(store.has(getDefaultBudgetCacheKey(userId))).toBe(false);
  });

  it("deletes budget-scoped resource cache keys", async () => {
    const { kv, store } = createKvStub();
    const userId = "user-1";
    const budgetId = "budget-1";

    store.set(getDefaultBudgetCacheKey(userId), "{}");
    store.set(getCategoriesCacheKey(userId, budgetId), "{}");
    store.set(getMonthCacheKey(userId, budgetId, "2026-03-01"), "{}");
    store.set(getMonthCacheKey(userId, budgetId, "current"), "{}");

    await invalidateBudgetScopedCaches(kv, userId, budgetId, {
      month: "2026-03-01",
    });

    expect(store.has(getDefaultBudgetCacheKey(userId))).toBe(false);
    expect(store.has(getCategoriesCacheKey(userId, budgetId))).toBe(false);
    expect(store.has(getMonthCacheKey(userId, budgetId, "2026-03-01"))).toBe(false);
    expect(store.has(getMonthCacheKey(userId, budgetId, "current"))).toBe(false);
  });
});
