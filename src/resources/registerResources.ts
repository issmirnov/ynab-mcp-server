import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as ynab from "ynab";
import { getValidAccessToken } from "../auth/ynab.js";
import type { AuthProps } from "../auth/types.js";
import { readYnabResource } from "./ynabResources.js";

const FIXED_RESOURCES = [
  {
    name: "ynab_budgets_resource",
    uri: "ynab://budgets",
    title: "YNAB Plans",
    description: "Read the authenticated user's available YNAB plans.",
  },
  {
    name: "ynab_default_budget_resource",
    uri: "ynab://budgets/default",
    title: "Default YNAB Plan",
    description: "Read the resolved default YNAB plan for the authenticated user.",
  },
  {
    name: "ynab_default_categories_resource",
    uri: "ynab://budgets/default/categories",
    title: "Default Plan Categories",
    description: "Read grouped categories for the authenticated user's default YNAB plan.",
  },
  {
    name: "ynab_default_current_month_resource",
    uri: "ynab://budgets/default/month/current",
    title: "Default Plan Current Month",
    description: "Read current-month summary data for the authenticated user's default YNAB plan.",
  },
] as const;

export function registerYnabResources(server: McpServer, env: Env, props: AuthProps) {
  for (const resource of FIXED_RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: "application/json",
      },
      async (uri) => {
        const accessToken = await getValidAccessToken(env, props.ynabUserId);
        const api = new ynab.API(accessToken);
        return readYnabResource(uri, env, props, api);
      }
    );
  }
}
