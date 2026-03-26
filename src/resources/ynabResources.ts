import * as ynab from "ynab";
import { getOrSetCachedJson } from "../cache/kvCache.js";
import { loadUserPreferences } from "../auth/preferences.js";
import type { AuthProps } from "../auth/types.js";
import {
  getBudgetsCacheKey,
  getCategoriesCacheKey,
  getDefaultBudgetCacheKey,
  getMonthCacheKey,
  RESOURCE_CACHE_TTLS,
} from "./cacheKeys.js";
import { normalizeMonth } from "../utils/commonUtils.js";

type BudgetListData = {
  budgets: Array<{ id: string; name: string }>;
};

type DefaultBudgetData = {
  budget: { id: string; name: string };
  selectionSource: "user_preference" | "ynab_default";
};

type CategoriesData = {
  budgetId: string;
  groups: Array<{
    id?: string | null;
    name?: string | null;
    categories: Array<{
      id: string;
      name: string;
      hidden: boolean;
    }>;
  }>;
};

type CurrentMonthData = {
  budgetId: string;
  month: string;
  summary: {
    income: number;
    budgeted: number;
    activity: number;
    toBeBudgeted: number;
    ageOfMoney: number | null;
  };
};

async function listBudgets(env: Env, props: AuthProps, api: ynab.API) {
  const cached = await getOrSetCachedJson<BudgetListData>(
    env.OAUTH_KV,
    getBudgetsCacheKey(props.ynabUserId),
    RESOURCE_CACHE_TTLS.budgets,
    async () => {
      const budgetsResponse = await api.budgets.getBudgets();
      return {
        budgets: budgetsResponse.data.budgets.map((budget) => ({
          id: budget.id,
          name: budget.name,
        })),
      };
    }
  );

  return cached.data;
}

async function resolveDefaultBudgetData(env: Env, props: AuthProps, api: ynab.API) {
  const cached = await getOrSetCachedJson<DefaultBudgetData>(
    env.OAUTH_KV,
    getDefaultBudgetCacheKey(props.ynabUserId),
    RESOURCE_CACHE_TTLS.defaultBudget,
    async () => {
      const preferences = await loadUserPreferences(env.OAUTH_KV, props.ynabUserId);
      const budgets = await listBudgets(env, props, api);

      if (preferences.defaultBudgetId) {
        const budget = budgets.budgets.find((item) => item.id === preferences.defaultBudgetId);
        if (budget) {
          return {
            budget,
            selectionSource: "user_preference" as const,
          };
        }
      }

      const budgetResponse = await api.budgets.getBudgetById("default");
      const budget = budgetResponse.data.budget;

      return {
        budget: {
          id: budget.id,
          name: budget.name,
        },
        selectionSource: "ynab_default" as const,
      };
    }
  );

  return cached.data;
}

function getDefaultBudgetReadTarget(defaultBudget: DefaultBudgetData) {
  return defaultBudget.selectionSource === "user_preference"
    ? defaultBudget.budget.id
    : "default";
}

async function getDefaultCategories(env: Env, props: AuthProps, api: ynab.API) {
  const defaultBudget = await resolveDefaultBudgetData(env, props, api);
  const budgetReadTarget = getDefaultBudgetReadTarget(defaultBudget);
  const cached = await getOrSetCachedJson<CategoriesData>(
    env.OAUTH_KV,
    getCategoriesCacheKey(props.ynabUserId, budgetReadTarget),
    RESOURCE_CACHE_TTLS.categories,
    async () => {
      const categoriesResponse = await api.categories.getCategories(budgetReadTarget);

      return {
        budgetId: defaultBudget.budget.id,
        groups: categoriesResponse.data.category_groups
          .map((group) => ({
            id: group.id,
            name: group.name,
            categories: group.categories
              .filter(
                (category) =>
                  category.deleted === false &&
                  category.hidden === false &&
                  !category.name.includes("Inflow:") &&
                  category.name !== "Uncategorized" &&
                  !category.name.includes("Deferred Income")
              )
              .map((category) => ({
                id: category.id,
                name: category.name,
                hidden: category.hidden ?? false,
              })),
          }))
          .filter((group) => group.categories.length > 0),
      };
    }
  );

  return cached.data;
}

async function getCurrentMonth(env: Env, props: AuthProps, api: ynab.API) {
  const defaultBudget = await resolveDefaultBudgetData(env, props, api);
  const budgetReadTarget = getDefaultBudgetReadTarget(defaultBudget);
  const normalizedMonth = normalizeMonth("current");
  const cached = await getOrSetCachedJson<CurrentMonthData>(
    env.OAUTH_KV,
    getMonthCacheKey(props.ynabUserId, budgetReadTarget, normalizedMonth),
    RESOURCE_CACHE_TTLS.month,
    async () => {
      const monthResponse = await api.months.getBudgetMonth(budgetReadTarget, normalizedMonth);
      const month = monthResponse.data.month;

      return {
        budgetId: defaultBudget.budget.id,
        month: month.month,
        summary: {
          income: month.income / 1000,
          budgeted: month.budgeted / 1000,
          activity: month.activity / 1000,
          toBeBudgeted: month.to_be_budgeted / 1000,
          ageOfMoney: month.age_of_money ?? null,
        },
      };
    }
  );

  return cached.data;
}

function asTextResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export async function readYnabResource(uri: URL, env: Env, props: AuthProps, api: ynab.API) {
  switch (uri.toString()) {
    case "ynab://budgets":
      return asTextResource(uri.toString(), await listBudgets(env, props, api));
    case "ynab://budgets/default":
      return asTextResource(uri.toString(), await resolveDefaultBudgetData(env, props, api));
    case "ynab://budgets/default/categories":
      return asTextResource(uri.toString(), await getDefaultCategories(env, props, api));
    case "ynab://budgets/default/month/current":
      return asTextResource(uri.toString(), await getCurrentMonth(env, props, api));
    default:
      throw new Error(`Unsupported resource URI: ${uri.toString()}`);
  }
}
