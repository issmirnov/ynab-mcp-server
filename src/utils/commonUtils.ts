/**
 * Common utility functions used across YNAB MCP tools
 */

/**
 * Convert a month string to ISO format
 * @param month - Either "current" or a date string in YYYY-MM-DD format
 * @returns ISO formatted date string (YYYY-MM-DD)
 */
export function normalizeMonth(month: string | undefined): string {
  if (!month || month === "current") {
    return new Date().toISOString().slice(0, 7) + "-01";
  }
  return month;
}

/**
 * Convert YNAB milliUnits to standard currency amount
 * @param milliUnits - Amount in YNAB milliUnits format
 * @returns Amount in standard currency format (dollars, euros, etc.)
 */
export function milliUnitsToAmount(milliUnits: number): number {
  return milliUnits / 1000;
}

/**
 * Convert standard currency amount to YNAB milliUnits
 * @param amount - Amount in standard currency format
 * @returns Amount in YNAB milliUnits format
 */
export function amountToMilliUnits(amount: number): number {
  return Math.round(amount * 1000);
}

/**
 * Get budget ID from input or resolved user default
 * @param budgetId - Optional budget ID from tool input
 * @returns Budget ID string
 * @throws Error if no budget ID is available
 */
export function getBudgetId(budgetId?: string, defaultBudgetId?: string): string {
  const id = budgetId || defaultBudgetId;
  if (!id) {
    throw new Error(
      "Budget ID is required. Set a default budget with ynab_set_default_budget, rely on auto-selection when you only have one budget, or pass budgetId explicitly."
    );
  }
  return id;
}

/**
 * Format a date string to human-readable format
 * @param dateString - ISO date string
 * @returns Human-readable date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format currency amount for display
 * @param amount - Amount in standard currency format
 * @param currency - Currency symbol (default: $)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = "$"): string {
  return `${currency}${amount.toFixed(2)}`;
}

/**
 * Truncate response text to fit within character limit
 * @param text - Text to truncate
 * @param limit - Character limit (default: 25000)
 * @returns Truncated text with message if truncation occurred
 */
export function truncateResponse(text: string, limit: number = 25000): {
  text: string;
  wasTruncated: boolean;
} {
  if (text.length <= limit) {
    return { text, wasTruncated: false };
  }

  const truncated = text.slice(0, limit - 200); // Reserve space for message
  const truncationMessage = `\n\n[Response truncated from ${text.length} to ${truncated.length} characters. Use pagination or filtering parameters to see more results.]`;

  return {
    text: truncated + truncationMessage,
    wasTruncated: true,
  };
}

/**
 * Character limit constant for MCP responses
 */
export const CHARACTER_LIMIT = 25000;

/**
 * Pass to YNAB transaction listing endpoints to preserve full-history behavior.
 * YNAB PAPI v1.85.0 (2026-06-04) defaults `since_date` to 1 year ago when
 * omitted; an explicit far-past date keeps the prior "all transactions" default.
 */
export const FULL_HISTORY_SINCE_DATE = "1900-01-01";

/**
 * Default `since_date` window for ynab_list_transactions when the LLM does
 * not specify a date range. See
 * docs/superpowers/specs/2026-05-27-list-transactions-window-defaults-design.md.
 */
export const DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS = 60;

/**
 * Maximum (endDate − startDate) range the LLM may request in a single
 * ynab_list_transactions call. Larger ranges return an error with guidance
 * to page by date window.
 */
export const MAX_LIST_TRANSACTIONS_RANGE_DAYS = 180;
