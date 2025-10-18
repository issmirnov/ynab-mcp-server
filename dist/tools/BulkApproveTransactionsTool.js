import * as ynab from "ynab";
import { optimizeTransactions, withContextOptimization } from "../utils/contextOptimizer.js";
class BulkApproveTransactionsTool {
    api;
    budgetId;
    constructor() {
        this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
        this.budgetId = process.env.YNAB_BUDGET_ID || "";
    }
    getToolDefinition() {
        return {
            name: "bulk_approve_transactions",
            description: "Approve multiple transactions matching specified criteria in one operation. Supports various filters and natural language patterns.",
            inputSchema: {
                type: "object",
                properties: {
                    budgetId: {
                        type: "string",
                        description: "The ID of the budget to approve transactions for (optional, defaults to YNAB_BUDGET_ID environment variable)",
                    },
                    filters: {
                        type: "object",
                        properties: {
                            payee: {
                                type: "string",
                                description: "Filter by payee name (supports partial matching)",
                            },
                            category: {
                                type: "string",
                                description: "Filter by category name (supports partial matching)",
                            },
                            account: {
                                type: "string",
                                description: "Filter by account name (supports partial matching)",
                            },
                            minAmount: {
                                type: "number",
                                description: "Minimum transaction amount in dollars",
                            },
                            maxAmount: {
                                type: "number",
                                description: "Maximum transaction amount in dollars",
                            },
                            startDate: {
                                type: "string",
                                description: "Start date for transaction filter (YYYY-MM-DD format)",
                            },
                            endDate: {
                                type: "string",
                                description: "End date for transaction filter (YYYY-MM-DD format)",
                            },
                            memo: {
                                type: "string",
                                description: "Filter by memo text (supports partial matching)",
                            },
                        },
                        additionalProperties: false,
                    },
                    dryRun: {
                        type: "boolean",
                        default: false,
                        description: "If true, will not make any actual changes, just return what would be approved",
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
                        text: "No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.",
                    },
                ],
            };
        }
        try {
            console.log(`Bulk approving transactions for budget ${budgetId}`);
            // Get all transactions for the budget
            const transactionsResponse = await this.api.transactions.getTransactions(budgetId);
            const allTransactions = transactionsResponse.data.transactions.filter(t => !t.deleted);
            // Get accounts and categories for name resolution
            const accountsResponse = await this.api.accounts.getAccounts(budgetId);
            const accounts = accountsResponse.data.accounts;
            const categoriesResponse = await this.api.categories.getCategories(budgetId);
            const categories = categoriesResponse.data.category_groups.flatMap(group => group.categories);
            // Filter transactions based on criteria
            const filteredTransactions = this.filterTransactions(allTransactions, accounts, categories, input.filters || {});
            // Filter to only unapproved transactions
            const unapprovedTransactions = filteredTransactions.filter(t => !t.approved);
            if (unapprovedTransactions.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No unapproved transactions found matching the specified criteria. Total transactions checked: ${filteredTransactions.length}`,
                        },
                    ],
                };
            }
            // Execute approval if not dry run
            let approvedTransactions = [];
            if (!input.dryRun) {
                approvedTransactions = await this.approveTransactions(budgetId, unapprovedTransactions);
            }
            // Calculate totals
            const totalAmount = unapprovedTransactions.reduce((sum, t) => sum + t.amount, 0);
            const totalCount = unapprovedTransactions.length;
            const result = {
                budgetId: budgetId,
                totalTransactionsChecked: allTransactions.length,
                matchingTransactions: filteredTransactions.length,
                unapprovedTransactions: unapprovedTransactions.length,
                totalAmount: totalAmount / 1000,
                filters: input.filters || {},
                transactions: optimizeTransactions(unapprovedTransactions.map(t => ({
                    ...t,
                    account_name: accounts.find(a => a.id === t.account_id)?.name || "Unknown"
                })), { includeDetails: true }),
                approvedTransactions: approvedTransactions,
                dryRun: input.dryRun || false
            };
            return withContextOptimization(result, {
                maxTokens: 4000,
                summarizeTransactions: true
            });
        }
        catch (error) {
            console.error(`Error bulk approving transactions for budget ${budgetId}:`, error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error bulk approving transactions: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
                    },
                ],
            };
        }
    }
    filterTransactions(transactions, accounts, categories, filters) {
        return transactions.filter(transaction => {
            // Payee filter
            if (filters.payee) {
                const payeeName = transaction.payee_name?.toLowerCase() || "";
                if (!payeeName.includes(filters.payee.toLowerCase())) {
                    return false;
                }
            }
            // Category filter
            if (filters.category) {
                const categoryName = transaction.category_name?.toLowerCase() || "";
                if (!categoryName.includes(filters.category.toLowerCase())) {
                    return false;
                }
            }
            // Account filter
            if (filters.account) {
                const account = accounts.find(a => a.id === transaction.account_id);
                const accountName = account?.name?.toLowerCase() || "";
                if (!accountName.includes(filters.account.toLowerCase())) {
                    return false;
                }
            }
            // Amount filters
            if (filters.minAmount !== undefined) {
                const minAmountMilliunits = Math.round(filters.minAmount * 1000);
                if (transaction.amount < minAmountMilliunits) {
                    return false;
                }
            }
            if (filters.maxAmount !== undefined) {
                const maxAmountMilliunits = Math.round(filters.maxAmount * 1000);
                if (transaction.amount > maxAmountMilliunits) {
                    return false;
                }
            }
            // Date filters
            if (filters.startDate) {
                if (transaction.date < filters.startDate) {
                    return false;
                }
            }
            if (filters.endDate) {
                if (transaction.date > filters.endDate) {
                    return false;
                }
            }
            // Memo filter
            if (filters.memo) {
                const memo = transaction.memo?.toLowerCase() || "";
                if (!memo.includes(filters.memo.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });
    }
    async approveTransactions(budgetId, transactions) {
        const approvedTransactions = [];
        for (const transaction of transactions) {
            try {
                console.log(`Approving transaction: ${transaction.payee_name} - $${(transaction.amount / 1000).toFixed(2)} on ${transaction.date}`);
                // Update transaction to approved
                const updateData = {
                    transaction: {
                        account_id: transaction.account_id,
                        date: transaction.date,
                        amount: transaction.amount,
                        payee_id: transaction.payee_id,
                        payee_name: transaction.payee_name,
                        category_id: transaction.category_id,
                        memo: transaction.memo,
                        cleared: transaction.cleared,
                        approved: true,
                        flag_color: transaction.flag_color,
                        subtransactions: transaction.subtransactions
                    }
                };
                await this.api.transactions.updateTransaction(budgetId, transaction.id, updateData);
                approvedTransactions.push({
                    id: transaction.id,
                    payeeName: transaction.payee_name,
                    amount: transaction.amount / 1000,
                    date: transaction.date,
                    status: "success"
                });
            }
            catch (error) {
                console.error(`Error approving transaction ${transaction.id}:`, error);
                approvedTransactions.push({
                    id: transaction.id,
                    payeeName: transaction.payee_name,
                    amount: transaction.amount / 1000,
                    date: transaction.date,
                    status: "failed",
                    error: error instanceof Error ? error.message : "Unknown error"
                });
            }
        }
        return approvedTransactions;
    }
}
export default BulkApproveTransactionsTool;
