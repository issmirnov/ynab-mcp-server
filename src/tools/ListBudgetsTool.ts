import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface ListBudgetsInput {
  response_format?: "json" | "markdown";
}

class ListBudgetsTool {
  private api: ynab.API;
  private hasToken: boolean;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.hasToken = runtime.hasToken;
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_list_budgets",
      description: "Lists all available budgets from YNAB API",
      inputSchema: {
        type: "object",
        properties: {
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description: "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "List YNAB Budgets",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: ListBudgetsInput) {
    try {
      if (!this.hasToken) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "YNAB API Token is not set. Please set the YNAB_API_TOKEN environment variable.",
            },
          ],
        };
      }

      console.error("Listing budgets");
      const budgetsResponse = await createRetryableAPICall(
        () => this.api.budgets.getBudgets(),
        'List budgets'
      );
      console.error(`Found ${budgetsResponse.data.budgets.length} budgets`);

      const budgets = budgetsResponse.data.budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
      }));

      const format = input.response_format || "markdown";
      let responseText: string;

      if (format === "json") {
        responseText = JSON.stringify(budgets, null, 2);
      } else {
        responseText = this.formatMarkdown(budgets);
      }

      const { text, wasTruncated } = truncateResponse(responseText, CHARACTER_LIMIT);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error: unknown) {
      console.error(`Error listing budgets: ${JSON.stringify(error)}`);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error listing budgets: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`,
          },
        ],
      };
    }
  }

  private formatMarkdown(budgets: Array<{ id: string; name: string }>): string {
    let output = "# Available YNAB Budgets\n\n";
    output += `Found ${budgets.length} budget(s):\n\n`;

    for (const budget of budgets) {
      output += `- **${budget.name}**\n`;
      output += `  - ID: \`${budget.id}\`\n`;
    }

    return output;
  }
}

export default ListBudgetsTool;
