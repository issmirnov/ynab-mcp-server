import * as ynab from "ynab";

export interface ToolRuntimeConfig {
  ynabApi?: ynab.API;
  budgetId?: string;
  hasToken?: boolean;
  env?: Env;
  ynabUserId?: string;
}

export function createToolRuntime(config?: ToolRuntimeConfig) {
  return {
    api: config?.ynabApi ?? new ynab.API(process.env.YNAB_API_TOKEN || ""),
    budgetId: config?.budgetId,
    hasToken: config?.hasToken ?? Boolean(process.env.YNAB_API_TOKEN),
    env: config?.env,
    ynabUserId: config?.ynabUserId,
  };
}
