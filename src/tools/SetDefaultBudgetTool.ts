import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { loadUserPreferences, saveUserPreferences } from "../auth/preferences.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface SetDefaultBudgetInput {
  budgetId?: string;
  budgetName?: string;
}

class SetDefaultBudgetTool {
  private api: ynab.API;
  private env?: Env;
  private ynabUserId?: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.env = runtime.env;
    this.ynabUserId = runtime.ynabUserId;
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_set_default_budget",
      description: "Set the default budget used when budgetId is omitted from tool calls.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The exact budget ID to save as default.",
          },
          budgetName: {
            type: "string",
            description: "The budget name to save as default. Case-insensitive exact match is supported.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "Set Default Budget",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: SetDefaultBudgetInput) {
    try {
      if (!this.env || !this.ynabUserId) {
        throw new Error("Missing authenticated user context for default budget storage");
      }

      if (!input.budgetId && !input.budgetName) {
        throw new Error("Provide either budgetId or budgetName");
      }

      const budgetsResponse = await createRetryableAPICall(
        () => this.api.budgets.getBudgets(),
        "List budgets for default selection"
      );
      const budgets = budgetsResponse.data.budgets;

      let budget = budgets.find((candidate) => {
        if (input.budgetId) {
          return candidate.id === input.budgetId;
        }

        return candidate.name.toLowerCase() === input.budgetName?.trim().toLowerCase();
      });

      if (!budget && input.budgetName) {
        const needle = input.budgetName.trim().toLowerCase();
        const partialMatches = budgets.filter((candidate) =>
          candidate.name.toLowerCase().includes(needle)
        );

        if (partialMatches.length === 1) {
          [budget] = partialMatches;
        }
      }

      if (!budget) {
        throw new Error("Could not find a matching budget");
      }

      const preferences = await loadUserPreferences(this.env.OAUTH_KV, this.ynabUserId);
      await saveUserPreferences(this.env.OAUTH_KV, this.ynabUserId, {
        ...preferences,
        defaultBudgetId: budget.id,
        defaultBudgetName: budget.name,
      });

      return {
        content: [
          {
            type: "text",
            text: `Saved "${budget.name}" as your default budget (${budget.id}).`,
          },
        ],
      };
    } catch (error: unknown) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error setting default budget: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
          },
        ],
      };
    }
  }
}

export default SetDefaultBudgetTool;
