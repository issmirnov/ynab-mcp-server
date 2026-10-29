import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { truncateResponse, CHARACTER_LIMIT, getBudgetId, amountToMilliUnits, milliUnitsToAmount, formatCurrency } from "../utils/commonUtils.js";
import { createRetryableAPICall, describeAPIError } from "../utils/apiErrorHandler.js";
import {
  activeSubtransactions,
  formatSplitLinesMarkdown,
  isSplitTransaction,
  subtransactionsSchema,
  summarizeSubtransactions,
  toSaveSubTransactions,
  type SplitLineInput,
  type SubtransactionSummary,
} from "../utils/splitTransactions.js";
import { createToolRuntime, type ToolRuntimeConfig } from "./runtime.js";

interface SetTransactionSplitsInput {
  budgetId?: string;
  transactionId: string;
  subtransactions?: SplitLineInput[];
  categoryId?: string;
  amount?: number;
  date?: string;
  response_format?: "json" | "markdown";
}

type SplitAction = "split" | "resplit" | "unsplit" | "unchanged";

interface SetTransactionSplitsResult {
  success: boolean;
  action: SplitAction;
  method: "updated_in_place" | "recreated" | "none";
  transactionId: string;
  previousTransactionId?: string;
  date: string;
  amount: number;
  accountName: string;
  payeeName?: string | null;
  categoryName?: string | null;
  subtransactions: SubtransactionSummary[];
  notes: string[];
  message: string;
}

const HEADINGS: Record<SplitAction, string> = {
  split: "Transaction Split",
  resplit: "Split Lines Replaced",
  unsplit: "Split Merged Into One Category",
  unchanged: "Split Unchanged",
};

/** True when the requested lines match the split's current lines, in order. */
function sameLines(current: ynab.SubTransaction[], next: ynab.SaveSubTransaction[]): boolean {
  return (
    current.length === next.length &&
    current.every((sub, i) => {
      const line = next[i];
      const samePayee = line.payee_id
        ? line.payee_id === sub.payee_id
        : line.payee_name
          ? line.payee_name === sub.payee_name
          : !sub.payee_id;
      return (
        sub.amount === line.amount &&
        (sub.category_id || null) === (line.category_id || null) &&
        (sub.memo || null) === (line.memo || null) &&
        samePayee
      );
    })
  );
}

class SetTransactionSplitsTool {
  private api: ynab.API;
  private budgetId: string;

  constructor(config?: ToolRuntimeConfig) {
    const runtime = createToolRuntime(config);
    this.api = runtime.api;
    this.budgetId = runtime.budgetId || "";
  }

  getToolDefinition(): Tool {
    return {
      name: "ynab_set_transaction_splits",
      description:
        "Sets the split lines of an existing transaction. Turns a regular transaction into a split, replaces the lines of an existing split, or merges a split back into one category (pass categoryId instead of subtransactions). Always pass the full list of lines; their amounts must add up to the transaction amount. A regular transaction is split in place and keeps its ID. YNAB can't edit an existing split in place, so changing one recreates it: a new transaction (new ID) is created with the same account, date, payee, memo, cleared status, approval, and flag, then the original is deleted. Use ynab_list_transactions to see the current lines and ynab_list_categories for category IDs.",
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
            description: "The ID of the transaction to split, re-split, or merge.",
          },
          subtransactions: subtransactionsSchema(
            "The complete new set of split lines (at least 2). Their amounts must add up exactly to the transaction amount, or to `amount` if you change it. Omit when you pass categoryId."
          ),
          categoryId: {
            type: "string",
            description: "Merge a split transaction back into this one category. Use instead of subtransactions.",
          },
          amount: {
            type: "number",
            description:
              "New transaction total in dollars (optional), e.g. -120.50 for an expense. YNAB can't change a split's amount any other way. Do NOT send milliunits.",
          },
          date: {
            type: "string",
            description:
              "New transaction date in ISO format (optional), e.g. 2024-03-24. YNAB can't change a split's date any other way.",
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
        title: "Set YNAB Transaction Splits",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    };
  }

  async execute(input: SetTransactionSplitsInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      if ((input.subtransactions === undefined) === (input.categoryId === undefined)) {
        return this.errorResponse(
          "Pass exactly one of subtransactions (to split the transaction) or categoryId (to merge a split into one category)."
        );
      }

      const existing = await createRetryableAPICall(
        () => this.api.transactions.getTransactionById(budgetId, input.transactionId),
        "Get transaction for split"
      );
      const current = existing.data.transaction;

      // A retry with the ID of a transaction that an earlier call replaced must
      // not recreate it a second time.
      if (current.deleted) {
        return this.errorResponse(
          `Transaction ${input.transactionId} has been deleted. If an earlier split change recreated it, use the new transaction ID.`
        );
      }

      const wasSplit = isSplitTransaction(current);
      const total = input.amount !== undefined ? amountToMilliUnits(input.amount) : current.amount;
      const date = input.date ?? current.date;

      if (input.categoryId !== undefined) {
        if (!wasSplit) {
          return this.errorResponse(
            `Transaction ${input.transactionId} is not a split. Use ynab_update_transaction to change its category.`
          );
        }
        return await this.recreate(budgetId, input, current, { total, date, categoryId: input.categoryId });
      }

      // The check at the top guarantees subtransactions is set when categoryId is not.
      const split = toSaveSubTransactions(input.subtransactions!, total);
      if ("error" in split) {
        return this.errorResponse(split.error);
      }
      const lines = split.subtransactions;

      if (!wasSplit) {
        return this.respond(input, await this.splitInPlace(budgetId, input, lines));
      }

      if (total === current.amount && date === current.date && sameLines(activeSubtransactions(current), lines)) {
        return this.respond(
          input,
          this.buildResult(current, "unchanged", "none", ["The split already has these lines, so nothing was changed."])
        );
      }

      return await this.recreate(budgetId, input, current, { total, date, lines });
    } catch (error) {
      return this.errorResponse(`Error setting transaction splits: ${describeAPIError(error)}`);
    }
  }

  /** A regular transaction becomes a split with one PUT and keeps its ID. */
  private async splitInPlace(
    budgetId: string,
    input: SetTransactionSplitsInput,
    lines: ynab.SaveSubTransaction[]
  ): Promise<SetTransactionSplitsResult> {
    // A split's parent category must be null. ynab@4 types
    // ExistingTransaction.category_id as string-only, so build the wider save
    // shape and cast, as UpdateTransactionTool does for payee_id.
    const transaction: ynab.SaveTransactionWithOptionalFields = { category_id: null, subtransactions: lines };
    if (input.amount !== undefined) {
      transaction.amount = amountToMilliUnits(input.amount);
    }
    if (input.date !== undefined) {
      transaction.date = input.date;
    }

    const response = await createRetryableAPICall(
      () =>
        this.api.transactions.updateTransaction(budgetId, input.transactionId, {
          transaction: transaction as ynab.ExistingTransaction,
        }),
      "Split transaction"
    );

    return this.buildResult(response.data.transaction, "split", "updated_in_place");
  }

  /**
   * YNAB can't edit an existing split's lines, amount, date, or category, so
   * create a replacement and delete the original. Creating first means a
   * failure never loses the transaction. The replacement carries no import_id:
   * the API returns 409 for a duplicate import_id while the original exists,
   * and an imported transaction may be matched to the user-entered original.
   */
  private async recreate(
    budgetId: string,
    input: SetTransactionSplitsInput,
    current: ynab.TransactionDetail,
    change: { total: number; date: string; lines?: ynab.SaveSubTransaction[]; categoryId?: string }
  ) {
    const replacement: ynab.NewTransaction = {
      account_id: current.account_id,
      date: change.date,
      amount: change.total,
      payee_id: current.payee_id ?? undefined,
      memo: current.memo ?? undefined,
      cleared: current.cleared,
      approved: current.approved,
      flag_color: current.flag_color,
      category_id: change.categoryId,
      subtransactions: change.lines,
    };

    let created: ynab.SaveTransactionsResponse;
    try {
      // One attempt only: this POST has no idempotency key, so a retry after a
      // lost response could create a second replacement.
      created = await createRetryableAPICall(
        () => this.api.transactions.createTransaction(budgetId, { transaction: replacement }),
        "Create replacement transaction",
        1
      );
    } catch (error) {
      return this.errorResponse(
        `Error setting transaction splits: creating the replacement transaction failed: ${describeAPIError(error)}. ` +
          `The original ${current.id} was not changed. After a timeout or connection error, YNAB may still have created ` +
          "the replacement, so check ynab_list_transactions before you retry."
      );
    }
    const recreated = created.data.transaction;
    if (!recreated) {
      throw new Error("Failed to create the replacement transaction - no transaction data returned");
    }

    try {
      await createRetryableAPICall(
        () => this.api.transactions.deleteTransaction(budgetId, current.id),
        "Delete original transaction"
      );
    } catch (error) {
      return this.errorResponse(
        `Created replacement transaction ${recreated.id}, but deleting the original ${current.id} failed: ${describeAPIError(error)}. ` +
          `Both transactions now exist. Delete the original with ynab_delete_transaction (transactionId ${current.id}).`
      );
    }

    const notes = [
      `YNAB can't edit an existing split in place, so the transaction was recreated. New ID: ${recreated.id} (was ${current.id}).`,
    ];
    if (current.import_id) {
      notes.push("The new transaction is not linked to the original bank import, because YNAB doesn't allow reusing its import_id.");
    }

    return this.respond(
      input,
      this.buildResult(recreated, change.lines ? "resplit" : "unsplit", "recreated", notes, current.id)
    );
  }

  private buildResult(
    transaction: ynab.TransactionDetail,
    action: SplitAction,
    method: SetTransactionSplitsResult["method"],
    notes: string[] = [],
    previousTransactionId?: string
  ): SetTransactionSplitsResult {
    const subtransactions = summarizeSubtransactions(transaction);
    const messages: Record<SplitAction, string> = {
      split: `Transaction split into ${subtransactions.length} lines`,
      resplit: `Split lines replaced (${subtransactions.length} lines)`,
      unsplit: `Split merged into ${transaction.category_name ?? "one category"}`,
      unchanged: "No changes needed",
    };

    return {
      success: true,
      action,
      method,
      transactionId: transaction.id,
      ...(previousTransactionId ? { previousTransactionId } : {}),
      date: transaction.date,
      amount: milliUnitsToAmount(transaction.amount),
      accountName: transaction.account_name,
      payeeName: transaction.payee_name,
      categoryName: transaction.category_name,
      subtransactions,
      notes,
      message: messages[action],
    };
  }

  private respond(input: SetTransactionSplitsInput, result: SetTransactionSplitsResult) {
    const format = input.response_format || "markdown";
    const responseText = format === "json" ? JSON.stringify(result, null, 2) : this.formatMarkdown(result);
    const { text } = truncateResponse(responseText, CHARACTER_LIMIT);

    return {
      content: [{ type: "text", text }],
    };
  }

  private errorResponse(text: string) {
    return {
      isError: true,
      content: [{ type: "text", text }],
    };
  }

  private formatMarkdown(result: SetTransactionSplitsResult): string {
    let output = `# ${HEADINGS[result.action]}\n\n`;
    output += `✅ ${result.message}\n\n`;
    output += `- **Transaction ID:** \`${result.transactionId}\``;
    output += result.previousTransactionId ? ` (replaces \`${result.previousTransactionId}\`)\n` : "\n";
    output += `- **Date:** ${result.date}\n`;
    output += `- **Amount:** ${formatCurrency(result.amount)}\n`;
    output += `- **Account:** ${result.accountName}\n`;
    if (result.payeeName) {
      output += `- **Payee:** ${result.payeeName}\n`;
    }

    if (result.subtransactions.length > 0) {
      output += "\n## Split lines\n";
      output += formatSplitLinesMarkdown(result.subtransactions);
    } else if (result.categoryName) {
      output += `- **Category:** ${result.categoryName}\n`;
    }

    if (result.notes.length > 0) {
      output += "\n## Notes\n";
      for (const note of result.notes) {
        output += `- ${note}\n`;
      }
    }

    return output;
  }
}

export default SetTransactionSplitsTool;
