import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface CreateCategoryGroupInput {
  budgetId?: string;
  name: string;
  response_format?: "json" | "markdown";
}

interface CreateCategoryGroupResult {
  success: boolean;
  categoryGroupId: string;
  name: string;
  message: string;
}

class CreateCategoryGroupTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_create_category_group",
      description:
        "Creates a new category group in a YNAB budget. Category groups organize related categories (for example 'Monthly Bills' or 'Savings Goals'). Use ynab_create_category to add categories to the group afterwards.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget to create the category group in. Optional when a default budget is set or only one budget exists.",
          },
          name: {
            type: "string",
            description: "The name of the category group to create (maximum 50 characters).",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
      annotations: {
        title: "Create Category Group",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: CreateCategoryGroupInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      const name = (input.name || "").trim();
      if (!name) {
        return this.error("A non-empty 'name' is required to create a category group.");
      }
      if (name.length > 50) {
        return this.error("Category group name must be 50 characters or fewer.");
      }

      const data: ynab.PostCategoryGroupWrapper = { category_group: { name } };

      const response = await createRetryableAPICall(
        () => this.api.categories.createCategoryGroup(budgetId, data),
        "Create category group"
      );

      const group = response.data.category_group;
      if (!group) {
        throw new Error("Failed to create category group - no data returned");
      }

      const result: CreateCategoryGroupResult = {
        success: true,
        categoryGroupId: group.id,
        name: group.name,
        message: `Category group "${group.name}" created successfully`,
      };

      const format = input.response_format || "markdown";
      const responseText =
        format === "json" ? JSON.stringify(result, null, 2) : this.formatMarkdown(result);

      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return this.error(
        `Error creating category group: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: CreateCategoryGroupResult): string {
    let output = "# Category Group Created\n\n";
    output += `✅ ${result.message}\n\n`;
    output += `**Name:** ${result.name}\n`;
    output += `**Category Group ID:** \`${result.categoryGroupId}\`\n`;
    return output;
  }
}

export default CreateCategoryGroupTool;
