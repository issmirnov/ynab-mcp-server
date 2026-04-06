import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, amountToMilliUnits, milliUnitsToAmount, formatCurrency } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface UpdateScheduledTransactionInput {
  budgetId?: string;
  scheduledTransactionId: string;
  accountId?: string;
  date?: string;
  amount?: number;
  frequency?: string;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string | null;
  response_format?: "json" | "markdown";
}

class UpdateScheduledTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_update_scheduled_transaction",
      description:
        "Updates an existing scheduled (recurring) transaction in your YNAB budget. Only the fields you provide will be changed; all other fields remain as-is. Use ynab_list_scheduled_transactions to find the scheduled transaction ID.",
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
            description: "The ID of the scheduled transaction to update.",
          },
          accountId: {
            type: "string",
            description: "New account ID for the scheduled transaction.",
          },
          date: {
            type: "string",
            description:
              "New next occurrence date in ISO format (e.g. 2024-03-24). Must be a future date no more than 5 years out.",
          },
          amount: {
            type: "number",
            description:
              "New amount in dollars (e.g. 10.99). Use negative values for expenses, positive for income.",
          },
          frequency: {
            type: "string",
            enum: [
              "never",
              "daily",
              "weekly",
              "everyOtherWeek",
              "twiceAMonth",
              "every4Weeks",
              "monthly",
              "everyOtherMonth",
              "every3Months",
              "every4Months",
              "twiceAYear",
              "yearly",
              "everyOtherYear",
            ],
            description:
              "New recurrence frequency. Use 'never' for a one-time scheduled transaction.",
          },
          payeeId: {
            type: "string",
            description: "New payee ID.",
          },
          payeeName: {
            type: "string",
            description:
              "New payee name. A new payee will be created if no match is found.",
          },
          categoryId: {
            type: "string",
            description:
              "New category ID. Credit Card Payment categories are not permitted.",
          },
          memo: {
            type: "string",
            description: "New memo/note for the scheduled transaction.",
          },
          flagColor: {
            type: ["string", "null"],
            enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
            description:
              "New flag color, or null to remove the flag.",
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
        title: "Update YNAB Scheduled Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: UpdateScheduledTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      // Fetch existing transaction to merge with updates
      const existing = await createRetryableAPICall(
        () =>
          this.api.scheduledTransactions.getScheduledTransactionById(
            budgetId,
            input.scheduledTransactionId
          ),
        "Get scheduled transaction for update"
      );

      const current = existing.data.scheduled_transaction;

      const scheduledTransaction: ynab.PutScheduledTransactionWrapper = {
        scheduled_transaction: {
          account_id: input.accountId || current.account_id,
          date: input.date || current.date_next,
          amount:
            input.amount !== undefined
              ? amountToMilliUnits(input.amount)
              : current.amount,
          frequency:
            (input.frequency as ynab.ScheduledTransactionFrequency) ||
            current.frequency,
          payee_id: input.payeeName !== undefined && input.payeeId === undefined
            ? null
            : input.payeeId !== undefined ? input.payeeId : current.payee_id,
          payee_name:
            input.payeeName !== undefined ? input.payeeName : current.payee_name,
          category_id:
            input.categoryId !== undefined
              ? input.categoryId
              : current.category_id,
          memo: input.memo !== undefined ? input.memo : current.memo,
          flag_color:
            input.flagColor !== undefined
              ? (input.flagColor as ynab.TransactionFlagColor | null)
              : current.flag_color,
        },
      };

      const response = await createRetryableAPICall(
        () =>
          this.api.scheduledTransactions.updateScheduledTransaction(
            budgetId,
            input.scheduledTransactionId,
            scheduledTransaction
          ),
        "Update scheduled transaction"
      );

      if (!response.data.scheduled_transaction) {
        throw new Error(
          "Failed to update scheduled transaction - no data returned"
        );
      }

      const st = response.data.scheduled_transaction;
      const changes = this.describeChanges(current, st);

      const result = {
        success: true,
        scheduledTransactionId: st.id,
        frequency: st.frequency,
        nextDate: st.date_next,
        amount: milliUnitsToAmount(st.amount),
        payeeName: st.payee_name,
        categoryName: st.category_name,
        accountName: st.account_name,
        memo: st.memo,
        flagColor: st.flag_color,
        changes,
        message: "Scheduled transaction updated successfully",
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
            text: `Error updating scheduled transaction: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private describeChanges(
    before: ynab.ScheduledTransactionDetail,
    after: ynab.ScheduledTransactionDetail
  ): string[] {
    const changes: string[] = [];

    if (before.amount !== after.amount) {
      changes.push(
        `Amount: ${formatCurrency(milliUnitsToAmount(before.amount))} → ${formatCurrency(milliUnitsToAmount(after.amount))}`
      );
    }
    if (before.frequency !== after.frequency) {
      changes.push(`Frequency: ${before.frequency} → ${after.frequency}`);
    }
    if (before.date_next !== after.date_next) {
      changes.push(`Next date: ${before.date_next} → ${after.date_next}`);
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
    if (before.account_name !== after.account_name) {
      changes.push(
        `Account: ${before.account_name} → ${after.account_name}`
      );
    }
    if (before.memo !== after.memo) {
      changes.push(
        `Memo: "${before.memo || ""}" → "${after.memo || ""}"`
      );
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
    scheduledTransactionId: string;
    frequency: string;
    nextDate: string;
    amount: number;
    payeeName?: string | null;
    categoryName?: string | null;
    accountName: string;
    memo?: string | null;
    flagColor?: string | null;
    changes: string[];
    message: string;
  }): string {
    let output = "# Scheduled Transaction Updated Successfully\n\n";
    output += `✅ ${result.message}\n\n`;

    if (result.changes.length > 0) {
      output += "## Changes\n";
      for (const change of result.changes) {
        output += `- ${change}\n`;
      }
      output += "\n";
    }

    output += "## Current State\n";
    output += `- **ID:** \`${result.scheduledTransactionId}\`\n`;
    output += `- **Amount:** ${formatCurrency(result.amount)}\n`;
    output += `- **Frequency:** ${result.frequency}\n`;
    output += `- **Next Date:** ${result.nextDate}\n`;
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
    if (result.flagColor) {
      output += `- **Flag:** ${result.flagColor}\n`;
    }

    return output;
  }
}

export default UpdateScheduledTransactionTool;
