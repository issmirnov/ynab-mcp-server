/**
 * Helpers for YNAB split transactions: a parent transaction whose amount is
 * divided across subtransactions ("lines"), each with its own category.
 * Shared by the create, update, list, and set-splits transaction tools.
 */
import * as ynab from "ynab";
import { amountToMilliUnits, formatCurrency, milliUnitsToAmount } from "./commonUtils.js";

/** A split needs at least two lines; a single category belongs on the parent. */
export const MIN_SPLIT_LINES = 2;

/** One split line as the tools accept it (dollars, camelCase ids). */
export interface SplitLineInput {
  amount: number;
  categoryId?: string;
  payeeId?: string;
  payeeName?: string;
  memo?: string;
}

/** One split line as the tools report it (dollars, YNAB field names). */
export interface SubtransactionSummary {
  id: string;
  amount: number;
  category_id?: string;
  category_name?: string;
  payee_id?: string;
  payee_name?: string;
  memo?: string;
  transfer_account_id?: string;
}

type WithSubtransactions = { subtransactions?: ynab.SubTransaction[] | null };

/** JSON schema for a `subtransactions` input, shared by the tool definitions. */
export function subtransactionsSchema(description: string) {
  return {
    type: "array",
    description,
    items: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description:
            "Line amount in dollars with the same sign as the transaction: negative for an expense (e.g. -20.50), positive for income. Do NOT send milliunits.",
        },
        categoryId: {
          type: "string",
          description: "Category for this line. Credit Card Payment categories are not permitted.",
        },
        payeeId: {
          type: "string",
          description: "Payee for this line (optional). Use an account's transfer payee to make the line a transfer.",
        },
        payeeName: {
          type: "string",
          description: "Payee name for this line (optional, used when payeeId is not given).",
        },
        memo: {
          type: "string",
          description: "Memo for this line (optional).",
        },
      },
      required: ["amount"],
      additionalProperties: false,
    },
  };
}

/** The transaction's live split lines; YNAB can include deleted ones. */
export function activeSubtransactions(transaction: WithSubtransactions): ynab.SubTransaction[] {
  return (transaction.subtransactions ?? []).filter((sub) => !sub.deleted);
}

export function isSplitTransaction(transaction: WithSubtransactions): boolean {
  return activeSubtransactions(transaction).length > 0;
}

/**
 * Validate split lines against the transaction total (in milliunits) and
 * convert them to the API's shape. Returns an error message instead of
 * throwing so a tool can reject bad input before it calls the API.
 */
export function toSaveSubTransactions(
  lines: SplitLineInput[],
  totalMilliunits: number
): { subtransactions: ynab.SaveSubTransaction[] } | { error: string } {
  if (lines.length < MIN_SPLIT_LINES) {
    return {
      error: `A split needs at least ${MIN_SPLIT_LINES} lines (got ${lines.length}). To put the whole amount in one category, use categoryId instead.`,
    };
  }

  const subtransactions: ynab.SaveSubTransaction[] = lines.map((line) => ({
    amount: amountToMilliUnits(line.amount),
    payee_id: line.payeeId,
    payee_name: line.payeeName,
    category_id: line.categoryId,
    memo: line.memo,
  }));

  const sum = subtransactions.reduce((total, sub) => total + sub.amount, 0);
  if (sum !== totalMilliunits) {
    const gap = Math.abs(milliUnitsToAmount(totalMilliunits - sum));
    return {
      error:
        `Split lines add up to ${formatCurrency(milliUnitsToAmount(sum))}, but the transaction amount is ` +
        `${formatCurrency(milliUnitsToAmount(totalMilliunits))} (off by ${formatCurrency(gap)}). ` +
        "Line amounts must add up exactly to the transaction amount and use the same sign.",
    };
  }

  return { subtransactions };
}

export function summarizeSubtransactions(transaction: WithSubtransactions): SubtransactionSummary[] {
  return activeSubtransactions(transaction).map((sub) => ({
    id: sub.id,
    amount: milliUnitsToAmount(sub.amount),
    category_id: sub.category_id || undefined,
    category_name: sub.category_name || undefined,
    payee_id: sub.payee_id || undefined,
    payee_name: sub.payee_name || undefined,
    memo: sub.memo || undefined,
    transfer_account_id: sub.transfer_account_id || undefined,
  }));
}

/** One markdown bullet per line, e.g. "- Groceries: $-80.00 (weekly shop)". */
export function formatSplitLinesMarkdown(lines: SubtransactionSummary[], indent = ""): string {
  return lines
    .map((line) => {
      const label = line.category_name ?? line.payee_name ?? "Uncategorized";
      const memo = line.memo ? ` (${line.memo})` : "";
      return `${indent}- ${label}: ${formatCurrency(line.amount)}${memo}\n`;
    })
    .join("");
}
