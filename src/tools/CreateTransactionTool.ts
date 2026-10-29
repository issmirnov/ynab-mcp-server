import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBudgetId, amountToMilliUnits, truncateResponse, CHARACTER_LIMIT } from "../utils/commonUtils.js";
import { createRetryableAPICall, describeAPIError } from "../utils/apiErrorHandler.js";
import {
  formatSplitLinesMarkdown,
  subtransactionsSchema,
  summarizeSubtransactions,
  toSaveSubTransactions,
  type SplitLineInput,
  type SubtransactionSummary,
} from "../utils/splitTransactions.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface CreateTransactionInput {
  budgetId?: string;
  accountId: string;
  date: string;
  amount: number;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  cleared?: boolean;
  approved?: boolean;
  flagColor?: string;
  subtransactions?: SplitLineInput[];
  response_format?: "json" | "markdown";
}

interface CreateTransactionResult {
  success: boolean;
  transactionId: string;
  message: string;
  subtransactions?: SubtransactionSummary[];
}

class CreateTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_create_transaction",
      description: "Creates a new transaction in your YNAB budget. Either payee_id or payee_name must be provided in addition to the other required fields. To split it across categories, pass subtransactions instead of categoryId.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to create the transaction in. Optional when a default budget is set or only one budget exists.",
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
            description: "The transaction amount in dollars with up to two decimal places. Use negative for expenses (e.g. -42.50), positive for income (e.g. 1250.00). Do NOT send milliunits or cents — just the dollar amount as you would see it on a bank statement.",
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
            description: "The category id for the transaction (optional). Leave it out when you pass subtransactions.",
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
          subtransactions: subtransactionsSchema(
            "Split the transaction across categories (optional). List at least 2 lines; their amounts must add up exactly to `amount`. Leave categoryId out when you split."
          ),
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description: "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown)",
          },
        },
        required: ["accountId", "date", "amount"],
        additionalProperties: false,
      },
      annotations: {
        title: "Create YNAB Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: CreateTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if(!input.payeeId && !input.payeeName) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Either payee_id or payee_name must be provided",
            },
          ],
        };
      }

      const milliunitAmount = amountToMilliUnits(input.amount);

      let subtransactions: ynab.SaveSubTransaction[] | undefined;
      if (input.subtransactions !== undefined) {
        if (input.categoryId) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "Pass either categoryId or subtransactions, not both. A split transaction takes its categories from its lines.",
              },
            ],
          };
        }

        const split = toSaveSubTransactions(input.subtransactions, milliunitAmount);
        if ("error" in split) {
          return {
            isError: true,
            content: [{ type: "text", text: split.error }],
          };
        }
        subtransactions = split.subtransactions;
      }

      const transaction: ynab.PostTransactionsWrapper = {
        transaction: {
          account_id: input.accountId,
          date: input.date,
          amount: milliunitAmount,
          payee_id: input.payeeId,
          payee_name: input.payeeName,
          // A split takes its categories from its lines.
          category_id: subtransactions ? undefined : input.categoryId,
          memo: input.memo,
          cleared: input.cleared ? ynab.TransactionClearedStatus.Cleared : ynab.TransactionClearedStatus.Uncleared,
          approved: input.approved ?? false,
          flag_color: input.flagColor as ynab.TransactionFlagColor,
          subtransactions,
        }
      };

      const response = await createRetryableAPICall(
        () => this.api.transactions.createTransaction(budgetId, transaction),
        'Create transaction'
      );

      if (!response.data.transaction) {
        throw new Error("Failed to create transaction - no transaction data returned");
      }

      const splitLines = summarizeSubtransactions(response.data.transaction);
      const result: CreateTransactionResult = {
        success: true,
        transactionId: response.data.transaction.id,
        message:
          splitLines.length > 0
            ? `Split transaction created with ${splitLines.length} lines`
            : "Transaction created successfully",
        ...(splitLines.length > 0 ? { subtransactions: splitLines } : {}),
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
            text: `Error creating transaction: ${describeAPIError(error)}`,
          },
        ],
      };
    }
  }

  private formatMarkdown(result: CreateTransactionResult): string {
    let output = "# Transaction Created Successfully\n\n";
    output += `✅ ${result.message}\n\n`;
    output += `**Transaction ID:** \`${result.transactionId}\`\n`;
    if (result.subtransactions) {
      output += "\n## Split lines\n";
      output += formatSplitLinesMarkdown(result.subtransactions);
    }
    return output;
  }
}

export default CreateTransactionTool;
