import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface UpdateTransactionInput {
  budgetId?: string;
  transactionId: string;
  approved?: boolean;
}

class ApproveTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = process.env.YNAB_BUDGET_ID || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "approve_transaction",
      description: "Approves an existing transaction in your YNAB budget.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The id of the budget containing the transaction (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
          },
          transactionId: {
            type: "string",
            description: "The id of the transaction to approve",
          },
          approved: {
            type: "boolean",
            default: true,
            description: "Whether the transaction should be marked as approved",
          },
        },
        required: ["transactionId"],
        additionalProperties: false,
      },
    };
  }

  async execute(input: UpdateTransactionInput) {
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
      // First, get the existing transaction to ensure we don't lose any data
      const existingTransaction = await this.api.transactions.getTransactionById(budgetId, input.transactionId);

      if (!existingTransaction.data.transaction) {
        throw new Error("Transaction not found");
      }

      const existingTransactionData = existingTransaction.data.transaction;

      const transaction: ynab.PutTransactionWrapper = {
        transaction: {
          approved: input.approved,
        }
      };

      const response = await this.api.transactions.updateTransaction(
        budgetId,
        existingTransactionData.id,
        transaction
      );

      if (!response.data.transaction) {
        throw new Error("Failed to update transaction - no transaction data returned");
      }

      const result = {
        success: true,
        transactionId: response.data.transaction.id,
        message: "Transaction updated successfully",
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
        `Error updating transaction for budget ${budgetId}:`
      );
      console.error(JSON.stringify(error, null, 2));
      return {
        content: [
          {
            type: "text",
            text: `Error updating transaction: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`,
          },
        ],
      };
    }
  }
}

export default ApproveTransactionTool;