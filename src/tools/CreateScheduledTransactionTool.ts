import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getBudgetId, amountToMilliUnits, truncateResponse, CHARACTER_LIMIT } from "../utils/commonUtils.js";
import { createRetryableAPICall } from "../utils/apiErrorHandler.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface CreateScheduledTransactionInput {
  budgetId?: string;
  accountId: string;
  date: string;
  amount: number;
  frequency: string;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  memo?: string;
  flagColor?: string;
  response_format?: "json" | "markdown";
}

class CreateScheduledTransactionTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_create_scheduled_transaction",
      description:
        "Creates a new scheduled (recurring) transaction in your YNAB budget. Either payee_id or payee_name must be provided. Use this to set up repeating transactions such as monthly bills, weekly transfers, or any recurring expense or income.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description:
              "The ID of the budget to create the scheduled transaction in. Optional when a default budget is set or only one budget exists.",
          },
          accountId: {
            type: "string",
            description: "The ID of the account for the scheduled transaction.",
          },
          date: {
            type: "string",
            description:
              "The first occurrence date of the scheduled transaction in ISO format (e.g. 2024-03-24). Must be a future date no more than 5 years out.",
          },
          amount: {
            type: "number",
            description: "The amount in dollars (e.g. 10.99). Use negative values for expenses, positive for income.",
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
              "How often the transaction recurs. Use 'never' for a one-time scheduled transaction.",
          },
          payeeId: {
            type: "string",
            description: "The ID of the payee (optional if payeeName is provided).",
          },
          payeeName: {
            type: "string",
            description:
              "The name of the payee (optional if payeeId is provided). A new payee will be created if no match is found.",
          },
          categoryId: {
            type: "string",
            description:
              "The category ID for the scheduled transaction (optional). Credit Card Payment categories are not permitted.",
          },
          memo: {
            type: "string",
            description: "A memo/note for the scheduled transaction (optional).",
          },
          flagColor: {
            type: "string",
            enum: ["red", "orange", "yellow", "green", "blue", "purple"],
            description: "The flag color for the scheduled transaction (optional).",
          },
          response_format: {
            type: "string",
            enum: ["json", "markdown"],
            description:
              "Response format: 'json' for machine-readable output, 'markdown' for human-readable output (default: markdown).",
          },
        },
        required: ["accountId", "date", "amount", "frequency"],
        additionalProperties: false,
      },
      annotations: {
        title: "Create YNAB Scheduled Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: CreateScheduledTransactionInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if (!input.payeeId && !input.payeeName) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Either payeeId or payeeName must be provided",
            },
          ],
        };
      }

      const milliunitAmount = amountToMilliUnits(input.amount);

      const scheduledTransaction: ynab.PostScheduledTransactionWrapper = {
        scheduled_transaction: {
          account_id: input.accountId,
          date: input.date,
          amount: milliunitAmount,
          frequency: input.frequency as ynab.ScheduledTransactionFrequency,
          payee_id: input.payeeId,
          payee_name: input.payeeName,
          category_id: input.categoryId,
          memo: input.memo,
          flag_color: input.flagColor as ynab.TransactionFlagColor,
        },
      };

      const response = await createRetryableAPICall(
        () => this.api.scheduledTransactions.createScheduledTransaction(budgetId, scheduledTransaction),
        "Create scheduled transaction"
      );

      if (!response.data.scheduled_transaction) {
        throw new Error("Failed to create scheduled transaction - no data returned");
      }

      const st = response.data.scheduled_transaction;
      const result = {
        success: true,
        scheduledTransactionId: st.id,
        frequency: st.frequency,
        nextDate: st.date_next,
        message: "Scheduled transaction created successfully",
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
            text: `Error creating scheduled transaction: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  }

  private formatMarkdown(result: {
    success: boolean;
    scheduledTransactionId: string;
    frequency: string;
    nextDate: string;
    message: string;
  }): string {
    let output = "# Scheduled Transaction Created Successfully\n\n";
    output += `✅ ${result.message}\n\n`;
    output += `**Scheduled Transaction ID:** \`${result.scheduledTransactionId}\`\n`;
    output += `**Frequency:** ${result.frequency}\n`;
    output += `**Next Date:** ${result.nextDate}\n`;
    return output;
  }
}

export default CreateScheduledTransactionTool;
