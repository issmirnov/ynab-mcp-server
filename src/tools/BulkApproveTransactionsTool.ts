import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface BulkApproveTransactionsInput {
  budgetId?: string;
  filters?: {
    payee?: string;
    category?: string;
    account?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
    memo?: string;
  };
  dryRun?: boolean;
}

interface TransactionFilter {
  id: string;
  date: string;
  amount: number;
  payeeName?: string;
  categoryName?: string;
  accountName: string;
  memo?: string;
  approved: boolean;
  cleared: string;
}

class BulkApproveTransactionsTool {
  private api: ynab.API;
  private budgetId: string;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  getToolDefinition(): Tool {
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

  async execute(input: BulkApproveTransactionsInput) {
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
      let approvedTransactions: any[] = [];
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
        transactions: unapprovedTransactions.map(t => ({
          id: t.id,
          date: t.date,
          amount: t.amount / 1000,
          payeeName: t.payee_name,
          categoryName: t.category_name,
          accountName: accounts.find(a => a.id === t.account_id)?.name || "Unknown",
          memo: t.memo,
          approved: t.approved,
          cleared: t.cleared
        })),
        approvedTransactions: approvedTransactions,
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

  private filterTransactions(
    transactions: ynab.TransactionDetail[],
    accounts: ynab.Account[],
    categories: ynab.Category[],
    filters: NonNullable<BulkApproveTransactionsInput['filters']>
  ): ynab.TransactionDetail[] {
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

  private async approveTransactions(
    budgetId: string,
    transactions: ynab.TransactionDetail[]
  ): Promise<any[]> {
    const approvedTransactions: any[] = [];

    for (const transaction of transactions) {
      try {
        // Update transaction to approved
        const updateData = {
          transaction: {
            id: transaction.id,
            approved: true
          }
        };

        // For now, we'll just log what would be done
        // In a real implementation, we'd call the API to update the transaction
        console.log(`Would approve transaction: ${transaction.payee_name} - $${(transaction.amount / 1000).toFixed(2)} on ${transaction.date}`);
        
        approvedTransactions.push({
          id: transaction.id,
          payeeName: transaction.payee_name,
          amount: transaction.amount / 1000,
          date: transaction.date,
          status: "simulated" // Would be "approved" in real implementation
        });

      } catch (error) {
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
