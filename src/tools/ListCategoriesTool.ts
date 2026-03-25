import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CHARACTER_LIMIT, getBudgetId, truncateResponse } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface ListCategoriesInput {
  budgetId?: string;
  includeHidden?: boolean;
  response_format?: "json" | "markdown";
}

class ListCategoriesTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_list_categories",
      description: "List budget categories for the selected budget.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to list categories for. Optional when a default budget is set or only one budget exists.",
          },
          includeHidden: {
            type: "boolean",
            default: false,
            description: "Whether to include hidden categories.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description: "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "List Budget Categories",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: ListCategoriesInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);
      const includeHidden = input.includeHidden === true;
      const categoriesResponse = await createRetryableAPICall(
        () => this.api.categories.getCategories(budgetId),
        "List categories"
      );

      const groups = categoriesResponse.data.category_groups
        .map((group) => ({
          id: group.id,
          name: group.name,
          categories: group.categories.filter(
            (category) =>
              category.deleted === false &&
              (includeHidden || category.hidden === false) &&
              !category.name.includes("Inflow:") &&
              category.name !== "Uncategorized" &&
              !category.name.includes("Deferred Income")
          ),
        }))
        .filter((group) => group.categories.length > 0);

      const format = input.response_format || "markdown";
      const responseText =
        format === "json" ? JSON.stringify(groups, null, 2) : this.formatMarkdown(groups);
      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);

      return {
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error: unknown) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error listing categories: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
          },
        ],
      };
    }
  }

  private formatMarkdown(
    groups: Array<{
      id?: string | null;
      name?: string | null;
      categories: ynab.Category[];
    }>
  ) {
    let output = "# Budget Categories\n\n";

    for (const group of groups) {
      output += `## ${group.name}\n\n`;

      for (const category of group.categories) {
        output += `- ${category.name}\n`;
      }

      output += "\n";
    }

    return output.trim();
  }
}

export default ListCategoriesTool;
