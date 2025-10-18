import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface HandleOverspendingInput {
  budgetId?: string;
  month?: string;
  strategy?: "auto" | "suggest";
  sourceCategories?: string[];
  targetCategories?: string[];
  dryRun?: boolean;
}

interface MoveSuggestion {
  fromCategoryId: string;
  fromCategoryName: string;
  toCategoryId: string;
  toCategoryName: string;
  amount: number;
  reason: string;
}

class HandleOverspendingTool {
  private api: ynab.API;
  private budgetId: string;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "handle_overspending",
      description: "Automatically resolve overspent categories by moving funds from available sources. Supports both automatic execution and suggestion mode.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to handle overspending for (optional, defaults to YNAB_BUDGET_ID environment variable)",
          },
          month: {
            type: "string",
            pattern: "^(current|\\d{4}-\\d{2}-\\d{2})$",
            default: "current",
            description: "The budget month to check for overspending (e.g., 'current' or '2024-03-01')",
          },
          strategy: {
            type: "string",
            enum: ["auto", "suggest"],
            default: "suggest",
            description: "Whether to automatically execute moves ('auto') or just suggest them ('suggest')",
          },
          sourceCategories: {
            type: "array",
            items: { type: "string" },
            description: "Optional array of category IDs to use as funding sources (if not provided, will find available categories automatically)",
          },
          targetCategories: {
            type: "array",
            items: { type: "string" },
            description: "Optional array of category IDs to fix overspending for (if not provided, will fix all overspent categories)",
          },
          dryRun: {
            type: "boolean",
            default: false,
            description: "If true, will not make any actual changes, just return what would be done",
          },
        },
        additionalProperties: false,
      },
    };
  }

  async execute(input: HandleOverspendingInput) {
    const budgetId = input.budgetId || this.budgetId;
    if (!budgetId) {
      return {
        content: [
          {
            type: "text",
            text: "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.",
          },
        ],
      };
    }

    try {
      console.log(`Handling overspending for budget ${budgetId}, month ${input.month || "current"}`);
      
      // Get current month budget data
      const month = input.month === "current" ? new Date().toISOString().slice(0, 7) + "-01" : input.month!;
      const monthResponse = await this.api.months.getBudgetMonth(budgetId, month);
      const monthData = monthResponse.data.month;
      
      // Get all categories for the month
      const categories = monthData.categories.filter(
        cat => !cat.deleted && !cat.hidden && cat.category_group_name !== "Internal Master Category"
      );

      // Find overspent categories (negative balance)
      const overspentCategories = categories.filter(cat => cat.balance < 0);
      
      if (overspentCategories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No overspent categories found for this month. Great job!",
            },
          ],
        };
      }

      // Find categories with positive balances that can contribute funds
      const availableCategories = categories.filter(cat => 
        cat.balance > 0 && 
        (!input.sourceCategories || input.sourceCategories.includes(cat.id)) &&
        cat.category_group_name !== "Internal Master Category"
      );

      if (availableCategories.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No categories with available funds found to cover overspending. Consider adding money to 'Ready to Assign' or adjusting your budget.",
            },
          ],
        };
      }

      // Generate move suggestions
      const suggestions = this.generateMoveSuggestions(overspentCategories, availableCategories, input.targetCategories);
      
      if (suggestions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No suitable funding sources found for the overspent categories.",
            },
          ],
        };
      }

      // Execute moves if strategy is 'auto' and not dry run
      let executedMoves: any[] = [];
      if (input.strategy === "auto" && !input.dryRun) {
        executedMoves = await this.executeMoves(budgetId, month, suggestions);
      }

      // Format response
      const result = {
        month: monthData.month,
        overspentCategories: overspentCategories.map(cat => ({
          id: cat.id,
          name: cat.name,
          balance: cat.balance / 1000,
          categoryGroup: cat.category_group_name
        })),
        availableFunding: availableCategories.map(cat => ({
          id: cat.id,
          name: cat.name,
          balance: cat.balance / 1000,
          categoryGroup: cat.category_group_name
        })),
        suggestions: suggestions.map(s => ({
          fromCategory: s.fromCategoryName,
          toCategory: s.toCategoryName,
          amount: s.amount / 1000,
          reason: s.reason
        })),
        executedMoves: executedMoves,
        strategy: input.strategy,
        dryRun: input.dryRun || false
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

    } catch (error) {
      console.error(`Error handling overspending for budget ${budgetId}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error handling overspending: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          },
        ],
      };
    }
  }

  private generateMoveSuggestions(
    overspentCategories: ynab.Category[],
    availableCategories: ynab.Category[],
    targetCategories?: string[]
  ): MoveSuggestion[] {
    const suggestions: MoveSuggestion[] = [];
    const filteredOverspent = targetCategories 
      ? overspentCategories.filter(cat => targetCategories.includes(cat.id))
      : overspentCategories;

    for (const overspent of filteredOverspent) {
      const neededAmount = Math.abs(overspent.balance);
      let remainingNeeded = neededAmount;

      // Sort available categories by balance (highest first) for efficient allocation
      const sortedAvailable = [...availableCategories].sort((a, b) => b.balance - a.balance);

      for (const available of sortedAvailable) {
        if (remainingNeeded <= 0) break;
        if (available.balance <= 0) continue;

        const moveAmount = Math.min(available.balance, remainingNeeded);
        
        suggestions.push({
          fromCategoryId: available.id,
          fromCategoryName: available.name,
          toCategoryId: overspent.id,
          toCategoryName: overspent.name,
          amount: moveAmount,
          reason: `Cover overspending in ${overspent.name} (${overspent.category_group_name})`
        });

        remainingNeeded -= moveAmount;
      }
    }

    return suggestions;
  }

  private async executeMoves(budgetId: string, month: string, suggestions: MoveSuggestion[]): Promise<any[]> {
    const executedMoves: any[] = [];

    for (const suggestion of suggestions) {
      try {
        console.log(`Executing move: ${suggestion.fromCategoryName} -> ${suggestion.toCategoryName} ($${(suggestion.amount / 1000).toFixed(2)})`);
        
        // Get current month data to get current budgeted amounts
        const monthResponse = await this.api.months.getBudgetMonth(budgetId, month);
        const monthData = monthResponse.data.month;
        
        const fromCategory = monthData.categories.find(cat => cat.id === suggestion.fromCategoryId);
        const toCategory = monthData.categories.find(cat => cat.id === suggestion.toCategoryId);
        
        if (!fromCategory || !toCategory) {
          throw new Error(`Category not found: ${!fromCategory ? suggestion.fromCategoryId : suggestion.toCategoryId}`);
        }
        
        // Calculate new budgeted amounts
        const fromNewBudgeted = fromCategory.budgeted - suggestion.amount;
        const toNewBudgeted = toCategory.budgeted + suggestion.amount;
        
        // Update the from category
        const fromUpdateData: ynab.PatchMonthCategoryWrapper = {
          category: {
            budgeted: fromNewBudgeted
          }
        };
        
        await this.api.categories.updateMonthCategory(budgetId, month, suggestion.fromCategoryId, fromUpdateData);
        
        // Update the to category
        const toUpdateData: ynab.PatchMonthCategoryWrapper = {
          category: {
            budgeted: toNewBudgeted
          }
        };
        
        await this.api.categories.updateMonthCategory(budgetId, month, suggestion.toCategoryId, toUpdateData);
        
        executedMoves.push({
          fromCategory: suggestion.fromCategoryName,
          toCategory: suggestion.toCategoryName,
          amount: suggestion.amount / 1000,
          status: "success"
        });

      } catch (error) {
        console.error(`Error executing move for ${suggestion.fromCategoryName} -> ${suggestion.toCategoryName}:`, error);
        executedMoves.push({
          fromCategory: suggestion.fromCategoryName,
          toCategory: suggestion.toCategoryName,
          amount: suggestion.amount / 1000,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return executedMoves;
  }
}

export default HandleOverspendingTool;
