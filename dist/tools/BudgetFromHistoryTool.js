import * as ynab from "ynab";
import { handleAPIError, createRetryableAPICall } from "../utils/apiErrorHandler.js";
export default class BudgetFromHistoryTool {
    api;
    budgetId;
    constructor(budgetId, ynabApi) {
        this.api = ynabApi || new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = budgetId || process.env.YNAB_BUDGET_ID;
    }
    getToolDefinition() {
        return {
            name: "budget_from_history",
            description: "Analyze historical spending patterns and suggest budget allocations based on past behavior. Useful for setting up new budgets or adjusting existing ones based on actual spending history.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to analyze (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
                    },
                    months: {
                        type: "number",
                        description: "Number of months of historical data to analyze (default: 6, max: 12)",
                        minimum: 3,
                        maximum: 12,
                    },
                    targetMonth: {
                        type: "string",
                        description: "The month to create budget suggestions for in YYYY-MM-DD format (default: current month)",
                    },
                    strategy: {
                        type: "string",
                        enum: ["average", "median", "trend", "conservative", "aggressive"],
                        description: "Budgeting strategy: average=use historical average, median=use median spending, trend=extrapolate trend, conservative=lower than average, aggressive=higher than average",
                        default: "average",
                    },
                    categoryIds: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional: Specific category IDs to include in budget suggestions",
                    },
                    excludeCategories: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional: Category names or IDs to exclude from budget suggestions",
                    },
                    minSpendingThreshold: {
                        type: "number",
                        description: "Minimum average monthly spending to include in budget suggestions (default: 10.00)",
                        default: 10.00,
                    },
                    maxBudgetIncrease: {
                        type: "number",
                        description: "Maximum percentage increase from historical average (default: 50, i.e., 50% increase max)",
                        default: 50,
                    },
                    dryRun: {
                        type: "boolean",
                        description: "If true, will show suggestions without applying them to the budget",
                        default: false,
                    },
                },
                required: [],
            },
        };
    }
    async execute(input) {
        const budgetId = input.budgetId || this.budgetId;
        if (!budgetId) {
            throw new Error("No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.");
        }
        const monthsToAnalyze = input.months || 6;
        const strategy = input.strategy || 'average';
        const minSpendingThreshold = (input.minSpendingThreshold || 10.00) * 1000; // Convert to milliunits
        const maxBudgetIncrease = (input.maxBudgetIncrease || 50) / 100; // Convert to decimal
        try {
            // Get current categories
            const categoriesResponse = await createRetryableAPICall(() => this.api.categories.getCategories(budgetId), 'Get categories for budget analysis');
            const allCategories = categoriesResponse.data.category_groups
                .flatMap((group) => group.categories)
                .filter((category) => !category.deleted &&
                !category.hidden &&
                !category.name.includes("Inflow:") &&
                category.name !== "Uncategorized");
            // Filter categories based on input
            let targetCategories = allCategories;
            if (input.categoryIds && input.categoryIds.length > 0) {
                targetCategories = targetCategories.filter((cat) => input.categoryIds?.includes(cat.id));
            }
            if (input.excludeCategories && input.excludeCategories.length > 0) {
                targetCategories = targetCategories.filter((cat) => !input.excludeCategories?.some(exclude => cat.name.toLowerCase().includes(exclude.toLowerCase()) ||
                    cat.id === exclude));
            }
            // Calculate date range for analysis
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth();
            const currentYear = currentDate.getFullYear();
            const suggestions = [];
            const insights = [];
            for (const category of targetCategories) {
                try {
                    // Get historical spending data for this category
                    const monthlySpending = [];
                    let totalSpent = 0;
                    let monthsWithSpending = 0;
                    for (let i = 0; i < monthsToAnalyze; i++) {
                        // Calculate month going back from current month
                        let targetMonth = currentMonth - i;
                        let targetYear = currentYear;
                        // Handle year boundaries
                        while (targetMonth < 0) {
                            targetMonth += 12;
                            targetYear -= 1;
                        }
                        const monthKey = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`;
                        try {
                            const monthBudget = await createRetryableAPICall(() => this.api.months.getBudgetMonth(budgetId, monthKey), `Get budget month ${monthKey}`);
                            const monthCategory = monthBudget.data.month.categories.find((cat) => cat.id === category.id);
                            if (monthCategory) {
                                const spending = Math.abs(monthCategory.activity || 0); // Activity is negative for spending
                                monthlySpending.push(spending);
                                totalSpent += spending;
                                if (spending > 0)
                                    monthsWithSpending++;
                            }
                            else {
                                monthlySpending.push(0);
                            }
                        }
                        catch (error) {
                            // If month data not found, assume 0 spending
                            monthlySpending.push(0);
                        }
                    }
                    // Calculate statistics
                    const averageSpending = monthsWithSpending > 0 ? totalSpent / monthsWithSpending : 0;
                    const medianSpending = this.calculateMedian(monthlySpending.filter(amount => amount > 0));
                    // Calculate trend (simple linear regression)
                    const trend = this.calculateTrend(monthlySpending);
                    // Calculate spending consistency (coefficient of variation)
                    const spendingConsistency = this.calculateConsistency(monthlySpending);
                    // Skip categories with very low spending
                    if (averageSpending < minSpendingThreshold) {
                        continue;
                    }
                    // Calculate suggested budget based on strategy
                    let suggestedBudget = 0;
                    let confidenceLevel = 'low';
                    let reasoning = '';
                    switch (strategy) {
                        case 'average':
                            suggestedBudget = averageSpending;
                            confidenceLevel = spendingConsistency > 0.7 ? 'high' : spendingConsistency > 0.4 ? 'medium' : 'low';
                            reasoning = `Based on ${monthsWithSpending} months of spending data (avg: $${(averageSpending / 1000).toFixed(2)})`;
                            break;
                        case 'median':
                            suggestedBudget = medianSpending;
                            confidenceLevel = spendingConsistency > 0.6 ? 'high' : spendingConsistency > 0.3 ? 'medium' : 'low';
                            reasoning = `Based on median spending of $${(medianSpending / 1000).toFixed(2)} over ${monthsWithSpending} months`;
                            break;
                        case 'trend':
                            suggestedBudget = Math.max(0, averageSpending * (1 + trend));
                            confidenceLevel = Math.abs(trend) < 0.2 ? 'high' : Math.abs(trend) < 0.5 ? 'medium' : 'low';
                            reasoning = `Trend-based: ${trend > 0 ? '+' : ''}${(trend * 100).toFixed(1)}% change from average $${(averageSpending / 1000).toFixed(2)}`;
                            break;
                        case 'conservative':
                            suggestedBudget = averageSpending * 0.8; // 20% below average
                            confidenceLevel = spendingConsistency > 0.6 ? 'high' : spendingConsistency > 0.3 ? 'medium' : 'low';
                            reasoning = `Conservative: 20% below average spending of $${(averageSpending / 1000).toFixed(2)}`;
                            break;
                        case 'aggressive':
                            suggestedBudget = averageSpending * 1.2; // 20% above average
                            confidenceLevel = spendingConsistency > 0.6 ? 'high' : spendingConsistency > 0.3 ? 'medium' : 'low';
                            reasoning = `Aggressive: 20% above average spending of $${(averageSpending / 1000).toFixed(2)}`;
                            break;
                    }
                    // Apply maximum increase limit
                    if (suggestedBudget > averageSpending * (1 + maxBudgetIncrease)) {
                        suggestedBudget = averageSpending * (1 + maxBudgetIncrease);
                        reasoning += ` (capped at ${maxBudgetIncrease * 100}% increase)`;
                    }
                    // Find category group name
                    const categoryGroup = categoriesResponse.data.category_groups.find((group) => group.categories.some((cat) => cat.id === category.id));
                    suggestions.push({
                        category_id: category.id,
                        category_name: category.name,
                        category_group_name: categoryGroup?.name || 'Unknown',
                        historical_average: averageSpending,
                        historical_median: medianSpending,
                        historical_trend: trend,
                        suggested_budget: suggestedBudget,
                        confidence_level: confidenceLevel,
                        reasoning: reasoning,
                        months_analyzed: monthsWithSpending,
                        total_spent: totalSpent,
                        spending_consistency: spendingConsistency,
                    });
                }
                catch (error) {
                    console.error(`Error processing category ${category.name}:`, error);
                }
            }
            // Generate insights
            const totalHistoricalSpending = suggestions.reduce((sum, s) => sum + s.total_spent, 0);
            const averageMonthlySpending = totalHistoricalSpending / monthsToAnalyze;
            const suggestedBudgetTotal = suggestions.reduce((sum, s) => sum + s.suggested_budget, 0);
            const budgetVsHistoricalRatio = averageMonthlySpending > 0 ? suggestedBudgetTotal / averageMonthlySpending : 0;
            insights.push(`Analyzed ${suggestions.length} categories with meaningful spending history`);
            insights.push(`Total historical spending: $${(totalHistoricalSpending / 1000).toFixed(2)} over ${monthsToAnalyze} months`);
            insights.push(`Suggested budget total: $${(suggestedBudgetTotal / 1000).toFixed(2)} (${(budgetVsHistoricalRatio * 100).toFixed(1)}% of historical spending)`);
            const highConfidenceCount = suggestions.filter(s => s.confidence_level === 'high').length;
            const mediumConfidenceCount = suggestions.filter(s => s.confidence_level === 'medium').length;
            const lowConfidenceCount = suggestions.filter(s => s.confidence_level === 'low').length;
            if (highConfidenceCount > 0) {
                insights.push(`${highConfidenceCount} categories have high-confidence budget suggestions`);
            }
            if (lowConfidenceCount > 0) {
                insights.push(`${lowConfidenceCount} categories have low-confidence suggestions - consider manual review`);
            }
            // Strategy-specific insights
            if (strategy === 'trend') {
                const increasingCategories = suggestions.filter(s => s.historical_trend > 0.1).length;
                const decreasingCategories = suggestions.filter(s => s.historical_trend < -0.1).length;
                if (increasingCategories > 0) {
                    insights.push(`${increasingCategories} categories show increasing spending trends`);
                }
                if (decreasingCategories > 0) {
                    insights.push(`${decreasingCategories} categories show decreasing spending trends`);
                }
            }
            const result = {
                budget_id: budgetId,
                target_month: input.targetMonth || new Date().toISOString().substring(0, 7) + '-01',
                analysis_period: `${monthsToAnalyze} months ending ${new Date().toISOString().substring(0, 7)}`,
                strategy_used: strategy,
                total_suggested_budget: suggestedBudgetTotal,
                categories_analyzed: targetCategories.length,
                categories_with_suggestions: suggestions.length,
                suggestions: suggestions.map(s => ({
                    ...s,
                    historical_average: s.historical_average / 1000,
                    historical_median: s.historical_median / 1000,
                    suggested_budget: s.suggested_budget / 1000,
                    total_spent: s.total_spent / 1000,
                })),
                summary: {
                    total_historical_spending: totalHistoricalSpending / 1000,
                    average_monthly_spending: averageMonthlySpending / 1000,
                    suggested_budget_total: suggestedBudgetTotal / 1000,
                    budget_vs_historical_ratio: budgetVsHistoricalRatio,
                    high_confidence_suggestions: highConfidenceCount,
                    medium_confidence_suggestions: mediumConfidenceCount,
                    low_confidence_suggestions: lowConfidenceCount,
                },
                insights: insights,
                note: "All amounts are in dollars. Suggestions are based on historical spending patterns and should be reviewed before applying to your budget.",
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
            await handleAPIError(error, 'Budget from history analysis');
            throw error; // This line will never be reached, but satisfies TypeScript
        }
    }
    calculateMedian(numbers) {
        if (numbers.length === 0)
            return 0;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    calculateTrend(monthlySpending) {
        if (monthlySpending.length < 2)
            return 0;
        // Simple linear regression to find trend
        const n = monthlySpending.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = monthlySpending;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const avgY = sumY / n;
        return avgY > 0 ? slope / avgY : 0; // Return as percentage change
    }
    calculateConsistency(monthlySpending) {
        const nonZeroSpending = monthlySpending.filter(amount => amount > 0);
        if (nonZeroSpending.length < 2)
            return 0;
        const mean = nonZeroSpending.reduce((sum, amount) => sum + amount, 0) / nonZeroSpending.length;
        const variance = nonZeroSpending.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / nonZeroSpending.length;
        const standardDeviation = Math.sqrt(variance);
        // Coefficient of variation (lower = more consistent)
        return mean > 0 ? 1 - (standardDeviation / mean) : 0;
    }
}
