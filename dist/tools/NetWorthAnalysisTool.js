import * as ynab from "ynab";
class NetWorthAnalysisTool {
    api;
    budgetId;
    constructor() {
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    getToolDefinition() {
        return {
            name: "net_worth_analysis",
            description: "Get current net worth snapshot across all accounts (on-budget and tracking). Note: This tool only provides current balances, not historical trends due to YNAB API limitations.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to analyze (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
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
            console.error(`Getting current net worth for budget ${budgetId}`);
            // Get all accounts (both on-budget and tracking)
            const accountsResponse = await this.api.accounts.getAccounts(budgetId);
            const allAccounts = accountsResponse.data.accounts.filter((account) => account.deleted === false);
            // Categorize accounts and calculate current balances
            const accountSummaries = allAccounts.map(account => {
                const balance = account.balance;
                const balanceDollars = balance / 1000;
                // Categorize accounts as assets or liabilities
                let category;
                if (account.type === 'creditCard' || account.type === 'mortgage' || account.type === 'otherDebt' || account.type === 'autoLoan' || account.type === 'personalLoan' || account.type === 'studentLoan' || account.type === 'medicalDebt' || account.type === 'otherLiability' || account.type === 'lineOfCredit') {
                    category = 'liabilities';
                }
                else {
                    category = 'assets';
                }
                return {
                    id: account.id,
                    name: account.name,
                    type: account.type,
                    on_budget: account.on_budget,
                    balance: balance,
                    balance_dollars: balanceDollars,
                    category: category
                };
            });
            const assets = accountSummaries.filter(acc => acc.category === 'assets');
            const liabilities = accountSummaries.filter(acc => acc.category === 'liabilities');
            const totalAssets = assets.reduce((sum, acc) => sum + acc.balance, 0);
            const totalLiabilities = liabilities.reduce((sum, acc) => sum + acc.balance, 0);
            const netWorth = totalAssets + totalLiabilities; // Liabilities are negative
            // Generate insights
            const insights = [];
            // Add account-specific insights
            const largestAssets = assets
                .sort((a, b) => b.balance_dollars - a.balance_dollars)
                .slice(0, 3);
            if (largestAssets.length > 0) {
                insights.push(`Your largest assets: ${largestAssets.map(acc => `${acc.name} ($${acc.balance_dollars.toFixed(2)})`).join(', ')}`);
            }
            const largestLiabilities = liabilities
                .sort((a, b) => Math.abs(b.balance_dollars) - Math.abs(a.balance_dollars))
                .slice(0, 3);
            if (largestLiabilities.length > 0) {
                insights.push(`Your largest liabilities: ${largestLiabilities.map(acc => `${acc.name} ($${acc.balance_dollars.toFixed(2)})`).join(', ')}`);
            }
            // Add asset allocation insights
            const realEstateAssets = assets.filter(acc => acc.name.toLowerCase().includes('house') || acc.name.toLowerCase().includes('home'));
            const investmentAssets = assets.filter(acc => acc.type === 'otherAsset' && !realEstateAssets.includes(acc));
            const liquidAssets = assets.filter(acc => ['checking', 'savings', 'cash'].includes(acc.type));
            if (realEstateAssets.length > 0) {
                const realEstateValue = realEstateAssets.reduce((sum, acc) => sum + acc.balance_dollars, 0);
                const realEstatePercentage = (realEstateValue / (totalAssets / 1000)) * 100;
                insights.push(`Real estate represents ${realEstatePercentage.toFixed(1)}% of your total assets ($${realEstateValue.toFixed(2)})`);
            }
            if (investmentAssets.length > 0) {
                const investmentValue = investmentAssets.reduce((sum, acc) => sum + acc.balance_dollars, 0);
                const investmentPercentage = (investmentValue / (totalAssets / 1000)) * 100;
                insights.push(`Investments represent ${investmentPercentage.toFixed(1)}% of your total assets ($${investmentValue.toFixed(2)})`);
            }
            if (liquidAssets.length > 0) {
                const liquidValue = liquidAssets.reduce((sum, acc) => sum + acc.balance_dollars, 0);
                insights.push(`You have $${liquidValue.toFixed(2)} in liquid assets (checking, savings, cash)`);
            }
            const result = {
                current_net_worth: netWorth / 1000,
                total_assets: totalAssets / 1000,
                total_liabilities: totalLiabilities / 1000,
                account_breakdown: {
                    assets: assets,
                    liabilities: liabilities
                },
                insights: insights,
                note: "This analysis shows current account balances only. Historical net worth trends are not available due to YNAB API limitations. To track net worth changes over time, consider manually recording your net worth monthly or using a separate tracking tool."
            };
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
            console.error(`Error analyzing net worth for budget ${budgetId}:`);
            console.error(JSON.stringify(error, null, 2));
            return {
                content: [
                    {
                        type: "text",
                        text: `Error analyzing net worth for budget ${budgetId}: ${JSON.stringify(error)}`,
                    },
                ],
            };
        }
    }
}
export default NetWorthAnalysisTool;
