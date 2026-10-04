import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  truncateResponse,
  CHARACTER_LIMIT,
  getBudgetId,
  amountToMilliUnits,
  milliUnitsToAmount,
  formatCurrency,
} from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { findCategory } from "../utils/categoryLookup.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface SetCategoryGoalsInput {
  budgetId?: string;
  categoryId?: string;
  categoryName?: string;
  goalTarget?: number; // dollars
  goalTargetDate?: string; // YYYY-MM-DD
  needsWholeAmount?: boolean;
  removeGoal?: boolean;
  note?: string;
  dryRun?: boolean;
  response_format?: "json" | "markdown";
  // Deprecated, accepted for backward compatibility:
  goalType?: string; // ignored — YNAB infers the goal type
  goalTargetMonth?: string; // aliased to goalTargetDate
}

type GoalAction = "created" | "updated" | "removed" | "noop";

interface SetCategoryGoalsResult {
  success: boolean;
  action: GoalAction;
  categoryId: string;
  categoryName: string;
  goalType: string | null;
  goalTarget: number | null; // milliunits
  goalTargetDollars: number | null;
  goalTargetMonth: string | null;
  changes: string[];
  dryRun: boolean;
  message: string;
}

// ynab@4.5.0 types ExistingCategory.goal_target as number only, but the YNAB API
// accepts goal_target: null to remove a goal, and null survives the SDK's
// whitelist serializer + JSON.stringify. Widen locally — same pattern as payee_id
// in UpdateTransactionTool. goal_frequency is intentionally NOT handled: the SDK's
// ExistingCategoryToJSON drops any non-whitelisted field, so it never reaches the
// wire (see docs/superpowers/specs/2026-10-03-goal-management-design.md).
type CategoryGoalPatch = Omit<ynab.ExistingCategory, "goal_target"> & {
  goal_target?: number | null;
};

export default class SetCategoryGoalsTool {
  private api: ynab.API;
  private budgetId?: string;

  constructor(budgetIdOrConfig?: string | ToolRuntimeConfig, ynabApi?: ynab.API) {
    const runtime = createToolRuntime(
      typeof budgetIdOrConfig === "string"
        ? { budgetId: budgetIdOrConfig, ynabApi }
        : budgetIdOrConfig
    );
    this.api = runtime.api;
    this.budgetId = runtime.budgetId;
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_set_category_goals",
      description:
        "Create, update, or remove a category's goal in YNAB. Set goalTarget (in dollars) to create a goal on a category that has none, or to change the target on an existing goal; set goalTargetDate and/or needsWholeAmount to adjust it; set removeGoal to clear it. Important: the YNAB API infers the goal type and only supports the NEED family — a plain target creates a 'Needed for Spending' (NEED) goal, while Credit Card Payment and loan categories get MF/DEBT automatically. Target-Balance (TB) and Target-Balance-by-Date (TBD) goals cannot be created via the API; a requested TB/TBD goal becomes a NEED goal. Recurring cadence is not supported here. Identify the category by categoryId or categoryName (case-insensitive, exact then partial).",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget to update. Optional when a default budget is set or only one budget exists.",
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
          goalTarget: {
            type: "number",
            description:
              "The goal target amount in dollars (e.g., 1000.00). On a category with no goal this CREATES a goal (type inferred by YNAB). Use 0 for a zero target; to clear a goal use removeGoal instead.",
          },
          goalTargetDate: {
            type: "string",
            description:
              "Target date in YYYY-MM-DD format (e.g., '2024-12-31'). Not supported for loan/debt categories.",
          },
          needsWholeAmount: {
            type: "boolean",
            description:
              "NEED-goal behavior: true = 'Set aside another <amount>' each period; false = 'Refill up to <amount>'. Only valid for NEED goals (not credit-card or loan categories).",
          },
          removeGoal: {
            type: "boolean",
            description:
              "If true, removes the category's existing goal. Cannot be combined with goalTarget, goalTargetDate, or needsWholeAmount.",
          },
          note: {
            type: "string",
            description: "Optional note to set on the category (applied alongside a goal change).",
          },
          dryRun: {
            type: "boolean",
            description: "If true, reports what would change without calling the API.",
            default: false,
          },
          goalType: {
            type: "string",
            enum: ["TB", "TBD", "MF", "NEED", "DEBT"],
            description:
              "DEPRECATED and ignored — the YNAB API infers the goal type. Accepted for backward compatibility; has no effect.",
          },
          goalTargetMonth: {
            type: "string",
            description: "DEPRECATED — use goalTargetDate. If provided, it is treated as goalTargetDate.",
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
        title: "Set Category Goals",
        readOnlyHint: false,
        // removeGoal permanently clears an existing goal, so this tool is not
        // purely additive — clients may warn/confirm on destructive actions.
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(
    input: SetCategoryGoalsInput
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if (!input.categoryId && !input.categoryName) {
        return this.error("Provide a categoryId or categoryName to identify the category.");
      }

      const targetDate = input.goalTargetDate ?? input.goalTargetMonth;
      const removing = input.removeGoal === true;
      const settingTarget = input.goalTarget !== undefined;
      const settingDate = targetDate !== undefined;
      const settingNeeds = input.needsWholeAmount !== undefined;
      const settingNote = input.note !== undefined;

      if (removing && (settingTarget || settingDate || settingNeeds)) {
        return this.error(
          "removeGoal cannot be combined with goalTarget, goalTargetDate, or needsWholeAmount."
        );
      }

      if (!removing && !settingTarget && !settingDate && !settingNeeds) {
        return this.error(
          "Nothing to do. Provide goalTarget, goalTargetDate, needsWholeAmount, or removeGoal (note alone is not a goal change — use ynab_update_category for notes)."
        );
      }

      const categoriesResponse = await createRetryableAPICall(
        () => this.api.categories.getCategories(budgetId),
        "Get categories for goal update"
      );
      const groups = categoriesResponse.data.category_groups;

      const resolved = findCategory(groups, { id: input.categoryId, name: input.categoryName });
      if (!resolved) {
        const which = input.categoryId ? `id "${input.categoryId}"` : `name "${input.categoryName}"`;
        return this.error(
          `Category not found by ${which}. Use ynab_list_categories or ynab_budget_summary to see available categories.`
        );
      }

      const cat = resolved.category;
      const hadGoal = Boolean(cat.goal_type);
      const currentType = cat.goal_type ? String(cat.goal_type) : null;

      // Creating a goal requires a target. goalTargetDate and needsWholeAmount only
      // configure a goal that already exists — on a goal-less category YNAB creates
      // nothing without goal_target, so without this guard we'd send a no-op PATCH
      // and falsely report "created".
      if (!removing && !hadGoal && !settingTarget) {
        return this.error(
          `Creating a goal requires goalTarget. goalTargetDate and needsWholeAmount only configure an existing goal, and "${cat.name}" has no goal yet.`
        );
      }

      // Pre-flight guards for documented API-only constraints (avoid raw 400s).
      // Only enforce when the goal type is known; for a goal-less category being
      // created, let the API infer and decide.
      if (settingNeeds && hadGoal && currentType !== "NEED") {
        return this.error(
          `needsWholeAmount is only supported for NEED goals; "${cat.name}" has a ${currentType} goal.`
        );
      }
      if (settingDate && hadGoal && currentType === "DEBT") {
        return this.error(
          `goalTargetDate is not supported for loan/debt categories; "${cat.name}" has a DEBT goal.`
        );
      }

      const update: CategoryGoalPatch = {};
      const changes: string[] = [];
      let action: GoalAction;

      if (removing) {
        if (!hadGoal) {
          return this.result(
            {
              success: true,
              action: "noop",
              categoryId: cat.id,
              categoryName: cat.name,
              goalType: null,
              goalTarget: null,
              goalTargetDollars: null,
              goalTargetMonth: null,
              changes: [],
              dryRun: Boolean(input.dryRun),
              message: `"${cat.name}" has no goal to remove.`,
            },
            input.response_format
          );
        }
        update.goal_target = null;
        changes.push(`Goal: ${currentType} → none`);
        action = "removed";
      } else {
        if (settingTarget) {
          const milli = amountToMilliUnits(input.goalTarget!);
          update.goal_target = milli;
          const prev = cat.goal_target ?? null;
          changes.push(
            `Goal target: ${prev !== null ? formatCurrency(milliUnitsToAmount(prev)) : "(none)"} → ${formatCurrency(input.goalTarget!)}`
          );
        }
        if (settingDate) {
          update.goal_target_date = targetDate;
          changes.push(`Goal target date → ${targetDate}`);
        }
        if (settingNeeds) {
          update.goal_needs_whole_amount = input.needsWholeAmount;
          changes.push(
            `Needs whole amount → ${input.needsWholeAmount ? "set aside another" : "refill up to"}`
          );
        }
        action = hadGoal ? "updated" : "created";
      }

      if (settingNote) {
        update.note = input.note;
        changes.push("note updated");
      }

      if (input.dryRun) {
        // Mirror the post-update response: a removal projects null goal fields,
        // never the category's current (soon-to-be-cleared) values.
        const removingGoal = action === "removed";
        const milliForDisplay = removingGoal
          ? null
          : update.goal_target ?? cat.goal_target ?? null;
        return this.result(
          {
            success: true,
            action,
            categoryId: cat.id,
            categoryName: cat.name,
            goalType: removingGoal || action === "created" ? null : currentType,
            goalTarget: milliForDisplay,
            goalTargetDollars: milliForDisplay !== null ? milliUnitsToAmount(milliForDisplay) : null,
            // Project the requested date (normalized to the API's month-start
            // representation) so a dry run matches what the real update returns,
            // instead of echoing the category's current month.
            goalTargetMonth:
              removingGoal
                ? null
                : settingDate && targetDate
                ? `${targetDate.slice(0, 7)}-01`
                : cat.goal_target_month ?? null,
            changes,
            dryRun: true,
            message:
              action === "created"
                ? "Dry run: would create a goal (YNAB infers the type — NEED, or MF/DEBT for credit-card/loan categories)."
                : `Dry run: would ${this.actionVerb(action)} — ${changes.join(", ")}.`,
          },
          input.response_format
        );
      }

      const data: ynab.PatchCategoryWrapper = { category: update as ynab.ExistingCategory };
      const response = await createRetryableAPICall(
        () => this.api.categories.updateCategory(budgetId, cat.id, data),
        "Update category goal"
      );
      const updated = response.data.category ?? cat;

      return this.result(
        {
          success: true,
          action,
          categoryId: updated.id,
          categoryName: updated.name,
          goalType: updated.goal_type ? String(updated.goal_type) : null,
          goalTarget: updated.goal_target ?? null,
          goalTargetDollars: updated.goal_target != null ? milliUnitsToAmount(updated.goal_target) : null,
          goalTargetMonth: updated.goal_target_month ?? null,
          changes,
          dryRun: false,
          message:
            action === "removed"
              ? `Removed the goal from "${updated.name}".`
              : `${action === "created" ? "Created" : "Updated"} the ${updated.goal_type ? String(updated.goal_type) + " " : ""}goal on "${updated.name}".`,
        },
        input.response_format
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [{ type: "text", text: `Failed to set category goal: ${errorMessage}` }],
      };
    }
  }

  private result(
    result: SetCategoryGoalsResult,
    format?: "json" | "markdown"
  ): { content: Array<{ type: string; text: string }> } {
    const responseText =
      (format || "markdown") === "json"
        ? JSON.stringify(result, null, 2)
        : this.formatMarkdown(result);
    const { text } = truncateResponse(responseText, CHARACTER_LIMIT);
    return { content: [{ type: "text", text }] };
  }

  private error(message: string) {
    return { isError: true, content: [{ type: "text", text: message }] };
  }

  private formatMarkdown(result: SetCategoryGoalsResult): string {
    const title =
      result.action === "noop"
        ? "No Change"
        : result.dryRun
        ? `Dry Run — Would ${this.titleCase(this.actionVerb(result.action))} Goal`
        : `Goal ${this.titleCase(result.action)}`;
    let output = `# ${title}\n\n`;
    output += `${result.dryRun ? "🔎" : "✅"} ${result.message}\n\n`;
    output += `**Category:** ${result.categoryName}\n`;
    output += `**Category ID:** \`${result.categoryId}\`\n`;
    output += `**Goal Type:** ${result.goalType || "None"}\n`;
    if (result.goalTargetDollars !== null) {
      output += `**Goal Target:** ${formatCurrency(result.goalTargetDollars)}\n`;
    }
    if (result.goalTargetMonth) {
      output += `**Target Month:** ${result.goalTargetMonth}\n`;
    }
    if (result.changes.length > 0) {
      output += `\n## Changes\n`;
      for (const change of result.changes) {
        output += `- ${change}\n`;
      }
    }
    return output;
  }

  private actionVerb(action: GoalAction): string {
    switch (action) {
      case "created":
        return "create";
      case "updated":
        return "update";
      case "removed":
        return "remove";
      default:
        return "change";
    }
  }

  private titleCase(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
