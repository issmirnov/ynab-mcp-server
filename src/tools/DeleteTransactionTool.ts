import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, milliUnitsToAmount, formatCurrency } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

const YNAB_BASE_URL = "https://api.ynab.com/v1";

interface DeleteTransactionInput {
  budgetId?: string;
  transactionId: string;
  response_format?: "json" | "markdown";
}

class DeleteTransactionTool {
  private api: ynab.API;
  private budgetId: string;
  private accessToken: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
    this.accessToken = runtime.accessToken;
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_delete_transaction",
      description:
        "Deletes a transaction from your YNAB budget. This action is permanent and cannot be undone. Use ynab_list_transactions to find the transaction ID.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget. Optional when a default budget is set or only one budget exists.",
          },
          transactionId: {
            type: "string",
            description: "The ID of the transaction to delete.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown).",
          },
        },
        required: ["transactionId"],
        additionalProperties: false,
      },
      annotations: {
        title: "Delete YNAB Transaction",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: DeleteTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      // Fetch the transaction first so we can show what was deleted
      const existing = await createRetryableAPICall(
        () => this.api.transactions.getTransactionById(budgetId, input.transactionId),
        "Get transaction before delete"
      );

      const txn = existing.data.transaction;

      // SDK doesn't expose deleteTransaction, so use raw fetch
      await createRetryableAPICall(async () => {
        const url = `${YNAB_BASE_URL}/budgets/${budgetId}/transactions/${input.transactionId}`;
        const response = await fetch(url, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`YNAB API error ${response.status}: ${errorBody}`);
        }

        return response.json();
      }, "Delete transaction");

      const result = {
        success: true,
        deleted: {
          id: txn.id,
          date: txn.date,
          payeeName: txn.payee_name,
          amount: milliUnitsToAmount(txn.amount),
          accountName: txn.account_name,
          categoryName: txn.category_name,
          memo: txn.memo,
        },
        message: "Transaction deleted successfully",
      };

      const format = input.response_format || "markdown";
      let responseText: string;

      if (format === "json") {
        responseText = JSON.stringify(result, null, 2);
      } else {
        responseText = this.formatMarkdown(result);
      }

      const { text } = truncateResponse(responseText, CHARACTER_LIMIT);

      return {
        content: [{ type: "text", text }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error deleting transaction: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private formatMarkdown(result: {
    success: boolean;
    deleted: {
      id: string;
      date: string;
      payeeName?: string | null;
      amount: number;
      accountName: string;
      categoryName?: string | null;
      memo?: string | null;
    };
    message: string;
  }): string {
    let output = "# Transaction Deleted\n\n";
    output += `✅ ${result.message}\n\n`;
    output += "## Deleted Transaction\n";
    output += `- **Date:** ${result.deleted.date}\n`;
    output += `- **Payee:** ${result.deleted.payeeName || "Unknown"}\n`;
    output += `- **Amount:** ${formatCurrency(result.deleted.amount)}\n`;
    output += `- **Account:** ${result.deleted.accountName}\n`;
    if (result.deleted.categoryName) {
      output += `- **Category:** ${result.deleted.categoryName}\n`;
    }
    if (result.deleted.memo) {
      output += `- **Memo:** ${result.deleted.memo}\n`;
    }
    output += `- **ID:** \`${result.deleted.id}\`\n`;
    return output;
  }
}

export default DeleteTransactionTool;
