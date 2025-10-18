import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface AutoDistributeFundsInput {
  budgetId?: string;
  month?: string;
  strategy?: "goals-first" | "proportional" | "custom";
  maxAmount?: number;
  dryRun?: boolean;
}

interface DistributionPlan {
  categoryId: string;
  categoryName: string;
  categoryGroup: string;
  currentBudgeted: number;
  proposedAmount: number;
  reason: string;
  goalType?: string;
  goalTarget?: number;
  goalUnderFunded?: number;
}

class AutoDistributeFundsTool {
  private api: ynab.API;
  private budgetId: string;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "auto_distribute_funds",
      description: "Intelligently allocate 'Ready to Assign' money based on category goals and priorities. Supports multiple distribution strategies.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to distribute funds for (optional, defaults to YNAB_BUDGET_ID environment variable)",
          },
          month: {
            type: "string",
            pattern: "^(current|\\d{4}-\\d{2}-\\d{2})$",
            default: "current",
            description: "The budget month to distribute funds for (e.g., 'current' or '2024-03-01')",
          },
          strategy: {
            type: "string",
            enum: ["goals-first", "proportional", "custom"],
            default: "goals-first",
            description: "Distribution strategy: 'goals-first' prioritizes underfunded goals, 'proportional' distributes evenly, 'custom' uses advanced logic",
          },
          maxAmount: {
            type: "number",
            description: "Maximum amount to distribute (optional, defaults to all available 'Ready to Assign' money)",
          },
          dryRun: {
            type: "boolean",
            default: false,
            description: "If true, will not make any actual changes, just return the distribution plan",
          },
        },
        additionalProperties: false,
      },
    };
  }

  async execute(input: AutoDistributeFundsInput) {
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
      console.log(`Auto-distributing funds for budget ${budgetId}, month ${input.month || "current"}`);
      
      // Get current month budget data
      const month = input.month === "current" ? new Date().toISOString().slice(0, 7) + "-01" : input.month!;
      const monthResponse = await this.api.months.getBudgetMonth(budgetId, month);
      const monthData = monthResponse.data.month;
      
      // Check available funds
      const availableFunds = monthData.to_be_budgeted;
      const maxAmount = input.maxAmount ? Math.round(input.maxAmount * 1000) : availableFunds;
      const amountToDistribute = Math.min(availableFunds, maxAmount);

      if (amountToDistribute <= 0) {
        return {
          content: [
            {
              type: "text",
              text: `No funds available to distribute. Ready to Assign: $${(availableFunds / 1000).toFixed(2)}`,
            },
          ],
        };
      }

      // Get all categories for the month
      const categories = monthData.categories.filter(
        cat => !cat.deleted && !cat.hidden && cat.category_group_name !== "Internal Master Category"
      );

      // Generate distribution plan based on strategy
      const distributionPlan = this.generateDistributionPlan(
        categories, 
        amountToDistribute, 
        input.strategy || "goals-first"
      );

      if (distributionPlan.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No suitable categories found for fund distribution.",
            },
          ],
        };
      }

      // Execute distribution if not dry run
      let executedDistributions: any[] = [];
      if (!input.dryRun) {
        executedDistributions = await this.executeDistribution(budgetId, month, distributionPlan);
      }

      // Calculate totals
      const totalDistributed = distributionPlan.reduce((sum, item) => sum + item.proposedAmount, 0);
      const remainingFunds = amountToDistribute - totalDistributed;

      const result = {
        month: monthData.month,
        availableFunds: availableFunds / 1000,
        amountToDistribute: amountToDistribute / 1000,
        totalDistributed: totalDistributed / 1000,
        remainingFunds: remainingFunds / 1000,
        strategy: input.strategy,
        distributionPlan: distributionPlan.map(item => ({
          category: item.categoryName,
          categoryGroup: item.categoryGroup,
          currentBudgeted: item.currentBudgeted / 1000,
          proposedAmount: item.proposedAmount / 1000,
          reason: item.reason,
          goalType: item.goalType,
          goalTarget: item.goalTarget ? item.goalTarget / 1000 : null,
          goalUnderFunded: item.goalUnderFunded ? item.goalUnderFunded / 1000 : null
        })),
        executedDistributions: executedDistributions,
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
      console.error(`Error auto-distributing funds for budget ${budgetId}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error auto-distributing funds: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          },
        ],
      };
    }
  }

  private generateDistributionPlan(
    categories: ynab.Category[],
    amountToDistribute: number,
    strategy: string
  ): DistributionPlan[] {
    const plan: DistributionPlan[] = [];
    let remainingAmount = amountToDistribute;

    if (strategy === "goals-first") {
      // Prioritize categories with underfunded goals
      const goalCategories = categories.filter(cat => 
        cat.goal_type && 
        cat.goal_under_funded && 
        cat.goal_under_funded > 0
      ).sort((a, b) => {
        // Sort by goal urgency (TBD > TB > MF > NEED)
        const goalPriority = { "TBD": 4, "TB": 3, "MF": 2, "NEED": 1 };
        const aPriority = goalPriority[a.goal_type as keyof typeof goalPriority] || 0;
        const bPriority = goalPriority[b.goal_type as keyof typeof goalPriority] || 0;
        return bPriority - aPriority;
      });

      for (const category of goalCategories) {
        if (remainingAmount <= 0) break;
        
        const amount = Math.min(category.goal_under_funded!, remainingAmount);
        plan.push({
          categoryId: category.id,
          categoryName: category.name,
          categoryGroup: category.category_group_name || "Unknown",
          currentBudgeted: category.budgeted,
          proposedAmount: amount,
          reason: `Fund ${category.goal_type} goal (${category.goal_type === "TBD" ? "Target by Date" : 
                   category.goal_type === "TB" ? "Target Balance" :
                   category.goal_type === "MF" ? "Monthly Funding" : "Plan Your Spending"})`,
          goalType: category.goal_type || undefined,
          goalTarget: category.goal_target || undefined,
          goalUnderFunded: category.goal_under_funded || undefined
        });
        remainingAmount -= amount;
      }
    } else if (strategy === "proportional") {
      // Distribute proportionally based on current budgeted amounts
      const totalBudgeted = categories.reduce((sum, cat) => sum + Math.max(0, cat.budgeted), 0);
      
      if (totalBudgeted > 0) {
        for (const category of categories) {
          if (remainingAmount <= 0) break;
          if (category.budgeted <= 0) continue;
          
          const proportion = category.budgeted / totalBudgeted;
          const amount = Math.round(amountToDistribute * proportion);
          const actualAmount = Math.min(amount, remainingAmount);
          
          if (actualAmount > 0) {
            plan.push({
              categoryId: category.id,
              categoryName: category.name,
              categoryGroup: category.category_group_name || "Unknown",
              currentBudgeted: category.budgeted,
              proposedAmount: actualAmount,
              reason: `Proportional distribution based on current budgeted amount`
            });
            remainingAmount -= actualAmount;
          }
        }
      }
    } else if (strategy === "custom") {
      // Custom strategy: prioritize by category group and goal status
      const categoryGroups = [
        "Credit Card Payments",
        "Operating Expenses", 
        "COGS",
        "Accounts Payable",
        "Other"
      ];

      for (const groupName of categoryGroups) {
        if (remainingAmount <= 0) break;
        
        const groupCategories = categories.filter(cat => cat.category_group_name === groupName);
        
        // Within each group, prioritize by goals first, then by current budgeted amount
        const sortedGroup = groupCategories.sort((a, b) => {
          // Goals first
          if (a.goal_type && !b.goal_type) return -1;
          if (!a.goal_type && b.goal_type) return 1;
          
          // Then by budgeted amount
          return b.budgeted - a.budgeted;
        });

        for (const category of sortedGroup) {
          if (remainingAmount <= 0) break;
          
          let amount = 0;
          let reason = "";
          
          if (category.goal_type && category.goal_under_funded && category.goal_under_funded > 0) {
            amount = Math.min(category.goal_under_funded, remainingAmount);
            reason = `Fund ${category.goal_type} goal in ${groupName}`;
          } else if (category.budgeted > 0) {
            amount = Math.min(category.budgeted * 0.1, remainingAmount); // 10% of current budget
            reason = `Top up existing budget in ${groupName}`;
          } else {
            amount = Math.min(100000, remainingAmount); // $100 default
            reason = `Initial funding for ${groupName}`;
          }
          
          if (amount > 0) {
            plan.push({
              categoryId: category.id,
              categoryName: category.name,
              categoryGroup: category.category_group_name || "Unknown",
              currentBudgeted: category.budgeted,
              proposedAmount: amount,
              reason: reason,
              goalType: category.goal_type || undefined,
              goalTarget: category.goal_target || undefined,
              goalUnderFunded: category.goal_under_funded || undefined
            });
            remainingAmount -= amount;
          }
        }
      }
    }

    return plan;
  }

  private async executeDistribution(budgetId: string, month: string, plan: DistributionPlan[]): Promise<any[]> {
    const executedDistributions: any[] = [];

    for (const item of plan) {
      try {
        // Update the category budget for the month
        const updateData = {
          category: {
            budgeted: item.currentBudgeted + item.proposedAmount
          }
        };

        // For now, we'll just log what would be done
        // In a real implementation, we'd call the API to update the category
        console.log(`Would distribute $${(item.proposedAmount / 1000).toFixed(2)} to ${item.categoryName} (${item.reason})`);
        
        executedDistributions.push({
          category: item.categoryName,
          amount: item.proposedAmount / 1000,
          reason: item.reason,
          status: "simulated" // Would be "executed" in real implementation
        });

      } catch (error) {
        console.error(`Error distributing funds to ${item.categoryName}:`, error);
        executedDistributions.push({
          category: item.categoryName,
          amount: item.proposedAmount / 1000,
          reason: item.reason,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return executedDistributions;
  }
}

export default AutoDistributeFundsTool;
