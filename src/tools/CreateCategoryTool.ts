import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { findCategoryGroup } from "../utils/categoryLookup.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface CreateCategoryInput {
  budgetId?: string;
  name: string;
  categoryGroupId?: string;
  categoryGroupName?: string;
  note?: string;
  response_format?: "json" | "markdown";
}

interface CreateCategoryResult {
  success: boolean;
  categoryId: string;
  name: string;
  categoryGroupId: string;
  categoryGroupName?: string;
  message: string;
}

class CreateCategoryTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_create_category",
      description:
        "Creates a new category inside an existing category group in a YNAB budget. Provide the target group by categoryGroupId or categoryGroupName (names are matched case-insensitively, exact match first, then partial). Create a group first with ynab_create_category_group if needed.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget to create the category in. Optional when a default budget is set or only one budget exists.",
          },
          name: {
            type: "string",
            description: "The name of the category to create.",
          },
          categoryGroupId: {
            type: "string",
            description:
              "The ID of the category group to create the category in (optional if categoryGroupName is provided).",
          },
          categoryGroupName: {
            type: "string",
            description:
              "The name of the category group to create the category in (optional if categoryGroupId is provided). Supports partial matching.",
          },
          note: {
            type: "string",
            description: "Optional note to attach to the new category.",
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
        title: "Create Category",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: CreateCategoryInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      const name = (input.name || "").trim();
      if (!name) {
        return this.error("A non-empty 'name' is required to create a category.");
      }
      if (!input.categoryGroupId && !input.categoryGroupName) {
        return this.error(
          "Either categoryGroupId or categoryGroupName must be provided to choose the target group."
        );
      }

      // Resolve the target group. If an id is supplied, trust it (the API
      // validates). If only a name is supplied, look it up.
      let categoryGroupId = input.categoryGroupId;
      let categoryGroupName: string | undefined;

      if (!categoryGroupId && input.categoryGroupName) {
        const categoriesResponse = await createRetryableAPICall(
          () => this.api.categories.getCategories(budgetId),
          "Get categories for group resolution"
        );
        const group = findCategoryGroup(categoriesResponse.data.category_groups, {
          name: input.categoryGroupName,
        });
        if (!group) {
          return this.error(
            `Category group not found: "${input.categoryGroupName}". Use ynab_list_categories to see available groups, or create one with ynab_create_category_group.`
          );
        }
        categoryGroupId = group.id;
        categoryGroupName = group.name;
      }

      const data: ynab.PostCategoryWrapper = {
        category: {
          name,
          category_group_id: categoryGroupId!,
          note: input.note,
        },
      };

      const response = await createRetryableAPICall(
        () => this.api.categories.createCategory(budgetId, data),
        "Create category"
      );

      const category = response.data.category;
      if (!category) {
        throw new Error("Failed to create category - no data returned");
      }

      const result: CreateCategoryResult = {
        success: true,
        categoryId: category.id,
        name: category.name,
        categoryGroupId: category.category_group_id,
        categoryGroupName,
        message: `Category "${category.name}" created successfully`,
      };

      const format = input.response_format || "markdown";
      const responseText =
        format === "json" ? JSON.stringify(result, null, 2) : this.formatMarkdown(result);

      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return this.error(
        `Error creating category: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: CreateCategoryResult): string {
    let output = "# Category Created\n\n";
    output += `✅ ${result.message}\n\n`;
    output += `**Name:** ${result.name}\n`;
    output += `**Category ID:** \`${result.categoryId}\`\n`;
    if (result.categoryGroupName) {
      output += `**Group:** ${result.categoryGroupName}\n`;
    }
    output += `**Category Group ID:** \`${result.categoryGroupId}\`\n`;
    return output;
  }
}

export default CreateCategoryTool;
