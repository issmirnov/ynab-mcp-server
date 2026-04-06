import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, amountToMilliUnits, milliUnitsToAmount, formatCurrency } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface UpdateTransactionInput {
  budgetId?: string;
  transactionId: string;
  amount?: number;
  date?: string;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string | null;
  approved?: boolean;
  cleared?: "cleared" | "uncleared" | "reconciled";
  response_format?: "json" | "markdown";
}

class UpdateTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_update_transaction",
      description:
        "Updates an existing transaction in your YNAB budget. Only the fields you provide will be changed; all other fields remain as-is. Use ynab_list_transactions to find the transaction ID.",
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
            description: "The ID of the transaction to update.",
          },
          amount: {
            type: "number",
            description:
              "New amount in dollars with up to two decimal places. Use negative for expenses (e.g. -42.50), positive for income (e.g. 1250.00). Do NOT send milliunits or cents — just the dollar amount as you would see it on a bank statement.",
          },
          date: {
            type: "string",
            description: "New transaction date in ISO format (e.g. 2024-03-24). Must not be a future date.",
          },
          payeeId: {
            type: "string",
            description: "New payee ID.",
          },
          payeeName: {
            type: "string",
            description:
              "New payee name. A new payee will be created if no match is found. When provided without payeeId, the existing payee link is cleared so YNAB resolves the new name.",
          },
          categoryId: {
            type: "string",
            description:
              "New category ID. Credit Card Payment categories are not permitted.",
          },
          memo: {
            type: "string",
            description: "New memo/note for the transaction.",
          },
          flagColor: {
            type: ["string", "null"],
            enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
            description: "New flag color, or null to remove the flag.",
          },
          approved: {
            type: "boolean",
            description: "Set to true to approve, false to unapprove.",
          },
          cleared: {
            type: "string",
            enum: ["cleared", "uncleared", "reconciled"],
            description: "New cleared status for the transaction.",
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
        title: "Update YNAB Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: UpdateTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      // Fetch existing transaction to show changes
      const existing = await createRetryableAPICall(
        () => this.api.transactions.getTransactionById(budgetId, input.transactionId),
        "Get transaction for update"
      );

      const current = existing.data.transaction;

      const transaction: ynab.ExistingTransaction = {};

      if (input.amount !== undefined) {
        transaction.amount = amountToMilliUnits(input.amount);
      }
      if (input.date !== undefined) {
        transaction.date = input.date;
      }
      if (input.payeeName !== undefined && input.payeeId === undefined) {
        transaction.payee_id = null;
        transaction.payee_name = input.payeeName;
      } else {
        if (input.payeeId !== undefined) {
          transaction.payee_id = input.payeeId;
        }
        if (input.payeeName !== undefined) {
          transaction.payee_name = input.payeeName;
        }
      }
      if (input.categoryId !== undefined) {
        transaction.category_id = input.categoryId;
      }
      if (input.memo !== undefined) {
        transaction.memo = input.memo;
      }
      if (input.flagColor !== undefined) {
        transaction.flag_color = input.flagColor as ynab.TransactionFlagColor | null;
      }
      if (input.approved !== undefined) {
        transaction.approved = input.approved;
      }
      if (input.cleared !== undefined) {
        transaction.cleared = input.cleared as ynab.TransactionClearedStatus;
      }

      const response = await createRetryableAPICall(
        () =>
          this.api.transactions.updateTransaction(
            budgetId,
            input.transactionId,
            { transaction }
          ),
        "Update transaction"
      );

      if (!response.data.transaction) {
        throw new Error("Failed to update transaction - no data returned");
      }

      const updated = response.data.transaction;
      const changes = this.describeChanges(current, updated);

      const result = {
        success: true,
        transactionId: updated.id,
        date: updated.date,
        amount: milliUnitsToAmount(updated.amount),
        payeeName: updated.payee_name,
        categoryName: updated.category_name,
        accountName: updated.account_name,
        memo: updated.memo,
        approved: updated.approved,
        cleared: updated.cleared,
        flagColor: updated.flag_color,
        changes,
        message: "Transaction updated successfully",
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
            text: `Error updating transaction: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private describeChanges(
    before: ynab.TransactionDetail,
    after: ynab.TransactionDetail
  ): string[] {
    const changes: string[] = [];

    if (before.amount !== after.amount) {
      changes.push(
        `Amount: ${formatCurrency(milliUnitsToAmount(before.amount))} → ${formatCurrency(milliUnitsToAmount(after.amount))}`
      );
    }
    if (before.date !== after.date) {
      changes.push(`Date: ${before.date} → ${after.date}`);
    }
    if (before.payee_name !== after.payee_name) {
      changes.push(
        `Payee: ${before.payee_name || "(none)"} → ${after.payee_name || "(none)"}`
      );
    }
    if (before.category_name !== after.category_name) {
      changes.push(
        `Category: ${before.category_name || "(none)"} → ${after.category_name || "(none)"}`
      );
    }
    if (before.memo !== after.memo) {
      changes.push(`Memo: "${before.memo || ""}" → "${after.memo || ""}"`);
    }
    if (before.approved !== after.approved) {
      changes.push(`Approved: ${before.approved} → ${after.approved}`);
    }
    if (before.cleared !== after.cleared) {
      changes.push(`Cleared: ${before.cleared} → ${after.cleared}`);
    }
    if (before.flag_color !== after.flag_color) {
      changes.push(
        `Flag: ${before.flag_color || "(none)"} → ${after.flag_color || "(none)"}`
      );
    }

    return changes;
  }

  private formatMarkdown(result: {
    success: boolean;
    transactionId: string;
    date: string;
    amount: number;
    payeeName?: string | null;
    categoryName?: string | null;
    accountName: string;
    memo?: string | null;
    approved: boolean;
    cleared: string;
    flagColor?: string | null;
    changes: string[];
    message: string;
  }): string {
    let output = "# Transaction Updated Successfully\n\n";
    output += `✅ ${result.message}\n\n`;

    if (result.changes.length > 0) {
      output += "## Changes\n";
      for (const change of result.changes) {
        output += `- ${change}\n`;
      }
      output += "\n";
    }

    output += "## Current State\n";
    output += `- **ID:** \`${result.transactionId}\`\n`;
    output += `- **Date:** ${result.date}\n`;
    output += `- **Amount:** ${formatCurrency(result.amount)}\n`;
    output += `- **Account:** ${result.accountName}\n`;
    if (result.payeeName) {
      output += `- **Payee:** ${result.payeeName}\n`;
    }
    if (result.categoryName) {
      output += `- **Category:** ${result.categoryName}\n`;
    }
    if (result.memo) {
      output += `- **Memo:** ${result.memo}\n`;
    }
    output += `- **Approved:** ${result.approved ? "Yes" : "No"}\n`;
    output += `- **Cleared:** ${result.cleared}\n`;
    if (result.flagColor) {
      output += `- **Flag:** ${result.flagColor}\n`;
    }

    return output;
  }
}

export default UpdateTransactionTool;
