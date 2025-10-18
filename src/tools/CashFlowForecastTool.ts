import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface CashFlowForecastInput {
  budgetId?: string;
  months?: number;
  accountId?: string;
  includeProjections?: boolean;
}

interface CashFlowProjection {
  month: string;
  projected_balance: number;
  projected_balance_dollars: number;
  income: number;
  income_dollars: number;
  expenses: number;
  expenses_dollars: number;
  net_cash_flow: number;
  net_cash_flow_dollars: number;
  confidence_level: 'high' | 'medium' | 'low';
}

interface CashFlowInsight {
  type: 'warning' | 'opportunity' | 'trend';
  message: string;
  severity: 'low' | 'medium' | 'high';
  month?: string;
  data: any;
}

interface CashFlowForecastResult {
  forecast_period: string;
  account_analyzed: string;
  current_balance: number;
  current_balance_dollars: number;
  projections: CashFlowProjection[];
  insights: CashFlowInsight[];
  summary: {
    projected_balance_end: number;
    total_income_projected: number;
    total_expenses_projected: number;
    net_cash_flow_total: number;
    months_until_negative: number | null;
    months_until_goal: number | null;
  };
  note: string;
}

export default class CashFlowForecastTool {
  private api: ynab.API;
  private budgetId: string | undefined;

  constructor() {
    const token = process.env.YNAB_API_TOKEN;
    if (!token) {
      throw new Error("YNAB_API_TOKEN environment variable is required");
    }
    this.api = new ynab.API(token);
    this.budgetId = process.env.YNAB_BUDGET_ID;
  }

  getToolDefinition(): Tool {
    return {
      name: "cash_flow_forecast",
      description: "Generate cash flow projections for accounts based on historical income and expense patterns to forecast future balances.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to analyze (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
          },
          months: {
            type: "number",
            default: 6,
            description: "Number of months to forecast (default: 6, max: 12)",
          },
          accountId: {
            type: "string",
            description: "Specific account ID to forecast (optional, if not provided forecasts primary checking account)",
          },
          includeProjections: {
            type: "boolean",
            default: true,
            description: "Whether to include detailed monthly projections",
          },
        },
        required: [],
      },
    };
  }

  async execute(input: CashFlowForecastInput) {
    const budgetId = input.budgetId || this.budgetId;
    if (!budgetId) {
      return {
        content: [
          {
            type: "text",
            text: "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.",
          },
        ],
      };
    }

    const monthsToForecast = Math.min(input.months || 6, 12);
    const includeProjections = input.includeProjections !== false;

    try {
      console.error(`Generating cash flow forecast for budget ${budgetId} for ${monthsToForecast} months`);
      
      // Get accounts
      const accountsResponse = await this.api.accounts.getAccounts(budgetId);
      const accounts = accountsResponse.data.accounts.filter(
        account => 
          account.deleted === false && 
          account.closed === false &&
          account.on_budget === true
      );

      // Find target account
      let targetAccount = accounts.find(account => account.id === input.accountId);
      if (!targetAccount && input.accountId) {
        return {
          content: [
            {
              type: "text",
              text: `Account with ID ${input.accountId} not found. Use the budget_summary tool to see available accounts.`,
            },
          ],
        };
      }
      
      // If no specific account, use the primary checking account or first on-budget account
      if (!targetAccount) {
        targetAccount = accounts.find(account => 
          account.type === 'checking' || account.type === 'cash'
        ) || accounts[0];
      }

      if (!targetAccount) {
        return {
          content: [
            {
              type: "text",
              text: "No suitable account found for cash flow forecasting. Please specify an account ID or ensure you have on-budget accounts.",
            },
          ],
        };
      }

      // Get historical transaction data for the last 6 months to establish patterns
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(endDate.getMonth() - 6);

      const transactionsResponse = await this.api.transactions.getTransactionsByAccount(
        budgetId,
        targetAccount.id,
        startDate.toISOString().split('T')[0]
      );

      const transactions = transactionsResponse.data.transactions.filter(
        t => t.deleted === false
      );

      // Analyze historical patterns
      const monthlyData: { [month: string]: { income: number; expenses: number } } = {};
      
      for (const transaction of transactions) {
        const month = transaction.date.substring(0, 7); // YYYY-MM
        if (!monthlyData[month]) {
          monthlyData[month] = { income: 0, expenses: 0 };
        }
        
        if (transaction.amount > 0) {
          monthlyData[month].income += transaction.amount;
        } else {
          monthlyData[month].expenses += Math.abs(transaction.amount);
        }
      }

      // Calculate average monthly income and expenses
      const monthlyValues = Object.values(monthlyData);
      const avgMonthlyIncome = monthlyValues.length > 0 ? 
        monthlyValues.reduce((sum, month) => sum + month.income, 0) / monthlyValues.length : 0;
      const avgMonthlyExpenses = monthlyValues.length > 0 ? 
        monthlyValues.reduce((sum, month) => sum + month.expenses, 0) / monthlyValues.length : 0;

      // Calculate variance for confidence levels
      const incomeVariance = monthlyValues.length > 1 ? 
        monthlyValues.reduce((sum, month) => sum + Math.pow(month.income - avgMonthlyIncome, 2), 0) / monthlyValues.length : 0;
      const expenseVariance = monthlyValues.length > 1 ? 
        monthlyValues.reduce((sum, month) => sum + Math.pow(month.expenses - avgMonthlyExpenses, 2), 0) / monthlyValues.length : 0;

      // Generate projections
      const projections: CashFlowProjection[] = [];
      const insights: CashFlowInsight[] = [];
      let currentBalance = targetAccount.balance;
      let totalIncomeProjected = 0;
      let totalExpensesProjected = 0;
      let monthsUntilNegative: number | null = null;
      let monthsUntilGoal: number | null = null;

      for (let i = 1; i <= monthsToForecast; i++) {
        const projectionDate = new Date();
        projectionDate.setMonth(projectionDate.getMonth() + i);
        const monthKey = projectionDate.toISOString().substring(0, 7);

        // Apply some seasonal variation (simplified)
        const seasonalFactor = 1 + (Math.sin((i - 1) * Math.PI / 6) * 0.1); // ±10% variation
        
        const projectedIncome = avgMonthlyIncome * seasonalFactor;
        const projectedExpenses = avgMonthlyExpenses * seasonalFactor;
        const netCashFlow = projectedIncome - projectedExpenses;
        
        currentBalance += netCashFlow;
        totalIncomeProjected += projectedIncome;
        totalExpensesProjected += projectedExpenses;

        // Determine confidence level based on variance
        let confidenceLevel: 'high' | 'medium' | 'low' = 'medium';
        const totalVariance = incomeVariance + expenseVariance;
        const avgAmount = (avgMonthlyIncome + avgMonthlyExpenses) / 2;
        
        if (totalVariance < avgAmount * 0.1) {
          confidenceLevel = 'high';
        } else if (totalVariance > avgAmount * 0.3) {
          confidenceLevel = 'low';
        }

        // Track when balance goes negative
        if (monthsUntilNegative === null && currentBalance < 0) {
          monthsUntilNegative = i;
        }

        // Track when balance reaches a reasonable goal (e.g., 3 months expenses)
        const goalAmount = avgMonthlyExpenses * 3;
        if (monthsUntilGoal === null && currentBalance >= goalAmount) {
          monthsUntilGoal = i;
        }

        projections.push({
          month: monthKey,
          projected_balance: currentBalance,
          projected_balance_dollars: Math.round(currentBalance / 1000 * 100) / 100,
          income: projectedIncome,
          income_dollars: Math.round(projectedIncome / 1000 * 100) / 100,
          expenses: projectedExpenses,
          expenses_dollars: Math.round(projectedExpenses / 1000 * 100) / 100,
          net_cash_flow: netCashFlow,
          net_cash_flow_dollars: Math.round(netCashFlow / 1000 * 100) / 100,
          confidence_level: confidenceLevel,
        });
      }

      // Generate insights
      if (includeProjections) {
        // Negative balance warning
        if (monthsUntilNegative !== null) {
          insights.push({
            type: 'warning',
            message: `Projected to go negative in ${monthsUntilNegative} months based on current patterns`,
            severity: 'high',
            month: projections[monthsUntilNegative - 1]?.month,
            data: { months_until_negative: monthsUntilNegative }
          });
        }

        // Emergency fund achievement
        if (monthsUntilGoal !== null) {
          insights.push({
            type: 'opportunity',
            message: `Could build 3-month emergency fund in ${monthsUntilGoal} months`,
            severity: 'low',
            month: projections[monthsUntilGoal - 1]?.month,
            data: { months_until_goal: monthsUntilGoal }
          });
        }

        // Cash flow trend
        const netCashFlowTotal = totalIncomeProjected - totalExpensesProjected;
        if (netCashFlowTotal > 0) {
          insights.push({
            type: 'trend',
            message: `Positive cash flow trend: +$${(netCashFlowTotal / 1000).toFixed(2)} over ${monthsToForecast} months`,
            severity: 'low',
            data: { net_cash_flow_total: netCashFlowTotal }
          });
        } else {
          insights.push({
            type: 'warning',
            message: `Negative cash flow trend: -$${(Math.abs(netCashFlowTotal) / 1000).toFixed(2)} over ${monthsToForecast} months`,
            severity: 'medium',
            data: { net_cash_flow_total: netCashFlowTotal }
          });
        }
      }

      const result: CashFlowForecastResult = {
        forecast_period: `${monthsToForecast} months starting ${new Date().toISOString().substring(0, 7)}`,
        account_analyzed: targetAccount.name,
        current_balance: targetAccount.balance,
        current_balance_dollars: Math.round(targetAccount.balance / 1000 * 100) / 100,
        projections: projections,
        insights: insights,
        summary: {
          projected_balance_end: Math.round(currentBalance / 1000 * 100) / 100,
          total_income_projected: Math.round(totalIncomeProjected / 1000 * 100) / 100,
          total_expenses_projected: Math.round(totalExpensesProjected / 1000 * 100) / 100,
          net_cash_flow_total: Math.round((totalIncomeProjected - totalExpensesProjected) / 1000 * 100) / 100,
          months_until_negative: monthsUntilNegative,
          months_until_goal: monthsUntilGoal,
        },
        note: "All amounts are in dollars. Projections based on historical patterns and may not account for irregular income, large purchases, or lifestyle changes. Confidence levels reflect historical variance in income and expenses.",
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error generating cash flow forecast: ${errorMessage}`,
          },
        ],
      };
    }
  }
}
