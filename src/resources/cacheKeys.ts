import { normalizeMonth } from "../utils/commonUtils.js";

export const RESOURCE_CACHE_TTLS = {
  budgets: 300,
  defaultBudget: 300,
  categories: 120,
  month: 60,
} as const;

export function getBudgetsCacheKey(ynabUserId: string) {
  return `cache:v1:ynab:${ynabUserId}:budgets`;
}

export function getDefaultBudgetCacheKey(ynabUserId: string) {
  return `cache:v1:ynab:${ynabUserId}:default-budget`;
}

export function getCategoriesCacheKey(ynabUserId: string, budgetId: string) {
  return `cache:v1:ynab:${ynabUserId}:budget:${budgetId}:categories`;
}

export function getMonthCacheKey(ynabUserId: string, budgetId: string, month: string) {
  const normalizedMonth = normalizeMonth(month).slice(0, 7);
  return `cache:v1:ynab:${ynabUserId}:budget:${budgetId}:month:${normalizedMonth}`;
}
