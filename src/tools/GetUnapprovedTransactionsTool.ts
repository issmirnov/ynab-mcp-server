import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface GetUnapprovedTransactionsInput {
  budgetId?: string;
}

class GetUnapprovedTransactionsTool {
  private api: ynab.API;
  private budgetId: string;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "get_unapproved_transactions",
      description: "Gets unapproved transactions from a budget. First time pulls last 3 days, subsequent pulls use server knowledge to get only changes.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to fetch transactions for (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
          },
        },
        additionalProperties: false,
      },
    };
  }

  async execute(input: GetUnapprovedTransactionsInput) {
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
      console.error(`Getting unapproved transactions for budget ${budgetId}`);

      const response = await this.api.transactions.getTransactions(
        budgetId,
        undefined,
        ynab.GetTransactionsTypeEnum.Unapproved
      );

      // Transform the transactions to a more readable format
      const transactions = this.transformTransactions(
        response.data.transactions
      );

      const result = {
        transactions,
        transaction_count: transactions.length,
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
      console.error(
        `Error getting unapproved transactions for budget ${budgetId}:`
      );
      console.error(JSON.stringify(error, null, 2));
      return {
        content: [
          {
            type: "text",
            text: `Error getting unapproved transactions: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`,
          },
        ],
      };
    }
  }

  private transformTransactions(transactions: ynab.TransactionDetail[]) {
    return transactions
      .filter((transaction) => !transaction.deleted)
      .map((transaction) => ({
        id: transaction.id,
        date: transaction.date,
        amount: (transaction.amount / 1000).toFixed(2), // Convert milliunits to actual currency
        memo: transaction.memo,
        approved: transaction.approved,
        account_name: transaction.account_name,
        payee_name: transaction.payee_name,
        category_name: transaction.category_name,
        transfer_account_id: transaction.transfer_account_id,
        transfer_transaction_id: transaction.transfer_transaction_id,
        matched_transaction_id: transaction.matched_transaction_id,
        import_id: transaction.import_id,
      }));
  }
}

export default GetUnapprovedTransactionsTool;
