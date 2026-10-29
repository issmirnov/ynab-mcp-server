# Split Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the MCP server create split transactions, turn regular transactions into splits, change or merge existing splits, and show split lines (issue #26).

**Architecture:** Shared helpers in `src/utils/splitTransactions.ts` validate split lines and convert them to the API's milliunit shape. `ynab_create_transaction` gains `subtransactions`. A new `ynab_set_transaction_splits` tool splits a regular transaction in place with one `PUT`. It recreates an existing split (create the replacement, then delete the original) because the API can't edit a split. `ynab_list_transactions` reports split lines, and `ynab_update_transaction` rejects changes the API can't make on a split.

**Tech Stack:** TypeScript, `ynab@4.5.0` SDK, `@modelcontextprotocol/sdk`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-split-transactions-design.md`

## Global Constraints

- Tool names use the `ynab_` prefix. Inputs use camelCase (`categoryId`, `payeeName`). Amounts are dollars at the tool boundary and milliunits on the wire (`amountToMilliUnits`).
- Every tool supports `response_format` (`json` | `markdown`, default markdown), applies `truncateResponse(…, CHARACTER_LIMIT)`, and sets `isError: true` on errors.
- A split has at least 2 lines. Line amounts must add up exactly to the parent amount (compare in milliunits).
- `ExistingTransaction.category_id` is typed string-only in `ynab@4`. To send `null`, build a `SaveTransactionWithOptionalFields` and cast, as `UpdateTransactionTool` does for `payee_id`.
- The SDK throws the parsed YNAB error body (`{ error: { id, name, detail } }`), not an `Error`. Format errors with `describeAPIError`.
- A recreate never sends `import_id`: the API returns 409 for a duplicate while the original exists.
- Tests live in `src/tests/`. Mock `createRetryableAPICall` to run once and keep the rest of `apiErrorHandler` real (`importOriginal`).

---

### Task 1: Shared split helpers and readable API errors

**Files:**
- Create: `src/utils/splitTransactions.ts`
- Modify: `src/utils/apiErrorHandler.ts` (add `describeAPIError`)
- Test: `src/tests/splitTransactions.test.ts`, `src/tests/apiErrorHandler.test.ts`

**Interfaces (produces):**
- `MIN_SPLIT_LINES = 2`
- `interface SplitLineInput { amount: number; categoryId?: string; payeeId?: string; payeeName?: string; memo?: string }`
- `interface SubtransactionSummary { id; amount; category_id?; category_name?; payee_id?; payee_name?; memo?; transfer_account_id? }`
- `subtransactionsSchema(description: string)`: JSON schema for a `subtransactions` array input.
- `activeSubtransactions(txn)`, `isSplitTransaction(txn)`: ignore deleted lines.
- `toSaveSubTransactions(lines, totalMilliunits): { subtransactions: ynab.SaveSubTransaction[] } | { error: string }`
- `summarizeSubtransactions(txn): SubtransactionSummary[]`
- `formatSplitLinesMarkdown(lines, indent = ""): string`, one bullet per line: `- Groceries: $-80.00 (memo)`
- `describeAPIError(error: unknown): string`: `Error.message`, `detail (YNAB error id)` for a YNAB body, JSON for other objects.

- [ ] **Step 1:** Write failing tests:
  - deleted lines dropped; missing, empty, or all-deleted lines mean "not split".
  - dollars become milliunits; float lines (-0.1, -0.2) balance against -300.
  - a sum mismatch names both totals and the absolute difference ("off by $15.00").
  - fewer than 2 lines rejected.
  - summary drops deleted lines and nulls.
  - markdown falls back to the payee name for transfer lines.
  - `describeAPIError` handles an Error, a YNAB body, a plain object, and a string.
- [ ] **Step 2:** Run `npx vitest run src/tests/splitTransactions.test.ts src/tests/apiErrorHandler.test.ts` and confirm the tests fail (module or export missing).
- [ ] **Step 3:** Implement the helpers and `describeAPIError`.
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: shared split-transaction helpers and readable YNAB API errors`.

### Task 2: `ynab_create_transaction` accepts `subtransactions`

**Files:**
- Modify: `src/tools/CreateTransactionTool.ts`
- Test: `src/tests/CreateTransactionTool.test.ts`

**Interfaces (consumes):** `subtransactionsSchema`, `toSaveSubTransactions`, `summarizeSubtransactions`, `formatSplitLinesMarkdown`, `describeAPIError`.

- [ ] **Step 1:** Write failing tests:
  - a split sends lines in milliunits and no parent `category_id`, and returns the lines.
  - `categoryId` with `subtransactions` is rejected before the API call.
  - a sum mismatch is rejected ("off by $9.50") before the API call.
  - a 1-line split is rejected.
  - markdown lists the lines.
  - Update the pinned description test.
- [ ] **Step 2:** Run `npx vitest run src/tests/CreateTransactionTool.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement:
  - Add the schema property and description text.
  - Validate the lines.
  - Pass `subtransactions` to the API.
  - Add `subtransactions` to the result only for a split, so the non-split JSON stays byte-identical.
- [ ] **Step 4:** Re-run the tests. Expected: PASS, including the existing exact-JSON tests.
- [ ] **Step 5:** Commit `feat: create split transactions with ynab_create_transaction`.

### Task 3: New `ynab_set_transaction_splits` tool

**Files:**
- Create: `src/tools/SetTransactionSplitsTool.ts`
- Modify: `src/mcp/registerTools.ts` (register after `UpdateTransactionTool`)
- Test: `src/tests/SetTransactionSplitsTool.test.ts`

**Interfaces:**
- Input: `{ budgetId?, transactionId, subtransactions?: SplitLineInput[], categoryId?, amount?, date?, response_format? }`
- Result: `{ success, action: "split" | "resplit" | "unsplit" | "unchanged", method: "updated_in_place" | "recreated" | "none", transactionId, previousTransactionId?, date, amount, accountName, payeeName, categoryName, subtransactions: SubtransactionSummary[], notes: string[], message }`
- Annotations: `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true`.

Behavior:
1. Exactly one of `subtransactions` / `categoryId`, checked before any API call.
2. Fetch the transaction. If it is deleted, return an error (protects against a retry with an ID that a recreate already replaced).
3. If `categoryId` is given and the transaction is not a split, return an error that points to `ynab_update_transaction`.
4. Validate the lines against `amount` (if given) or the current amount.
5. Regular transaction: one `PUT` with `{ category_id: null, subtransactions, amount?, date? }`. The ID is kept.
6. Existing split with the same lines, amount, and date: write nothing (`unchanged`).
7. Existing split otherwise: recreate.
   1. Create a copy with the account, date, amount, payee_id, memo, cleared status, approval, and flag, plus the lines or `category_id`.
   2. Delete the original.
   3. If the delete fails, return an error that names both IDs and `ynab_delete_transaction`.
   4. The notes report the new ID and, when the original had an `import_id`, the lost import link.

- [ ] **Step 1:** Write failing tests:
  - definition: name, annotations, required fields; the zod conversion accepts valid lines and rejects a line without `amount`.
  - validation: neither or both inputs; sum mismatch; `categoryId` on a regular transaction; a deleted transaction.
  - in place: exact `PUT` body, no create or delete; amount and date are forwarded.
  - recreate: exact create body with no `import_id`; delete called after create (`invocationCallOrder`); result IDs and notes.
  - merge: `category_id` set, no lines.
  - amount and date overrides apply.
  - unchanged: no writes.
  - delete failure returns both IDs; create failure skips the delete.
  - markdown output.
- [ ] **Step 2:** Run `npx vitest run src/tests/SetTransactionSplitsTool.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement the tool and register it.
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: ynab_set_transaction_splits tool`.

### Task 4: `ynab_list_transactions` shows split lines

**Files:**
- Modify: `src/tools/ListTransactionsTool.ts`
- Test: `src/tests/ListTransactionsTool.test.ts`

- [ ] **Step 1:** Write failing tests:
  - JSON includes active lines for a split and no `subtransactions` key for a regular transaction.
  - the category filter "household" matches a split with a Household line.
  - deleted lines don't match.
  - markdown shows `- **Split into 2 lines:**` and the indented lines.
- [ ] **Step 2:** Run `npx vitest run src/tests/ListTransactionsTool.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement:
  - Add `subtransactions` to `TransactionResult` (only when the transaction is split).
  - Add a `matchesCategory` helper that checks the parent and line categories.
  - Update the markdown and the filter description.
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: show split lines in ynab_list_transactions`.

### Task 5: `ynab_update_transaction` catches split-only limits

**Files:**
- Modify: `src/tools/UpdateTransactionTool.ts`
- Test: `src/tests/UpdateTransactionTool.test.ts`

- [ ] **Step 1:** Write failing tests:
  - on a split, an amount, date, or category change returns an error naming `ynab_set_transaction_splits`, with no `PUT`.
  - a memo change on a split still goes through.
  - an unchanged amount or date alongside another edit is allowed.
  - a YNAB error body shows its detail.
  - Switch the module mock to `importOriginal` so `describeAPIError` stays real.
- [ ] **Step 2:** Run `npx vitest run src/tests/UpdateTransactionTool.test.ts test/UpdateTransactionTool.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement `splitLockedFields`, the guard, the description sentence, and `describeAPIError` in the catch block.
- [ ] **Step 4:** Re-run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: ynab_update_transaction points split edits to ynab_set_transaction_splits`.

### Task 6: Docs and full verification

**Files:**
- Modify: `README.md` (Transactions table: create row and new row; API coverage row)
- Modify: `CLAUDE.md` (tool list)

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run `npm run type-check`. Expected: no errors.
- [ ] **Step 3:** Run `npm test`. Expected: all unit and worker tests pass.
- [ ] **Step 4:** Run `npx wrangler deploy --dry-run --env staging`. Expected: the bundle builds.
- [ ] **Step 5:** Commit `docs: split transaction tools in README and CLAUDE.md`.

### After the plan

1. Push the branch and open a PR that closes #26.
2. Iterate until the CI checks and the Codex review are clean.
3. Deploy to staging only (`npm run deploy:staging`). Never run `npm run deploy`.
4. On staging, exercise the create, split in place, re-split, merge, and list paths with clearly labeled test transactions.
5. Delete the test transactions afterward.
