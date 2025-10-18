import * as ynab from "ynab";
class BudgetSummaryTool {
    api;
    budgetId;
    constructor() {
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    getToolDefinition() {
        return {
            name: "budget_summary",
            description: "Get a summary of the budget for a specific month highlighting overspent categories that need attention and categories with a positive balance that are doing well.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to get a summary for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
                    },
                    month: {
                        type: "string",
                        pattern: "^(current|\\d{4}-\\d{2}-\\d{2})$",
                        default: "current",
                        description: "The budget month in ISO format (e.g. 2016-12-01). The string 'current' can also be used to specify the current calendar month (UTC)",
                    },
                },
                additionalProperties: false,
            },
        };
    }
    async execute(input) {
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
        try {
            console.error(`Getting accounts and categories for budget ${budgetId} and month ${input.month}`);
            const accountsResponse = await this.api.accounts.getAccounts(budgetId);
            // Filter accounts: only include open, non-deleted accounts that are on-budget
            const accounts = accountsResponse.data.accounts.filter((account) => account.deleted === false &&
                account.closed === false &&
                account.on_budget === true);
            const monthBudget = await this.api.months.getBudgetMonth(budgetId, input.month);
            // Filter categories: only include active, non-hidden categories
            // Also exclude internal categories like "Inflow: Ready to Assign" and "Uncategorized"
            const categories = monthBudget.data.month.categories
                .filter((category) => category.deleted === false &&
                category.hidden === false &&
                !category.name.includes("Inflow:") &&
                category.name !== "Uncategorized" &&
                category.name !== "Deferred Income SubCategory");
            const result = this.summaryPrompt(monthBudget.data.month, accounts, categories);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`Error getting budget ${budgetId}:`);
            console.error(JSON.stringify(error, null, 2));
            return {
                content: [
                    {
                        type: "text",
                        text: `Error getting budget ${budgetId}: ${JSON.stringify(error)}`,
                    },
                ],
            };
        }
    }
    summaryPrompt(monthBudget, accounts, categories) {
        //     const prompt = `
        // Here is the budget month information for the month of ${monthBudget.month}:
        //   Income: ${monthBudget.income / 1000}
        //   Budgeted: ${monthBudget.budgeted / 1000}
        //   Activity: ${monthBudget.activity / 1000}
        //   To be budgeted: ${monthBudget.to_be_budgeted / 1000}
        //   Age of Money: ${monthBudget.age_of_money}
        //   Note: ${monthBudget.note}
        // Make sure to use the budget month information to help you answer the user's question. If income is less than budgeted, it means that the month is over budget.
        // If there is money in the to be budgeted, suggest that the user assign it to a category. Tell the user how much they have spent and how much they have made.
        // Example response if spending is more than income:
        // You have spent $100.00 more this month than you made.
        // Example response if spending is less than income:
        // You have made $100.00 more this month than you spent.
        // Here is a list of categories. Use this list to help you answer the user's question.
        // Categories:
        // ${categories
        //   .map(
        //     (category) =>
        //       `Category: ${category.name} (id:${category.id}, balance: ${category.balance / 1000}, budgeted: ${category.budgeted / 1000}, activity: ${category.activity / 1000})`
        //   )
        //   .join("\n")}
        // List all categories. Order them by balance from lowest to highest. Like this:
        // Categories:
        // - Category 1: -$100.00
        // - Category 2: -$50.00
        // - Category 3: -$25.00
        // - Category 4: -$10.00
        // - Category 5: -$5.00
        // Here is a list of accounts. Use this list to help you answer the user's question.
        // Checking and savings accounts:
        // ${accounts
        //   .filter((account) => account.type === "checking" || account.type === "savings")
        //   .map(
        //     (account) =>
        //       `Account ${account.id}. Name: ${account.name} (id:${account.id}, type:${account.type}, balance: ${account.balance / 1000})`
        //   )
        //   .join("\n")}
        // `;
        // return prompt;
        return {
            monthBudget: {
                month: monthBudget.month,
                note: monthBudget.note,
                income: monthBudget.income,
                budgeted: monthBudget.budgeted,
                activity: monthBudget.activity,
                to_be_budgeted: monthBudget.to_be_budgeted,
                age_of_money: monthBudget.age_of_money,
                deleted: monthBudget.deleted,
                categories: categories
            },
            accounts: accounts,
            note: "Divide all numbers by 1000 to get the balance in dollars. Only showing active (non-deleted, non-hidden) categories and open (non-deleted, non-closed) accounts.",
        };
    }
}
export default BudgetSummaryTool;
