import * as ynab from "ynab";
class MoveFundsBetweenCategoriesTool {
    api;
    budgetId;
    constructor() {
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    getToolDefinition() {
        return {
            name: "move_funds_between_categories",
            description: "Transfer budgeted amounts between categories with validation. Supports multiple simultaneous moves in one operation.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to move funds in (optional, defaults to YNAB_BUDGET_ID environment variable)",
                    },
                    month: {
                        type: "string",
                        pattern: "^(current|\\d{4}-\\d{2}-\\d{2})$",
                        default: "current",
                        description: "The budget month to move funds for (e.g., 'current' or '2024-03-01')",
                    },
                    moves: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                fromCategoryId: {
                                    type: "string",
                                    description: "The ID of the category to move funds from",
                                },
                                toCategoryId: {
                                    type: "string",
                                    description: "The ID of the category to move funds to",
                                },
                                amount: {
                                    type: "number",
                                    description: "The amount to move in dollars (e.g., 50.00). Use negative values to dip into previously saved funds (e.g., -100.00 to move $100 from accumulated savings).",
                                },
                            },
                            required: ["fromCategoryId", "toCategoryId", "amount"],
                            additionalProperties: false,
                        },
                        minItems: 1,
                        description: "Array of fund moves to execute",
                    },
                    dryRun: {
                        type: "boolean",
                        default: false,
                        description: "If true, will not make any actual changes, just return what would be moved",
                    },
                },
                required: ["moves"],
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
                        text: "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.",
                    },
                ],
            };
        }
        if (!input.moves || input.moves.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No moves specified. Please provide at least one move with fromCategoryId, toCategoryId, and amount.",
                    },
                ],
            };
        }
        try {
            console.log(`Moving funds between categories for budget ${budgetId}, month ${input.month || "current"}`);
            // Get current month budget data
            const month = input.month === "current" ? new Date().toISOString().slice(0, 7) + "-01" : input.month;
            const monthResponse = await this.api.months.getBudgetMonth(budgetId, month);
            const monthData = monthResponse.data.month;
            // Get all categories for the month
            const categories = monthData.categories.filter(cat => !cat.deleted && !cat.hidden && cat.category_group_name !== "Internal Master Category");
            // Validate moves and get current balances
            const validationResults = this.validateMoves(input.moves, categories);
            if (validationResults.invalidMoves.length > 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Validation failed: ${validationResults.invalidMoves.join(", ")}`,
                        },
                    ],
                };
            }
            // Execute moves
            const moveResults = [];
            for (const move of input.moves) {
                const fromCategory = categories.find(cat => cat.id === move.fromCategoryId);
                const toCategory = categories.find(cat => cat.id === move.toCategoryId);
                if (!fromCategory || !toCategory) {
                    moveResults.push({
                        fromCategoryId: move.fromCategoryId,
                        fromCategoryName: "Unknown",
                        toCategoryId: move.toCategoryId,
                        toCategoryName: "Unknown",
                        amount: move.amount,
                        fromCategoryBalanceBefore: 0,
                        fromCategoryBalanceAfter: 0,
                        toCategoryBalanceBefore: 0,
                        toCategoryBalanceAfter: 0,
                        status: "failed",
                        error: "Category not found"
                    });
                    continue;
                }
                const amountMilliunits = Math.round(Math.abs(move.amount) * 1000);
                const fromBalanceBefore = fromCategory.budgeted;
                const toBalanceBefore = toCategory.budgeted;
                // For negative amounts, we're moving from accumulated savings (balance) to budgeted
                // For positive amounts, we're moving from budgeted to budgeted
                let fromBalanceAfter;
                let toBalanceAfter;
                if (move.amount < 0) {
                    // Moving from accumulated savings: reduce budgeted amount (make it more negative)
                    fromBalanceAfter = fromBalanceBefore - amountMilliunits;
                    toBalanceAfter = toBalanceBefore + amountMilliunits;
                }
                else {
                    // Moving from budgeted to budgeted
                    fromBalanceAfter = fromBalanceBefore - amountMilliunits;
                    toBalanceAfter = toBalanceBefore + amountMilliunits;
                }
                if (input.dryRun) {
                    moveResults.push({
                        fromCategoryId: move.fromCategoryId,
                        fromCategoryName: fromCategory.name,
                        toCategoryId: move.toCategoryId,
                        toCategoryName: toCategory.name,
                        amount: move.amount,
                        fromCategoryBalanceBefore: fromBalanceBefore / 1000,
                        fromCategoryBalanceAfter: fromBalanceAfter / 1000,
                        toCategoryBalanceBefore: toBalanceBefore / 1000,
                        toCategoryBalanceAfter: toBalanceAfter / 1000,
                        status: "simulated"
                    });
                }
                else {
                    try {
                        // Execute the move by updating both categories
                        await this.executeMove(budgetId, month, move.fromCategoryId, move.toCategoryId, amountMilliunits);
                        moveResults.push({
                            fromCategoryId: move.fromCategoryId,
                            fromCategoryName: fromCategory.name,
                            toCategoryId: move.toCategoryId,
                            toCategoryName: toCategory.name,
                            amount: move.amount,
                            fromCategoryBalanceBefore: fromBalanceBefore / 1000,
                            fromCategoryBalanceAfter: fromBalanceAfter / 1000,
                            toCategoryBalanceBefore: toBalanceBefore / 1000,
                            toCategoryBalanceAfter: toBalanceAfter / 1000,
                            status: "success"
                        });
                    }
                    catch (error) {
                        moveResults.push({
                            fromCategoryId: move.fromCategoryId,
                            fromCategoryName: fromCategory.name,
                            toCategoryId: move.toCategoryId,
                            toCategoryName: toCategory.name,
                            amount: move.amount,
                            fromCategoryBalanceBefore: fromBalanceBefore / 1000,
                            fromCategoryBalanceAfter: fromBalanceBefore / 1000,
                            toCategoryBalanceBefore: toBalanceBefore / 1000,
                            toCategoryBalanceAfter: toBalanceBefore / 1000,
                            status: "failed",
                            error: error instanceof Error ? error.message : "Unknown error"
                        });
                    }
                }
            }
            // Calculate totals (use absolute values for total amount moved)
            const totalAmount = input.moves.reduce((sum, move) => sum + Math.abs(move.amount), 0);
            const successfulMoves = moveResults.filter(r => r.status === "success" || r.status === "simulated").length;
            const failedMoves = moveResults.filter(r => r.status === "failed").length;
            const result = {
                month: monthData.month,
                totalMoves: input.moves.length,
                successfulMoves: successfulMoves,
                failedMoves: failedMoves,
                totalAmount: totalAmount,
                dryRun: input.dryRun || false,
                moves: moveResults.map(move => ({
                    fromCategory: move.fromCategoryName,
                    toCategory: move.toCategoryName,
                    amount: Math.abs(move.amount),
                    fromBalanceBefore: move.fromCategoryBalanceBefore,
                    fromBalanceAfter: move.fromCategoryBalanceAfter,
                    toBalanceBefore: move.toCategoryBalanceBefore,
                    toBalanceAfter: move.toCategoryBalanceAfter,
                    status: move.status,
                    error: move.error
                }))
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
            console.error(`Error moving funds between categories for budget ${budgetId}:`, error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error moving funds between categories: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
                    },
                ],
            };
        }
    }
    validateMoves(moves, categories) {
        const validMoves = [];
        const invalidMoves = [];
        for (const move of moves) {
            const fromCategory = categories.find(cat => cat.id === move.fromCategoryId);
            const toCategory = categories.find(cat => cat.id === move.toCategoryId);
            if (!fromCategory) {
                invalidMoves.push(`Source category ${move.fromCategoryId} not found`);
                continue;
            }
            if (!toCategory) {
                invalidMoves.push(`Target category ${move.toCategoryId} not found`);
                continue;
            }
            if (move.fromCategoryId === move.toCategoryId) {
                invalidMoves.push(`Cannot move funds from category to itself: ${fromCategory.name}`);
                continue;
            }
            if (move.amount === 0) {
                invalidMoves.push(`Amount must be non-zero: ${move.amount}`);
                continue;
            }
            const amountMilliunits = Math.round(Math.abs(move.amount) * 1000);
            const totalAvailable = fromCategory.budgeted + fromCategory.balance;
            if (totalAvailable < amountMilliunits) {
                invalidMoves.push(`Insufficient funds in ${fromCategory.name}: $${(totalAvailable / 1000).toFixed(2)} available (budgeted: $${(fromCategory.budgeted / 1000).toFixed(2)}, balance: $${(fromCategory.balance / 1000).toFixed(2)}), $${Math.abs(move.amount).toFixed(2)} requested`);
                continue;
            }
            validMoves.push(move);
        }
        return { validMoves, invalidMoves };
    }
    async executeMove(budgetId, month, fromCategoryId, toCategoryId, amountMilliunits) {
        console.log(`Moving $${(amountMilliunits / 1000).toFixed(2)} from category ${fromCategoryId} to ${toCategoryId} in month ${month}`);
        // Get current month data to get current budgeted amounts
        const monthResponse = await this.api.months.getBudgetMonth(budgetId, month);
        const monthData = monthResponse.data.month;
        const fromCategory = monthData.categories.find(cat => cat.id === fromCategoryId);
        const toCategory = monthData.categories.find(cat => cat.id === toCategoryId);
        if (!fromCategory || !toCategory) {
            throw new Error(`Category not found: ${!fromCategory ? fromCategoryId : toCategoryId}`);
        }
        // Calculate new budgeted amounts
        const fromNewBudgeted = fromCategory.budgeted - amountMilliunits;
        const toNewBudgeted = toCategory.budgeted + amountMilliunits;
        // Update the from category
        const fromUpdateData = {
            category: {
                budgeted: fromNewBudgeted
            }
        };
        await this.api.categories.updateMonthCategory(budgetId, month, fromCategoryId, fromUpdateData);
        // Update the to category
        const toUpdateData = {
            category: {
                budgeted: toNewBudgeted
            }
        };
        await this.api.categories.updateMonthCategory(budgetId, month, toCategoryId, toUpdateData);
        console.log(`Successfully moved $${(amountMilliunits / 1000).toFixed(2)} from ${fromCategory.name} to ${toCategory.name}`);
    }
}
export default MoveFundsBetweenCategoriesTool;
