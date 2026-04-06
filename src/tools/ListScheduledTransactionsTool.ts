import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, milliUnitsToAmount, formatCurrency, formatDate } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface ListScheduledTransactionsInput {
  budgetId?: string;
  response_format?: "json" | "markdown";
  limit?: number;
  offset?: number;
}

interface ScheduledTransactionResult {
  id: string;
  date_first: string;
  date_next: string;
  frequency: string;
  amount: number;
  memo?: string;
  account_name: string;
  payee_name?: string;
  category_name?: string;
  flag_color?: string;
  flag_name?: string;
  deleted: boolean;
}

class ListScheduledTransactionsTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_list_scheduled_transactions",
      description:
        "Lists all scheduled (recurring) transactions in a YNAB budget. Returns transaction IDs needed for updating or deleting scheduled transactions.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget. Optional when a default budget is set or only one budget exists.",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown).",
          },
          limit: {
            type: "number",
            default: 50,
            description: "Maximum number of scheduled transactions to return (default: 50, max: 100).",
          },
          offset: {
            type: "number",
            default: 0,
            description: "Number of scheduled transactions to skip (default: 0).",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        title: "List YNAB Scheduled Transactions",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    };
  }

  async execute(input: ListScheduledTransactionsInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      const response = await createRetryableAPICall(
        () => this.api.scheduledTransactions.getScheduledTransactions(budgetId),
        "List scheduled transactions"
      );

      const allTransactions = response.data.scheduled_transactions.filter(
        (t) => !t.deleted
      );

      const transformed = allTransactions.map((t) => this.transformTransaction(t));

      // Apply pagination
      const limit = Math.min(input.limit || 50, 100);
      const offset = input.offset || 0;
      const total = transformed.length;
      const paginated = transformed.slice(offset, offset + limit);
      const hasMore = offset + limit < total;
      const nextOffset = hasMore ? offset + limit : null;

      const result = {
        scheduled_transactions: paginated,
        pagination: {
          total,
          count: paginated.length,
          offset,
          limit,
          has_more: hasMore,
          next_offset: nextOffset,
        },
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
            text: `Error listing scheduled transactions: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private transformTransaction(
    t: ynab.ScheduledTransactionDetail
  ): ScheduledTransactionResult {
    return {
      id: t.id,
      date_first: t.date_first,
      date_next: t.date_next,
      frequency: t.frequency,
      amount: milliUnitsToAmount(t.amount),
      memo: t.memo || undefined,
      account_name: t.account_name,
      payee_name: t.payee_name || undefined,
      category_name: t.category_name || undefined,
      flag_color: t.flag_color || undefined,
      flag_name: t.flag_name || undefined,
      deleted: t.deleted,
    };
  }

  private formatMarkdown(result: {
    scheduled_transactions: ScheduledTransactionResult[];
    pagination: {
      total: number;
      count: number;
      offset: number;
      limit: number;
      has_more: boolean;
      next_offset: number | null;
    };
  }): string {
    let output = "# Scheduled Transactions\n\n";
    output += `Found ${result.pagination.total} scheduled transaction(s) total\n`;
    output += `Showing ${result.pagination.count} (offset: ${result.pagination.offset}, limit: ${result.pagination.limit})\n\n`;

    if (result.scheduled_transactions.length === 0) {
      output += "No scheduled transactions found.\n";
      return output;
    }

    for (const txn of result.scheduled_transactions) {
      output += `### ${txn.payee_name || "Unknown Payee"}\n`;
      output += `- **Amount:** ${formatCurrency(txn.amount)}\n`;
      output += `- **Frequency:** ${txn.frequency}\n`;
      output += `- **Next Date:** ${formatDate(txn.date_next)}\n`;
      output += `- **First Date:** ${formatDate(txn.date_first)}\n`;
      output += `- **Account:** ${txn.account_name}\n`;
      if (txn.category_name) {
        output += `- **Category:** ${txn.category_name}\n`;
      }
      if (txn.memo) {
        output += `- **Memo:** ${txn.memo}\n`;
      }
      if (txn.flag_color) {
        output += `- **Flag:** ${txn.flag_name || txn.flag_color}\n`;
      }
      output += `- **ID:** \`${txn.id}\`\n`;
      output += "\n";
    }

    output += "---\n\n";
    output += "## Pagination\n";
    output += `- **Total**: ${result.pagination.total}\n`;
    output += `- **Count**: ${result.pagination.count}\n`;
    output += `- **Offset**: ${result.pagination.offset}\n`;
    output += `- **Limit**: ${result.pagination.limit}\n`;
    output += `- **Has More**: ${result.pagination.has_more}\n`;
    if (result.pagination.next_offset !== null) {
      output += `- **Next Offset**: ${result.pagination.next_offset}\n`;
    }

    return output;
  }
}

export default ListScheduledTransactionsTool;
