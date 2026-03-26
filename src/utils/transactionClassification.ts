import * as ynab from "ynab";

const UNCATEGORIZED_FILTER_ALIASES = [
  "uncategorized",
  "uncategorised",
  "no category",
  "without category",
];

export function isUncategorizedCategoryFilter(categoryFilter: string): boolean {
  return UNCATEGORIZED_FILTER_ALIASES.includes(categoryFilter.trim().toLowerCase());
}

export function isActionableUncategorizedTransaction(
  transaction: ynab.TransactionDetail,
  accounts: ynab.Account[]
): boolean {
  if (transaction.category_id || transaction.category_name) {
    return false;
  }

  if (transaction.transfer_account_id || transaction.transfer_transaction_id) {
    return false;
  }

  if (transaction.amount >= 0) {
    return false;
  }

  const account = accounts.find(candidate => candidate.id === transaction.account_id);
  if (account && !account.on_budget) {
    return false;
  }

  const payeeName = transaction.payee_name?.trim().toLowerCase();
  if (payeeName === "starting balance" || payeeName === "reconciliation balance adjustment") {
    return false;
  }

  return true;
}
