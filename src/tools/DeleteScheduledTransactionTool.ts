import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, milliUnitsToAmount, formatCurrency } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface DeleteScheduledTransactionInput {
  budgetId?: string;
  scheduledTransactionId: string;
  response_format?: "json" | "markdown";
}

class DeleteScheduledTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_delete_scheduled_transaction",
      description:
        "Deletes a scheduled (recurring) transaction from your YNAB budget. This action is permanent and cannot be undone. Use ynab_list_scheduled_transactions to find the scheduled transaction ID.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget. Optional when a default budget is set or only one budget exists.",
          },
          scheduledTransactionId: {
            type: "string",
            description: "The ID of the scheduled transaction to delete.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown).",
          },
        },
        required: ["scheduledTransactionId"],
        additionalProperties: false,
      },
      annotations: {
        title: "Delete YNAB Scheduled Transaction",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: DeleteScheduledTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      // Fetch the transaction first so we can show what was deleted
      const existing = await createRetryableAPICall(
        () =>
          this.api.scheduledTransactions.getScheduledTransactionById(
            budgetId,
            input.scheduledTransactionId
          ),
        "Get scheduled transaction before delete"
      );

      const st = existing.data.scheduled_transaction;

      await createRetryableAPICall(
        () =>
          this.api.scheduledTransactions.deleteScheduledTransaction(
            budgetId,
            input.scheduledTransactionId
          ),
        "Delete scheduled transaction"
      );

      const result = {
        success: true,
        deleted: {
          id: st.id,
          payeeName: st.payee_name,
          amount: milliUnitsToAmount(st.amount),
          frequency: st.frequency,
          accountName: st.account_name,
          categoryName: st.category_name,
        },
        message: "Scheduled transaction deleted successfully",
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
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error deleting scheduled transaction: ${
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
      payeeName?: string | null;
      amount: number;
      frequency: string;
      accountName: string;
      categoryName?: string | null;
    };
    message: string;
  }): string {
    let output = "# Scheduled Transaction Deleted\n\n";
    output += `✅ ${result.message}\n\n`;
    output += "## Deleted Transaction\n";
    output += `- **Payee:** ${result.deleted.payeeName || "Unknown"}\n`;
    output += `- **Amount:** ${formatCurrency(result.deleted.amount)}\n`;
    output += `- **Frequency:** ${result.deleted.frequency}\n`;
    output += `- **Account:** ${result.deleted.accountName}\n`;
    if (result.deleted.categoryName) {
      output += `- **Category:** ${result.deleted.categoryName}\n`;
    }
    output += `- **ID:** \`${result.deleted.id}\`\n`;
    return output;
  }
}

export default DeleteScheduledTransactionTool;
