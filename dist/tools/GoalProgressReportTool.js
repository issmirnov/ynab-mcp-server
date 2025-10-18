import * as ynab from "ynab";
export default class GoalProgressReportTool {
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
            name: "goal_progress_report",
            description: "Generate a comprehensive report on category goal progress, including completion status, remaining amounts, and insights for goal achievement.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to analyze (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
                    },
                    month: {
                        type: "string",
                        description: "The budget month to analyze in YYYY-MM-DD format (optional, defaults to current month)",
                    },
                    includeCompleted: {
                        type: "boolean",
                        default: true,
                        description: "Whether to include completed goals in the report",
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
        const targetMonth = input.month || new Date().toISOString().split('T')[0].substring(0, 7) + '-01';
        const includeCompleted = input.includeCompleted !== false;
        const includeInsights = input.includeInsights !== false;
        try {
            console.error(`Generating goal progress report for budget ${budgetId} for month ${targetMonth}`);
            // Get budget month data
            const monthBudget = await this.api.months.getBudgetMonth(budgetId, targetMonth);
            const categories = monthBudget.data.month.categories.filter(category => category.deleted === false &&
                category.hidden === false &&
                !category.name.includes("Inflow:") &&
                category.name !== "Uncategorized");
            const goalProgress = [];
            const insights = [];
            let totalGoals = 0;
            let completedGoals = 0;
            let onTrackGoals = 0;
            let behindGoals = 0;
            for (const category of categories) {
                // Skip categories without goals
                if (!category.goal_type) {
                    continue;
                }
                totalGoals++;
                const goalTarget = category.goal_target || 0;
                const currentBalance = category.balance || 0;
                const budgetedThisMonth = category.budgeted || 0;
                // Calculate progress
                let progressPercentage = 0;
                let remainingAmount = 0;
                let status = 'no_goal';
                let priority = 'low';
                let monthsRemaining = null;
                if (goalTarget > 0) {
                    progressPercentage = Math.min((currentBalance / goalTarget) * 100, 100);
                    remainingAmount = Math.max(goalTarget - currentBalance, 0);
                    // Determine status based on goal type
                    switch (category.goal_type) {
                        case 'TB': // Target Balance
                            if (currentBalance >= goalTarget) {
                                status = 'completed';
                                completedGoals++;
                            }
                            else {
                                // Calculate if on track based on monthly budget
                                const monthlyTarget = goalTarget / 12; // Assume 12-month timeline
                                if (budgetedThisMonth >= monthlyTarget * 0.8) {
                                    status = 'on_track';
                                    onTrackGoals++;
                                }
                                else {
                                    status = 'behind';
                                    behindGoals++;
                                }
                            }
                            break;
                        case 'TBD': // Target Balance by Date
                            if (currentBalance >= goalTarget) {
                                status = 'completed';
                                completedGoals++;
                            }
                            else {
                                // Calculate months remaining based on goal target date
                                const targetDate = new Date(category.goal_target_month || '');
                                const currentDate = new Date(targetMonth);
                                const monthsDiff = Math.max(0, (targetDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
                                monthsRemaining = Math.ceil(monthsDiff);
                                if (monthsRemaining > 0) {
                                    const monthlyNeeded = remainingAmount / monthsRemaining;
                                    if (budgetedThisMonth >= monthlyNeeded * 0.8) {
                                        status = 'on_track';
                                        onTrackGoals++;
                                    }
                                    else {
                                        status = 'behind';
                                        behindGoals++;
                                    }
                                }
                                else {
                                    status = 'behind';
                                    behindGoals++;
                                }
                            }
                            break;
                        case 'MF': // Monthly Funding
                            const monthlyTarget = category.goal_target || 0;
                            if (budgetedThisMonth >= monthlyTarget) {
                                status = 'completed';
                                completedGoals++;
                            }
                            else if (budgetedThisMonth >= monthlyTarget * 0.8) {
                                status = 'on_track';
                                onTrackGoals++;
                            }
                            else {
                                status = 'behind';
                                behindGoals++;
                            }
                            break;
                        default:
                            status = 'no_goal';
                    }
                    // Determine priority
                    if (status === 'behind' && remainingAmount > 1000) {
                        priority = 'high';
                    }
                    else if (status === 'behind' || remainingAmount > 500) {
                        priority = 'medium';
                    }
                    else {
                        priority = 'low';
                    }
                }
                // Skip completed goals if not including them
                if (!includeCompleted && status === 'completed') {
                    continue;
                }
                goalProgress.push({
                    category_id: category.id,
                    category_name: category.name,
                    goal_type: category.goal_type || '',
                    goal_target: goalTarget,
                    goal_target_dollars: Math.round(goalTarget / 1000 * 100) / 100,
                    current_balance: currentBalance,
                    current_balance_dollars: Math.round(currentBalance / 1000 * 100) / 100,
                    budgeted_this_month: budgetedThisMonth,
                    budgeted_this_month_dollars: Math.round(budgetedThisMonth / 1000 * 100) / 100,
                    progress_percentage: Math.round(progressPercentage * 100) / 100,
                    remaining_amount: remainingAmount,
                    remaining_amount_dollars: Math.round(remainingAmount / 1000 * 100) / 100,
                    months_remaining: monthsRemaining,
                    status: status,
                    priority: priority,
                });
                // Generate insights if requested
                if (includeInsights) {
                    // Goal completion achievement
                    if (status === 'completed') {
                        insights.push({
                            type: 'achievement',
                            category: category.name,
                            message: `Goal completed! Target of $${(goalTarget / 1000).toFixed(2)} achieved.`,
                            severity: 'low',
                            data: { goal_target: goalTarget, current_balance: currentBalance }
                        });
                    }
                    // Behind on goal
                    if (status === 'behind' && priority === 'high') {
                        insights.push({
                            type: 'concern',
                            category: category.name,
                            message: `Significantly behind on goal: $${(remainingAmount / 1000).toFixed(2)} remaining, only $${(budgetedThisMonth / 1000).toFixed(2)} budgeted this month`,
                            severity: 'high',
                            data: { remaining_amount: remainingAmount, budgeted_this_month: budgetedThisMonth }
                        });
                    }
                    // Good progress
                    if (status === 'on_track' && progressPercentage > 75) {
                        insights.push({
                            type: 'achievement',
                            category: category.name,
                            message: `Great progress! ${progressPercentage.toFixed(1)}% complete on goal`,
                            severity: 'low',
                            data: { progress_percentage: progressPercentage }
                        });
                    }
                }
            }
            // Sort by priority and remaining amount
            goalProgress.sort((a, b) => {
                const priorityOrder = { high: 3, medium: 2, low: 1 };
                if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                    return priorityOrder[b.priority] - priorityOrder[a.priority];
                }
                return b.remaining_amount - a.remaining_amount;
            });
            // Calculate summary statistics
            const totalBudgetedForGoals = goalProgress.reduce((sum, goal) => sum + goal.budgeted_this_month_dollars, 0);
            const averageProgress = goalProgress.length > 0 ?
                goalProgress.reduce((sum, goal) => sum + goal.progress_percentage, 0) / goalProgress.length : 0;
            const mostUrgentGoal = goalProgress.find(goal => goal.priority === 'high')?.category_name || 'None';
            const mostProgressMade = goalProgress.reduce((max, goal) => goal.progress_percentage > max.progress_percentage ? goal : max, goalProgress[0] || { progress_percentage: 0, category_name: 'None' });
            const goalsNeedingAttention = goalProgress.filter(goal => goal.status === 'behind').length;
            const result = {
                report_month: targetMonth,
                total_goals: totalGoals,
                completed_goals: completedGoals,
                on_track_goals: onTrackGoals,
                behind_goals: behindGoals,
                goal_progress: goalProgress,
                insights: insights,
                summary: {
                    total_budgeted_for_goals: Math.round(totalBudgetedForGoals * 100) / 100,
                    average_progress: Math.round(averageProgress * 100) / 100,
                    most_urgent_goal: mostUrgentGoal,
                    most_progress_made: mostProgressMade.category_name,
                    goals_needing_attention: goalsNeedingAttention,
                },
                note: "All amounts are in dollars. Goal types: TB=Target Balance, TBD=Target Balance by Date, MF=Monthly Funding. Status indicates if you're on track to meet your goal based on current budgeting patterns.",
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
                        text: `Error generating goal progress report: ${errorMessage}`,
                    },
                ],
            };
        }
    }
}
