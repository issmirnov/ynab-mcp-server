import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

class ListBudgetsTool {
  private api: ynab.API;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  getToolDefinition(): Tool {
    return {
      name: "list_budgets",
      description: "Lists all available budgets from YNAB API",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    };
  }

  async execute(args: any) {
    try {
      if (!process.env.YNAB_API_TOKEN) {
        return {
          content: [
            {
              type: "text",
              text: "YNAB API Token is not set",
            },
          ],
        };
      }

      console.error("Listing budgets");
      const budgetsResponse = await this.api.budgets.getBudgets();
      console.error(`Found ${budgetsResponse.data.budgets.length} budgets`);

      const budgets = budgetsResponse.data.budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(budgets, null, 2),
          },
        ],
      };
    } catch (error: unknown) {
      console.error(`Error listing budgets: ${JSON.stringify(error)}`);
      return {
        content: [
          {
            type: "text",
            text: `Error listing budgets: ${JSON.stringify(error)}`,
          },
        ],
      };
    }
  }
}

export default ListBudgetsTool;
