import * as ynab from "ynab";

export interface ToolRuntimeConfig {
  ynabApi?: ynab.API;
  budgetId?: string;
  hasToken?: boolean;
  env?: Env;
  ynabUserId?: string;
  accessToken?: string;
}

export function createToolRuntime(config?: ToolRuntimeConfig) {
  const token = config?.accessToken || process.env.YNAB_API_TOKEN || "";
  return {
    api: config?.ynabApi ?? new ynab.API(token),
    budgetId: config?.budgetId,
    hasToken: config?.hasToken ?? Boolean(process.env.YNAB_API_TOKEN),
    env: config?.env,
    ynabUserId: config?.ynabUserId,
    accessToken: token,
  };
}
