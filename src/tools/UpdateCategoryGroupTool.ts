import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { findCategoryGroup } from "../utils/categoryLookup.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface UpdateCategoryGroupInput {
  budgetId?: string;
  categoryGroupId?: string;
  categoryGroupName?: string;
  name: string;
  response_format?: "json" | "markdown";
}

interface UpdateCategoryGroupResult {
  success: boolean;
  categoryGroupId: string;
  name: string;
  previousName?: string;
  message: string;
}

class UpdateCategoryGroupTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_update_category_group",
      description:
        "Renames an existing category group in a YNAB budget. Identify the group by categoryGroupId or categoryGroupName (names are matched case-insensitively, exact match first then partial). Only the name can be changed.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget containing the category group. Optional when a default budget is set or only one budget exists.",
          },
          categoryGroupId: {
            type: "string",
            description:
              "The ID of the category group to rename (optional if categoryGroupName is provided).",
          },
          categoryGroupName: {
            type: "string",
            description:
              "The current name of the category group to rename (optional if categoryGroupId is provided). Supports partial matching.",
          },
          name: {
            type: "string",
            description: "The new name for the category group (maximum 50 characters).",
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
        title: "Update Category Group",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: UpdateCategoryGroupInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      const name = (input.name || "").trim();
      if (!name) {
        return this.error("A non-empty 'name' is required to rename a category group.");
      }
      if (name.length > 50) {
        return this.error("Category group name must be 50 characters or fewer.");
      }
      if (!input.categoryGroupId && !input.categoryGroupName) {
        return this.error("Either categoryGroupId or categoryGroupName must be provided.");
      }

      const categoriesResponse = await createRetryableAPICall(
        () => this.api.categories.getCategories(budgetId),
        "Get categories for group update"
      );
      const group = findCategoryGroup(categoriesResponse.data.category_groups, {
        id: input.categoryGroupId,
        name: input.categoryGroupName,
      });
      if (!group) {
        const which = input.categoryGroupId
          ? `id "${input.categoryGroupId}"`
          : `name "${input.categoryGroupName}"`;
        return this.error(
          `Category group not found by ${which}. Use ynab_list_categories to see available groups.`
        );
      }

      const data: ynab.PatchCategoryGroupWrapper = { category_group: { name } };
      const response = await createRetryableAPICall(
        () => this.api.categories.updateCategoryGroup(budgetId, group.id, data),
        "Update category group"
      );

      const updated = response.data.category_group ?? { id: group.id, name };
      const result: UpdateCategoryGroupResult = {
        success: true,
        categoryGroupId: updated.id,
        name: updated.name,
        previousName: group.name !== updated.name ? group.name : undefined,
        message: `Category group renamed to "${updated.name}"`,
      };

      const format = input.response_format || "markdown";
      const responseText =
        format === "json" ? JSON.stringify(result, null, 2) : this.formatMarkdown(result);

      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return this.error(
        `Error updating category group: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: UpdateCategoryGroupResult): string {
    let output = "# Category Group Updated\n\n";
    output += `✅ ${result.message}\n\n`;
    if (result.previousName) {
      output += `**Previous Name:** ${result.previousName}\n`;
    }
    output += `**Name:** ${result.name}\n`;
    output += `**Category Group ID:** \`${result.categoryGroupId}\`\n`;
    return output;
  }
}

export default UpdateCategoryGroupTool;
