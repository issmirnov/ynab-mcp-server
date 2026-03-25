import * as ynab from "ynab";
import type { StoredUserPreferences } from "./types.js";

function getUserPreferencesKey(ynabUserId: string) {
  return `ynab:prefs:${ynabUserId}`;
}

export async function loadUserPreferences(kv: KVNamespace, ynabUserId: string) {
  const raw = await kv.get(getUserPreferencesKey(ynabUserId));
  return raw ? (JSON.parse(raw) as StoredUserPreferences) : {};
}

export async function saveUserPreferences(
  kv: KVNamespace,
  ynabUserId: string,
  preferences: StoredUserPreferences
) {
  await kv.put(getUserPreferencesKey(ynabUserId), JSON.stringify(preferences));
}

export async function deleteUserPreferences(kv: KVNamespace, ynabUserId: string) {
  await kv.delete(getUserPreferencesKey(ynabUserId));
}

export async function resolveBudgetSelection(
  kv: KVNamespace,
  ynabUserId: string,
  api: ynab.API,
  requestedBudgetId?: string
) {
  if (requestedBudgetId) {
    return requestedBudgetId;
  }

  const preferences = await loadUserPreferences(kv, ynabUserId);
  if (preferences.defaultBudgetId) {
    return preferences.defaultBudgetId;
  }

  const budgetsResponse = await api.budgets.getBudgets();
  const budgets = budgetsResponse.data.budgets;

  if (budgets.length === 1) {
    const [budget] = budgets;

    await saveUserPreferences(kv, ynabUserId, {
      ...preferences,
      defaultBudgetId: budget.id,
      defaultBudgetName: budget.name,
    });

    return budget.id;
  }

  throw new Error(
    "Multiple budgets found. Set a default budget with ynab_set_default_budget or pass budgetId explicitly."
  );
}
