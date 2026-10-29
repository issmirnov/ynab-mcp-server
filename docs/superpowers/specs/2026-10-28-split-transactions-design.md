# Split Transactions Design

Tracking issue: https://github.com/issmirnov/ynab-mcp-server/issues/26

## Problem

The server can't work with split transactions. An assistant connected to YNAB cannot:

- create a transaction split across several categories.
- turn an existing transaction into a split, such as a Costco run that is part groceries and part household.
- change the lines of an existing split, or merge a split back into one category.

It can't see split lines either. `ynab_list_transactions` drops `subtransactions`, so a split shows as one transaction in the "Split (Multiple Categories)..." category. A category filter like "Groceries" misses splits that have a Groceries line.

## What the YNAB API allows

From the live OpenAPI spec (`SaveTransactionWithOptionalFields`, `SaveSubTransaction`):

- A `subtransactions` array on create or update makes the transaction a split. The parent `category_id` is set to null. Line amounts are in milliunits and must add up to the parent amount.
- `PUT /transactions/{id}` can turn a regular transaction into a split.
- On an existing split, the API returns an error for a `subtransactions` update. It ignores a new `amount` or `date`, and it won't change the `category_id`.
- Splits are not allowed on tracking accounts or on transfers between on-budget accounts.
- The API can't create split scheduled transactions.

So the only way to change an existing split is to recreate it: create a new transaction with the new lines, then delete the original.

## Proposal

### 1. `ynab_create_transaction`: optional `subtransactions`

Each line takes an `amount` (dollars, same sign convention as the parent) and a `categoryId`, plus optional `payeeId`, `payeeName`, and `memo`. Rules when `subtransactions` is present:

1. Leave out the parent `categoryId`.
2. There must be at least 2 lines.
3. The lines must add up to `amount`.

The tool checks these rules before it calls the API. If the lines don't add up, the error states the difference.

### 2. New tool: `ynab_set_transaction_splits`

This tool sets the split lines of an existing transaction. It takes a `transactionId` and one of two inputs:

- `subtransactions`: the full new set of lines.
- `categoryId`: merge a split back into one category.

It also takes an optional `amount` and `date`, because the API can't change those on a split any other way.

| Current transaction | Input | What happens | Transaction ID |
| --- | --- | --- | --- |
| Regular | `subtransactions` | One `PUT` converts it in place | Unchanged |
| Split | `subtransactions` | Recreated with the new lines, original deleted | New |
| Split | `categoryId` | Recreated as a single-category transaction, original deleted | New |
| Regular | `categoryId` | Error that points to `ynab_update_transaction` | n/a |

If the requested lines match the current lines and the amount and date don't change, the tool writes nothing.

A recreate copies the account, date, amount, payee, memo, cleared status, approval, and flag. The tool creates the new transaction first and deletes the original second, so a failure never loses the transaction. If the delete fails, the tool returns an error that names both IDs.

The response reports two side effects of a recreate:

- The transaction gets a new ID.
- The new transaction has no link to the bank import. A create with the original `import_id` returns 409 while the original still exists. YNAB matches a later import to a user-entered transaction with the same amount within 10 days, so a re-import matches instead of creating a duplicate.

The tool sets `destructiveHint: true` because it can delete a transaction.

### 3. `ynab_list_transactions`: show split lines

A split includes a `subtransactions` array in the JSON output: id, amount, category, payee, memo, and transfer account. The markdown output lists the lines under the transaction. Deleted lines are left out. The category filter matches a split if any of its lines matches.

### 4. `ynab_update_transaction`: catch changes the API can't make

If the transaction is a split and the call changes `amount`, `date`, or `categoryId`, the tool returns an error that points to `ynab_set_transaction_splits`. Today it reports success and nothing changes.

## Acceptance criteria

- [ ] `ynab_create_transaction` creates a split from `subtransactions`. It rejects a sum mismatch, fewer than 2 lines, or `categoryId` with `subtransactions` before it calls the API.
- [ ] `ynab_set_transaction_splits` converts a regular transaction into a split in place, re-splits an existing split, and merges a split back into one category.
- [ ] A recreate creates first and deletes second. A failed delete returns both IDs.
- [ ] `ynab_list_transactions` shows split lines, and its category filter matches split lines.
- [ ] `ynab_update_transaction` returns an error for an amount, date, or category change on a split.
- [ ] Unit tests cover each path. The README tool table and API coverage row are updated.
- [ ] The tools are verified end to end on the staging worker.

## Out of scope

- Split scheduled transactions. The API doesn't support them.
- Editing one line by its ID. The tool takes the full set of lines each time.
- Category names in place of IDs. `ynab_list_categories` provides the IDs.
