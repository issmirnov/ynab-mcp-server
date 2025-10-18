import * as ynab from "ynab";
class CreateTransactionTool {
    api;
    budgetId;
    constructor() {
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    getToolDefinition() {
        return {
            name: "create_transaction",
            description: "Creates a new transaction in your YNAB budget. Either payee_id or payee_name must be provided in addition to the other required fields.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The id of the budget to create the transaction in (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
                    },
                    accountId: {
                        type: "string",
                        description: "The id of the account to create the transaction in",
                    },
                    date: {
                        type: "string",
                        description: "The date of the transaction in ISO format (e.g. 2024-03-24)",
                    },
                    amount: {
                        type: "number",
                        description: "The amount in dollars (e.g. 10.99)",
                    },
                    payeeId: {
                        type: "string",
                        description: "The id of the payee (optional if payee_name is provided)",
                    },
                    payeeName: {
                        type: "string",
                        description: "The name of the payee (optional if payee_id is provided)",
                    },
                    categoryId: {
                        type: "string",
                        description: "The category id for the transaction (optional)",
                    },
                    memo: {
                        type: "string",
                        description: "A memo/note for the transaction (optional)",
                    },
                    cleared: {
                        type: "boolean",
                        description: "Whether the transaction is cleared (optional, defaults to false)",
                    },
                    approved: {
                        type: "boolean",
                        description: "Whether the transaction is approved (optional, defaults to false)",
                    },
                    flagColor: {
                        type: "string",
                        description: "The transaction flag color (red, orange, yellow, green, blue, purple) (optional)",
                    },
                },
                required: ["accountId", "date", "amount"],
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
        if (!input.payeeId && !input.payeeName) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Either payee_id or payee_name must be provided",
                    },
                ],
            };
        }
        const milliunitAmount = Math.round(input.amount * 1000);
        try {
            const transaction = {
                transaction: {
                    account_id: input.accountId,
                    date: input.date,
                    amount: milliunitAmount,
                    payee_id: input.payeeId,
                    payee_name: input.payeeName,
                    category_id: input.categoryId,
                    memo: input.memo,
                    cleared: input.cleared ? ynab.TransactionClearedStatus.Cleared : ynab.TransactionClearedStatus.Uncleared,
                    approved: input.approved ?? false,
                    flag_color: input.flagColor,
                }
            };
            const response = await this.api.transactions.createTransaction(budgetId, transaction);
            if (!response.data.transaction) {
                throw new Error("Failed to create transaction - no transaction data returned");
            }
            const result = {
                success: true,
                transactionId: response.data.transaction.id,
                message: "Transaction created successfully",
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
            const result = {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error occurred",
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
    }
}
export default CreateTransactionTool;
