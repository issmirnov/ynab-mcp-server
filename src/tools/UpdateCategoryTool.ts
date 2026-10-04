import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { findCategory, findCategoryGroup } from "../utils/categoryLookup.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface UpdateCategoryInput {
  budgetId?: string;
  categoryId?: string;
  categoryName?: string;
  newName?: string;
  note?: string;
  categoryGroupId?: string;
  categoryGroupName?: string;
  response_format?: "json" | "markdown";
}

interface UpdateCategoryResult {
  success: boolean;
  categoryId: string;
  name: string;
  categoryGroupId: string;
  changes: string[];
  message: string;
}

class UpdateCategoryTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_update_category",
      description:
        "Updates an existing category in a YNAB budget: rename it, edit its note, and/or move it to a different category group. Identify the category by categoryId or categoryName, and (to move it) the destination group by categoryGroupId or categoryGroupName. Names are matched case-insensitively, exact match first then partial. To change goal targets use ynab_set_category_goals instead.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget containing the category. Optional when a default budget is set or only one budget exists.",
          },
          categoryId: {
            type: "string",
            description: "The ID of the category to update (optional if categoryName is provided).",
          },
          categoryName: {
            type: "string",
            description:
              "The name of the category to update (optional if categoryId is provided). Supports partial matching.",
          },
          newName: {
            type: "string",
            description: "A new name for the category (optional).",
          },
          note: {
            type: "string",
            description: "A new note for the category (optional).",
          },
          categoryGroupId: {
            type: "string",
            description:
              "Move the category to this category group by ID (optional if categoryGroupName is provided).",
          },
          categoryGroupName: {
            type: "string",
            description:
              "Move the category to the group with this name (optional if categoryGroupId is provided). Supports partial matching.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        required: [],
        additionalProperties: false,
      },
      annotations: {
        title: "Update Category",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: UpdateCategoryInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if (!input.categoryId && !input.categoryName) {
        return this.error("Either categoryId or categoryName must be provided.");
      }

      const wantsMove = Boolean(input.categoryGroupId || input.categoryGroupName);
      const hasChange =
        input.newName !== undefined || input.note !== undefined || wantsMove;
      if (!hasChange) {
        return this.error(
          "Nothing to update. Provide at least one of newName, note, categoryGroupId, or categoryGroupName."
        );
      }

      // A single categories read covers resolving the category by name and/or
      // the destination group by name.
      const categoriesResponse = await createRetryableAPICall(
        () => this.api.categories.getCategories(budgetId),
        "Get categories for update"
      );
      const groups = categoriesResponse.data.category_groups;

      const resolved = findCategory(groups, {
        id: input.categoryId,
        name: input.categoryName,
      });
      if (!resolved) {
        const which = input.categoryId
          ? `id "${input.categoryId}"`
          : `name "${input.categoryName}"`;
        return this.error(
          `Category not found by ${which}. Use ynab_list_categories to see available categories.`
        );
      }

      const changes: string[] = [];
      const update: ynab.ExistingCategory = {};

      if (input.newName !== undefined && input.newName !== resolved.category.name) {
        update.name = input.newName;
        changes.push(`name: "${resolved.category.name}" → "${input.newName}"`);
      }

      if (input.note !== undefined && input.note !== (resolved.category.note ?? undefined)) {
        update.note = input.note;
        changes.push("note updated");
      }

      if (wantsMove) {
        const targetGroup = findCategoryGroup(groups, {
          id: input.categoryGroupId,
          name: input.categoryGroupName,
        });
        if (!targetGroup) {
          const which = input.categoryGroupId
            ? `id "${input.categoryGroupId}"`
            : `name "${input.categoryGroupName}"`;
          return this.error(
            `Destination category group not found by ${which}. Use ynab_list_categories to see available groups.`
          );
        }
        if (targetGroup.id !== resolved.group.id) {
          update.category_group_id = targetGroup.id;
          changes.push(`moved: "${resolved.group.name}" → "${targetGroup.name}"`);
        }
      }

      if (changes.length === 0) {
        return this.error("No changes needed — the category already matches the requested values.");
      }

      const data: ynab.PatchCategoryWrapper = { category: update };
      const response = await createRetryableAPICall(
        () => this.api.categories.updateCategory(budgetId, resolved.category.id, data),
        "Update category"
      );

      const category = response.data.category ?? resolved.category;
      const result: UpdateCategoryResult = {
        success: true,
        categoryId: category.id,
        name: category.name,
        categoryGroupId: category.category_group_id,
        changes,
        message: `Category "${category.name}" updated successfully`,
      };

      const format = input.response_format || "markdown";
      const responseText =
        format === "json" ? JSON.stringify(result, null, 2) : this.formatMarkdown(result);

      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return this.error(
        `Error updating category: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: UpdateCategoryResult): string {
    let output = "# Category Updated\n\n";
    output += `✅ ${result.message}\n\n`;
    output += `**Name:** ${result.name}\n`;
    output += `**Category ID:** \`${result.categoryId}\`\n`;
    output += `**Category Group ID:** \`${result.categoryGroupId}\`\n\n`;
    output += `## Changes\n`;
    for (const change of result.changes) {
      output += `- ${change}\n`;
    }
    return output;
  }
}

export default UpdateCategoryTool;
