import { deleteCacheKeys } from "../cache/kvCache.js";
import {
  getBudgetsCacheKey,
  getCategoriesCacheKey,
  getDefaultBudgetCacheKey,
  getMonthCacheKey,
} from "./cacheKeys.js";
import { normalizeMonth } from "../utils/commonUtils.js";

function monthFromInput(input: Record<string, unknown>) {
  if (typeof input.month === "string") {
    return normalizeMonth(input.month);
  }

  if (typeof input.date === "string") {
    return normalizeMonth(input.date);
  }

  return normalizeMonth("current");
}

export async function invalidateBudgetPreferenceCaches(
  kv: KVNamespace,
  ynabUserId: string
) {
  await deleteCacheKeys(kv, [
    getBudgetsCacheKey(ynabUserId),
    getDefaultBudgetCacheKey(ynabUserId),
  ]);
}

export async function invalidateBudgetScopedCaches(
  kv: KVNamespace,
  ynabUserId: string,
  budgetId: string,
  input: Record<string, unknown>
) {
  const month = monthFromInput(input);

  await deleteCacheKeys(kv, [
    getDefaultBudgetCacheKey(ynabUserId),
    getCategoriesCacheKey(ynabUserId, budgetId),
    getMonthCacheKey(ynabUserId, budgetId, month),
    getMonthCacheKey(ynabUserId, budgetId, "current"),
  ]);
}
