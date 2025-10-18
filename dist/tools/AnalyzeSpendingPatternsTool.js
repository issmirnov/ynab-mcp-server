import * as ynab from "ynab";
export default class AnalyzeSpendingPatternsTool {
    api;
    budgetId;
    constructor() {
        const token = process.env.YNAB_API_TOKEN;
        if (!token) {
            throw new Error("YNAB_API_TOKEN environment variable is required");
        }
        this.api = new ynab.API(token);
        this.budgetId = process.env.YNAB_BUDGET_ID;
    }
    getToolDefinition() {
        return {
            name: "analyze_spending_patterns",
            description: "Analyze spending patterns across categories to detect trends, anomalies, and provide insights about spending behavior over time.",
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
                        description: "Number of months to analyze for patterns (default: 6, max: 12)",
                    },
                    categoryId: {
                        type: "string",
                        description: "Specific category ID to analyze (optional, if not provided analyzes all categories)",
                    },
                    includeInsights: {
                        type: "boolean",
                        default: true,
                        description: "Whether to include AI-generated insights and recommendations",
                    },
                },
                required: [],
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
        const monthsToAnalyze = Math.min(input.months || 6, 12);
        const includeInsights = input.includeInsights !== false;
        try {
            console.error(`Analyzing spending patterns for budget ${budgetId} over ${monthsToAnalyze} months`);
            // Get categories
            const categoriesResponse = await this.api.categories.getCategories(budgetId);
            const categories = categoriesResponse.data.category_groups
                .flatMap(group => group.categories)
                .filter(category => category.deleted === false &&
                category.hidden === false &&
                !category.name.includes("Inflow:") &&
                category.name !== "Uncategorized");
            // Get target category if specified
            let targetCategories = categories;
            if (input.categoryId) {
                const targetCategory = categories.find(cat => cat.id === input.categoryId);
                if (!targetCategory) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Category with ID ${input.categoryId} not found. Use the budget_summary tool to see available categories.`,
                            },
                        ],
                    };
                }
                targetCategories = [targetCategory];
            }
            // Get historical data for the specified months
            const endDate = new Date();
            const startDate = new Date();
            startDate.setMonth(endDate.getMonth() - monthsToAnalyze);
            const spendingPatterns = [];
            const insights = [];
            for (const category of targetCategories) {
                try {
                    // Get transactions for this category
                    const transactionsResponse = await this.api.transactions.getTransactionsByCategory(budgetId, category.id, startDate.toISOString().split('T')[0]);
                    const transactions = transactionsResponse.data.transactions.filter(t => t.deleted === false && t.amount < 0 // Only spending transactions
                    );
                    // Group transactions by month
                    const monthlySpending = {};
                    let totalSpent = 0;
                    for (const transaction of transactions) {
                        const month = transaction.date.substring(0, 7); // YYYY-MM
                        const amount = Math.abs(transaction.amount); // Convert to positive
                        monthlySpending[month] = (monthlySpending[month] || 0) + amount;
                        totalSpent += amount;
                    }
                    // Calculate spending pattern
                    const monthlyAmounts = Object.values(monthlySpending);
                    const monthsWithData = monthlyAmounts.length;
                    if (monthsWithData === 0) {
                        continue; // Skip categories with no spending data
                    }
                    const averageSpending = totalSpent / monthsWithData;
                    const highestMonth = Math.max(...monthlyAmounts);
                    const lowestMonth = Math.min(...monthlyAmounts);
                    // Calculate variance
                    const variance = monthlyAmounts.reduce((sum, amount) => sum + Math.pow(amount - averageSpending, 2), 0) / monthsWithData;
                    // Determine trend
                    let trend;
                    let trendPercentage = 0;
                    if (monthsWithData >= 2) {
                        const firstHalf = monthlyAmounts.slice(0, Math.floor(monthsWithData / 2));
                        const secondHalf = monthlyAmounts.slice(Math.floor(monthsWithData / 2));
                        const firstHalfAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
                        const secondHalfAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
                        trendPercentage = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
                        if (Math.abs(trendPercentage) < 5) {
                            trend = 'stable';
                        }
                        else if (trendPercentage > 20) {
                            trend = 'increasing';
                        }
                        else if (trendPercentage < -20) {
                            trend = 'decreasing';
                        }
                        else {
                            trend = 'volatile';
                        }
                    }
                    else {
                        trend = 'stable';
                    }
                    spendingPatterns.push({
                        category_id: category.id,
                        category_name: category.name,
                        average_monthly_spending: Math.round(averageSpending / 1000 * 100) / 100,
                        spending_trend: trend,
                        trend_percentage: Math.round(trendPercentage * 100) / 100,
                        months_analyzed: monthsWithData,
                        total_spent: Math.round(totalSpent / 1000 * 100) / 100,
                        highest_month: Math.round(highestMonth / 1000 * 100) / 100,
                        lowest_month: Math.round(lowestMonth / 1000 * 100) / 100,
                        variance: Math.round(variance / 1000 * 100) / 100,
                    });
                    // Generate insights if requested
                    if (includeInsights) {
                        // High spending anomaly
                        if (highestMonth > averageSpending * 2) {
                            insights.push({
                                type: 'anomaly',
                                category: category.name,
                                message: `High spending spike detected: $${(highestMonth / 1000).toFixed(2)} in one month (avg: $${(averageSpending / 1000).toFixed(2)})`,
                                severity: 'high',
                                data: { highest_month: highestMonth, average: averageSpending }
                            });
                        }
                        // Increasing trend
                        if (trend === 'increasing' && trendPercentage > 30) {
                            insights.push({
                                type: 'trend',
                                category: category.name,
                                message: `Spending increasing rapidly: ${trendPercentage.toFixed(1)}% growth over analyzed period`,
                                severity: 'medium',
                                data: { trend_percentage: trendPercentage }
                            });
                        }
                        // High volatility
                        if (variance > averageSpending * 0.5) {
                            insights.push({
                                type: 'anomaly',
                                category: category.name,
                                message: `High spending volatility: spending varies significantly month to month`,
                                severity: 'medium',
                                data: { variance, average: averageSpending }
                            });
                        }
                    }
                }
                catch (error) {
                    console.error(`Error analyzing category ${category.name}:`, error);
                    // Continue with other categories
                }
            }
            // Sort patterns by total spending
            spendingPatterns.sort((a, b) => b.total_spent - a.total_spent);
            // Calculate summary statistics
            const totalSpending = spendingPatterns.reduce((sum, pattern) => sum + pattern.total_spent, 0);
            const averageMonthlySpending = spendingPatterns.reduce((sum, pattern) => sum + pattern.average_monthly_spending, 0);
            const mostVolatileCategory = spendingPatterns.reduce((max, pattern) => pattern.variance > max.variance ? pattern : max, spendingPatterns[0] || { variance: 0, category_name: 'None' });
            const fastestGrowingCategory = spendingPatterns.reduce((max, pattern) => pattern.trend_percentage > max.trend_percentage ? pattern : max, spendingPatterns[0] || { trend_percentage: 0, category_name: 'None' });
            const mostStableCategory = spendingPatterns.reduce((min, pattern) => Math.abs(pattern.trend_percentage) < Math.abs(min.trend_percentage) ? pattern : min, spendingPatterns[0] || { trend_percentage: 100, category_name: 'None' });
            const result = {
                analysis_period: `${monthsToAnalyze} months ending ${endDate.toISOString().split('T')[0]}`,
                total_categories_analyzed: spendingPatterns.length,
                spending_patterns: spendingPatterns,
                insights: insights,
                summary: {
                    total_spending: Math.round(totalSpending * 100) / 100,
                    average_monthly_spending: Math.round(averageMonthlySpending * 100) / 100,
                    most_volatile_category: mostVolatileCategory.category_name,
                    fastest_growing_category: fastestGrowingCategory.category_name,
                    most_stable_category: mostStableCategory.category_name,
                },
                note: "All amounts are in dollars. Positive trend_percentage indicates increasing spending, negative indicates decreasing spending. Analysis based on actual transaction data from YNAB.",
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error analyzing spending patterns: ${errorMessage}`,
                    },
                ],
            };
        }
    }
}
