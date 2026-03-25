import * as ynab from "ynab";

export interface ToolRuntimeConfig {
  ynabApi?: ynab.API;
  budgetId?: string;
  hasToken?: boolean;
}

export function createToolRuntime(config?: ToolRuntimeConfig) {
  return {
    api: config?.ynabApi ?? new ynab.API(process.env.YNAB_API_TOKEN || ""),
    budgetId: config?.budgetId ?? process.env.YNAB_BUDGET_ID,
    hasToken: config?.hasToken ?? Boolean(process.env.YNAB_API_TOKEN),
  };
}
