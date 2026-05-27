# ListTransactions Window Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 60-day default `since_date` window and a 180-day max range cap to `ListTransactionsTool`, with date-window paging so the LLM walks history in chunks instead of fetching everything.

**Architecture:** Extract a pure `resolveTransactionDateWindow(start, end, today)` helper in `ListTransactionsTool.ts` that handles the defaulting and validation rules from the spec. The tool's `execute()` calls the helper, uses the resolved `startDate` as the API `since_date`, applies the resolved `endDate` client-side (YNAB API has no end-date parameter), and surfaces the resolved window in a new `date_range` block in the response.

**Tech Stack:** TypeScript (strict), Vitest 4.x, `@modelcontextprotocol/sdk` v1.20.1, `ynab` v3 SDK.

**Spec:** `docs/superpowers/specs/2026-05-27-list-transactions-window-defaults-design.md`

**Dependency:** Branch `fix/preserve-full-transaction-history` (PR #1) introduces the `FULL_HISTORY_SINCE_DATE` constant and call site this plan modifies. Rebase this branch on top of PR #1 once it lands, or land PR #1 first.

**File Structure:**

| File | Action | Responsibility |
|---|---|---|
| `src/utils/commonUtils.ts` | Modify | Add two numeric constants (defaults/caps). |
| `src/tools/ListTransactionsTool.ts` | Modify | Add `resolveTransactionDateWindow` helper (exported), wire into `execute()`, plumb resolved window into API call + client-side filters + response. |
| `src/tests/ListTransactionsTool.test.ts` | Modify | Add unit tests for the helper, integration tests for the wired tool, fake-timer pattern for date-stability, update one stale assertion from PR #1. |

---

## Task 1: Add window-default constants to commonUtils

**Files:**
- Modify: `src/utils/commonUtils.ts` (end of file)

- [ ] **Step 1: Add constants**

Open `src/utils/commonUtils.ts`. After the existing `FULL_HISTORY_SINCE_DATE` constant block, append:

```ts

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
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run type-check`
Expected: command exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add src/utils/commonUtils.ts
git commit -m "Add window-default constants for ListTransactionsTool"
```

---

## Task 2: TDD — resolveTransactionDateWindow helper (happy paths)

**Files:**
- Modify: `src/tests/ListTransactionsTool.test.ts` (top-level `describe`, add new nested `describe('resolveTransactionDateWindow', ...)`)
- Modify: `src/tools/ListTransactionsTool.ts` (add exported helper above the class)

- [ ] **Step 1: Add the test block (will fail)**

Open `src/tests/ListTransactionsTool.test.ts`. At the top of the file, add to the imports:

```ts
import ListTransactionsTool, { resolveTransactionDateWindow } from '../tools/ListTransactionsTool';
```

Replace the existing default-only import line `import ListTransactionsTool from '../tools/ListTransactionsTool';` with the line above.

At the end of the file, just before the final closing `});` of the outermost `describe('ListTransactionsTool', ...)`, add this nested describe:

```ts
  describe('resolveTransactionDateWindow', () => {
    const TODAY = '2026-05-27';

    it('defaults both sides to the last 60 days when neither is provided', () => {
      const result = resolveTransactionDateWindow(undefined, undefined, TODAY);
      expect(result).toEqual({
        startDate: '2026-03-28',
        endDate: '2026-05-27',
        wasDefaulted: true,
      });
    });

    it('keeps explicit startDate and defaults endDate to today', () => {
      const result = resolveTransactionDateWindow('2026-04-01', undefined, TODAY);
      expect(result).toEqual({
        startDate: '2026-04-01',
        endDate: '2026-05-27',
        wasDefaulted: true,
      });
    });

    it('keeps explicit endDate and defaults startDate to endDate minus 60 days', () => {
      const result = resolveTransactionDateWindow(undefined, '2026-03-01', TODAY);
      expect(result).toEqual({
        startDate: '2025-12-31',
        endDate: '2026-03-01',
        wasDefaulted: true,
      });
    });

    it('keeps both sides when both are provided within a 180-day range', () => {
      const result = resolveTransactionDateWindow('2026-01-01', '2026-04-30', TODAY);
      expect(result).toEqual({
        startDate: '2026-01-01',
        endDate: '2026-04-30',
        wasDefaulted: false,
      });
    });

    it('allows exactly a 180-day range', () => {
      const result = resolveTransactionDateWindow('2025-11-28', '2026-05-27', TODAY);
      expect(result).toEqual({
        startDate: '2025-11-28',
        endDate: '2026-05-27',
        wasDefaulted: false,
      });
    });

    it('allows a zero-day range (single-day query)', () => {
      const result = resolveTransactionDateWindow('2026-05-15', '2026-05-15', TODAY);
      expect(result).toEqual({
        startDate: '2026-05-15',
        endDate: '2026-05-15',
        wasDefaulted: false,
      });
    });
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t resolveTransactionDateWindow`
Expected: 6 failing tests — vitest will report the import does not exist (the file does not export `resolveTransactionDateWindow`).

- [ ] **Step 3: Add the helper to the tool file**

Open `src/tools/ListTransactionsTool.ts`. At the top of the file, after the existing imports and before `interface ListTransactionsInput`, add:

```ts
import { DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS } from "../utils/commonUtils.js";
```

(Adjust the existing `commonUtils.js` import line instead of duplicating — add `DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS` to the destructured list there, so there is only one import from `commonUtils.js`.)

Then, between the imports and the `interface ListTransactionsInput` declaration, add the helper:

```ts
export type ResolvedDateWindow = {
  startDate: string;
  endDate: string;
  wasDefaulted: boolean;
};

export type DateWindowError = { error: string };

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

export function resolveTransactionDateWindow(
  startDate: string | undefined,
  endDate: string | undefined,
  today: string,
): ResolvedDateWindow | DateWindowError {
  const defaultDays = DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS;

  if (!startDate && !endDate) {
    return {
      startDate: shiftDays(today, -defaultDays),
      endDate: today,
      wasDefaulted: true,
    };
  }

  if (startDate && !endDate) {
    return { startDate, endDate: today, wasDefaulted: true };
  }

  if (!startDate && endDate) {
    return { startDate: shiftDays(endDate, -defaultDays), endDate, wasDefaulted: true };
  }

  return { startDate: startDate!, endDate: endDate!, wasDefaulted: false };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t resolveTransactionDateWindow`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ListTransactionsTool.ts src/tests/ListTransactionsTool.test.ts
git commit -m "Add resolveTransactionDateWindow helper with happy-path tests"
```

---

## Task 3: TDD — resolveTransactionDateWindow validation

**Files:**
- Modify: `src/tests/ListTransactionsTool.test.ts` (extend the `describe('resolveTransactionDateWindow', ...)` block from Task 2)
- Modify: `src/tools/ListTransactionsTool.ts` (extend the helper)

- [ ] **Step 1: Add the failing validation tests**

Add to the bottom of the `describe('resolveTransactionDateWindow', ...)` block in `src/tests/ListTransactionsTool.test.ts`:

```ts
    it('rejects ranges that exceed 180 days', () => {
      const result = resolveTransactionDateWindow('2025-01-01', '2026-05-27', '2026-05-27');
      expect(result).toEqual({
        error: expect.stringContaining('cannot exceed 180 days'),
      });
    });

    it('rejects startDate-only when today is more than 180 days away from it', () => {
      const result = resolveTransactionDateWindow('2024-01-01', undefined, '2026-05-27');
      expect(result).toEqual({
        error: expect.stringContaining('cannot exceed 180 days'),
      });
    });

    it('rejects startDate later than endDate', () => {
      const result = resolveTransactionDateWindow('2026-05-01', '2026-04-01', '2026-05-27');
      expect(result).toEqual({
        error: expect.stringContaining('must be on or before'),
      });
    });
```

- [ ] **Step 2: Run the validation tests to verify they fail**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t resolveTransactionDateWindow`
Expected: 3 new tests fail (the previous 6 still pass). The new tests fail because the helper has no validation yet — it returns a `ResolvedDateWindow` instead of an `error` object.

- [ ] **Step 3: Add validation to the helper**

In `src/tools/ListTransactionsTool.ts`, replace the `resolveTransactionDateWindow` function body with the version below. Also import the cap constant — add `MAX_LIST_TRANSACTIONS_RANGE_DAYS` to the `commonUtils.js` destructured import.

```ts
export function resolveTransactionDateWindow(
  startDate: string | undefined,
  endDate: string | undefined,
  today: string,
): ResolvedDateWindow | DateWindowError {
  const defaultDays = DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS;
  const maxDays = MAX_LIST_TRANSACTIONS_RANGE_DAYS;

  let resolvedStart: string;
  let resolvedEnd: string;
  let wasDefaulted: boolean;

  if (!startDate && !endDate) {
    resolvedStart = shiftDays(today, -defaultDays);
    resolvedEnd = today;
    wasDefaulted = true;
  } else if (startDate && !endDate) {
    resolvedStart = startDate;
    resolvedEnd = today;
    wasDefaulted = true;
  } else if (!startDate && endDate) {
    resolvedStart = shiftDays(endDate, -defaultDays);
    resolvedEnd = endDate;
    wasDefaulted = true;
  } else {
    resolvedStart = startDate!;
    resolvedEnd = endDate!;
    wasDefaulted = false;
  }

  if (resolvedStart > resolvedEnd) {
    return {
      error: `filters.startDate (${resolvedStart}) must be on or before filters.endDate (${resolvedEnd}).`,
    };
  }

  if (daysBetween(resolvedStart, resolvedEnd) > maxDays) {
    return {
      error:
        `Date range cannot exceed ${maxDays} days. Make multiple calls with ` +
        `sequential windows. For example, for a year: query 2025-12-01→2026-05-29, ` +
        `then 2025-06-04→2025-11-30, then 2024-12-08→2025-06-03.`,
    };
  }

  return { startDate: resolvedStart, endDate: resolvedEnd, wasDefaulted };
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}
```

- [ ] **Step 4: Run the validation tests to verify they pass**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t resolveTransactionDateWindow`
Expected: all 9 helper tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ListTransactionsTool.ts src/tests/ListTransactionsTool.test.ts
git commit -m "Add date-range validation to resolveTransactionDateWindow"
```

---

## Task 4: TDD — Wire helper into ListTransactionsTool.execute, update API call

**Files:**
- Modify: `src/tests/ListTransactionsTool.test.ts` (update one existing assertion, add new tests using fake timers)
- Modify: `src/tools/ListTransactionsTool.ts` (`execute` method)

- [ ] **Step 1: Add new failing integration tests using fake timers**

In `src/tests/ListTransactionsTool.test.ts`, locate the outer `describe('ListTransactionsTool', ...)` `beforeEach` block. Immediately *after* the outer `beforeEach` (around line 47 in the post-PR-1 file), add a fake-timer setup that the new integration tests will rely on:

```ts
  // Frozen "today" used by date-window integration tests below.
  // 2026-05-27 means "60 days back" resolves to 2026-03-28.
  const FROZEN_TODAY = '2026-05-27T12:00:00Z';
```

Then, inside `describe('execute', ...)`, add a new nested describe at the bottom (before the closing `})` of `describe('execute', ...)`):

```ts
    describe('date window resolution', () => {
      beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(FROZEN_TODAY));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('calls the API with the default 60-day-old since_date when no filters provided', async () => {
        await tool.execute({ response_format: 'json' });

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
          'test-budget-id',
          '2026-03-28',
        );
      });

      it('calls the API with the resolved startDate when only endDate is provided', async () => {
        await tool.execute({
          response_format: 'json',
          filters: { endDate: '2026-03-01' },
        });

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
          'test-budget-id',
          '2025-12-31',
        );
      });

      it('calls the API with the provided startDate when explicit', async () => {
        await tool.execute({
          response_format: 'json',
          filters: { startDate: '2026-04-01', endDate: '2026-05-15' },
        });

        expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
          'test-budget-id',
          '2026-04-01',
        );
      });

      it('returns an error and does not call the API when range exceeds 180 days', async () => {
        const result = await tool.execute({
          response_format: 'json',
          filters: { startDate: '2025-01-01', endDate: '2026-05-27' },
        });

        expect(result).toHaveProperty('isError', true);
        expect(result.content[0].text).toContain('cannot exceed 180 days');
        expect(mockApi.transactions.getTransactions).not.toHaveBeenCalled();
      });

      it('returns an error when startDate is after endDate', async () => {
        const result = await tool.execute({
          response_format: 'json',
          filters: { startDate: '2026-05-01', endDate: '2026-04-01' },
        });

        expect(result).toHaveProperty('isError', true);
        expect(result.content[0].text).toContain('must be on or before');
        expect(mockApi.transactions.getTransactions).not.toHaveBeenCalled();
      });
    });
```

Also import `afterEach` in the vitest import line at the top of the file:

```ts
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
```

- [ ] **Step 2: Update the stale `1900-01-01` assertion from PR #1**

The existing test "should successfully list all transactions with default parameters" asserts:

```ts
expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith('test-budget-id', '1900-01-01');
```

That assertion will break with the new behavior. Find both occurrences (the default-params test and the `'custom-budget-id'` variant) and replace the second argument with a regex matcher:

```ts
expect(mockApi.transactions.getTransactions).toHaveBeenCalledWith(
  'test-budget-id',
  expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
);
```

(And for the `custom-budget-id` variant.)

The new fake-timer-based integration tests above lock down the *exact* default date; these regex matchers cover the bulk of existing tests that don't care about the exact date.

- [ ] **Step 3: Run the integration tests to verify they fail**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'date window resolution'`
Expected: 5 failing tests — the tool still passes `FULL_HISTORY_SINCE_DATE = '1900-01-01'` from PR #1.

- [ ] **Step 4: Wire the helper into `execute()`**

Open `src/tools/ListTransactionsTool.ts`. Find the `execute` method. Replace the current opening block:

```ts
  async execute(input: ListTransactionsInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      // Get all transactions for the budget
      const transactionsResponse = await createRetryableAPICall(
        () => this.api.transactions.getTransactions(budgetId, FULL_HISTORY_SINCE_DATE),
        'Get transactions for listing'
      );
```

with:

```ts
  async execute(input: ListTransactionsInput) {
    try {
      const budgetId = getBudgetId(input.budgetId, this.budgetId);

      const today = new Date().toISOString().split("T")[0];
      const window = resolveTransactionDateWindow(
        input.filters?.startDate,
        input.filters?.endDate,
        today,
      );
      if ("error" in window) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${window.error}` }],
        };
      }

      const transactionsResponse = await createRetryableAPICall(
        () => this.api.transactions.getTransactions(budgetId, window.startDate),
        'Get transactions for listing'
      );
```

Remove `FULL_HISTORY_SINCE_DATE` from the `commonUtils.js` import block (it is no longer used in this file). Confirm the file still type-checks — `FULL_HISTORY_SINCE_DATE` should still be referenced from `BulkApproveTransactionsTool.ts` and `GetUnapprovedTransactionsTool.ts`.

- [ ] **Step 5: Run the integration tests to verify they pass**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'date window resolution'`
Expected: all 5 integration tests pass.

- [ ] **Step 6: Run the full file to make sure nothing else regressed**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts`
Expected: all tests in the file pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/ListTransactionsTool.ts src/tests/ListTransactionsTool.test.ts
git commit -m "Wire date window helper into ListTransactionsTool.execute"
```

---

## Task 5: TDD — Surface resolved window in JSON response

**Files:**
- Modify: `src/tests/ListTransactionsTool.test.ts` (extend the `date window resolution` describe)
- Modify: `src/tools/ListTransactionsTool.ts` (`execute` result object)

- [ ] **Step 1: Add failing tests for the `date_range` block**

In the `date window resolution` describe added in Task 4, append:

```ts
      it('includes a date_range block in the JSON response with was_defaulted=true', async () => {
        const result = await tool.execute({ response_format: 'json' });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.date_range).toEqual({
          start_date: '2026-03-28',
          end_date: '2026-05-27',
          was_defaulted: true,
        });
      });

      it('reports was_defaulted=false when both dates were explicit', async () => {
        const result = await tool.execute({
          response_format: 'json',
          filters: { startDate: '2026-04-01', endDate: '2026-05-15' },
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.date_range).toEqual({
          start_date: '2026-04-01',
          end_date: '2026-05-15',
          was_defaulted: false,
        });
      });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'date_range'`
Expected: 2 failing tests — `parsed.date_range` is `undefined`.

- [ ] **Step 3: Add `date_range` to the result object**

In `src/tools/ListTransactionsTool.ts`, locate the `result` object inside `execute()` (the one that already contains `transactions`, `pagination`, `transaction_count`, etc.). Replace it with the version below — only the `date_range` block is added; existing fields stay verbatim:

```ts
      const result = {
        transactions: paginatedTransactions,
        date_range: {
          start_date: window.startDate,
          end_date: window.endDate,
          was_defaulted: window.wasDefaulted,
        },
        pagination: {
          total,
          count: paginatedTransactions.length,
          offset,
          limit,
          has_more: hasMore,
          next_offset: nextOffset,
        },
        transaction_count: paginatedTransactions.length,
        filters_applied: input.filters || {},
        account_filter: input.accountId || input.accountName || "all",
      };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'date_range'`
Expected: both new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/ListTransactionsTool.ts src/tests/ListTransactionsTool.test.ts
git commit -m "Surface resolved date window in ListTransactions JSON response"
```

---

## Task 6: TDD — Render Window line in markdown response

**Files:**
- Modify: `src/tests/ListTransactionsTool.test.ts` (extend the `date window resolution` describe)
- Modify: `src/tools/ListTransactionsTool.ts` (`formatMarkdown` method)

- [ ] **Step 1: Inspect the existing markdown formatter**

Open `src/tools/ListTransactionsTool.ts` and find `formatMarkdown`. The summary section contains lines like `- **Showing**: ...` or `- **Total**: ...`. Note the exact heading the formatter uses (e.g., a summary header) — the Window line should appear inside that summary block, immediately after the heading.

- [ ] **Step 2: Add failing tests for the markdown Window line**

In the `date window resolution` describe, append:

```ts
      it('includes a Window summary line in markdown when window was defaulted', async () => {
        const result = await tool.execute({});  // defaults to markdown

        expect(result.content[0].text).toContain(
          '- **Window**: 2026-03-28 → 2026-05-27 (default — pass filters.startDate/endDate to widen, up to 180-day range)',
        );
      });

      it('includes a plain Window summary line when both dates were explicit', async () => {
        const result = await tool.execute({
          filters: { startDate: '2026-04-01', endDate: '2026-05-15' },
        });

        expect(result.content[0].text).toContain(
          '- **Window**: 2026-04-01 → 2026-05-15',
        );
        expect(result.content[0].text).not.toContain('default — pass filters');
      });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'Window summary line'`
Expected: 2 failing tests — the markdown formatter does not emit a Window line.

- [ ] **Step 4: Add the Window line to the markdown formatter**

In `formatMarkdown(result: any)` within `src/tools/ListTransactionsTool.ts`, find the existing summary section (the contiguous block of `- **Field**: ...` lines emitted near the top of the output). Add a Window line immediately *before* the first existing summary field, using the result's `date_range` block:

```ts
    const dr = result.date_range;
    if (dr) {
      const hint = dr.was_defaulted
        ? ' (default — pass filters.startDate/endDate to widen, up to 180-day range)'
        : '';
      output += `- **Window**: ${dr.start_date} → ${dr.end_date}${hint}\n`;
    }
```

(If your `formatMarkdown` accumulates into a different variable name than `output`, use that name. Inspect the existing code to match.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts -t 'Window summary line'`
Expected: both new tests pass.

- [ ] **Step 6: Run the full file to confirm no other markdown assertions broke**

Run: `npx vitest run src/tests/ListTransactionsTool.test.ts`
Expected: all tests in the file pass.

- [ ] **Step 7: Commit**

```bash
git add src/tools/ListTransactionsTool.ts src/tests/ListTransactionsTool.test.ts
git commit -m "Render resolved Window in ListTransactions markdown output"
```

---

## Task 7: Update tool description and schema strings

**Files:**
- Modify: `src/tools/ListTransactionsTool.ts` (`getToolDefinition`)

This task is documentation only — no new tests. The schema-text assertions in the existing test suite do not assert these specific strings, so updating them does not break tests. (Verified in PR #1 where similar updates landed without test changes.)

- [ ] **Step 1: Update the tool description**

In `getToolDefinition()` inside `src/tools/ListTransactionsTool.ts`, find:

```ts
      description: "List transactions from a budget with comprehensive filtering options. Supports filtering by account, approval status, cleared status, and other criteria.",
```

Replace with:

```ts
      description: "List transactions from a budget with comprehensive filtering options. Returns the last 60 days by default; specify filters.startDate / filters.endDate to widen, up to a 180-day range per call. For older history, make multiple calls stepping the window backwards. Supports filtering by account, approval status, cleared status, and other criteria.",
```

- [ ] **Step 2: Update the startDate / endDate schema descriptions**

In the same `inputSchema.properties.filters.properties`, find:

```ts
              startDate: {
                type: "string",
                description: "Start date for transaction filter (YYYY-MM-DD format)",
              },
              endDate: {
                type: "string",
                description: "End date for transaction filter (YYYY-MM-DD format)",
              },
```

Replace with:

```ts
              startDate: {
                type: "string",
                description: "Start date for transaction filter (YYYY-MM-DD format). Drives the YNAB API since_date. Defaults to 60 days before endDate (or today). The (endDate − startDate) range may not exceed 180 days per call.",
              },
              endDate: {
                type: "string",
                description: "End date for transaction filter (YYYY-MM-DD format). Defaults to today when startDate is provided alone. The (endDate − startDate) range may not exceed 180 days per call.",
              },
```

- [ ] **Step 3: Verify type-check + full test suite pass**

Run: `npm run type-check && npm run test:unit`
Expected: type-check exits 0; vitest reports all test files pass.

- [ ] **Step 4: Commit**

```bash
git add src/tools/ListTransactionsTool.ts
git commit -m "Document 60-day default and 180-day cap in ListTransactions schema"
```

---

## Task 8: Final verification gate

**Files:** none (gate task — no commits).

- [ ] **Step 1: Run the full npm test pipeline (unit + workers)**

Run: `npm test`
Expected: all test files pass on both `test:unit` and `test:workers`.

- [ ] **Step 2: Confirm `FULL_HISTORY_SINCE_DATE` still has live callers**

Run: `grep -rn "FULL_HISTORY_SINCE_DATE" src/`
Expected: at least the definition in `commonUtils.ts`, and references in `BulkApproveTransactionsTool.ts` and `GetUnapprovedTransactionsTool.ts`. No reference in `ListTransactionsTool.ts`.

- [ ] **Step 3: Manual smoke (optional but recommended)**

If you have access to a real YNAB API token in `YNAB_API_TOKEN`, build and start the server, then call `ynab_list_transactions` from an MCP client three ways:

1. No filters → response shows `was_defaulted: true` and a 60-day window.
2. `filters: { startDate: "2025-01-01", endDate: "2025-06-29" }` (180-day window) → succeeds.
3. `filters: { startDate: "2025-01-01", endDate: "2025-12-31" }` (>180 days) → returns the cap-exceeded error message without hitting the API.

This step is a sanity check; the integration tests in Task 4 mock the API so this confirms the real network call too.

---

## Spec coverage check (run after writing the plan, before handoff)

- Date-resolution rules table → Tasks 2 + 3.
- Validation rules (range cap, ordering) → Task 3.
- Strict comparison (`> 180` triggers error, 180 allowed) + zero-day range → Task 2 (allow-180-day test, allow-zero-day test) + Task 3 (reject-181+ test).
- API call uses resolved `startDate` → Task 4.
- Client-side `endDate` filtering — preserved via existing `applyFilters` (no code change needed, the existing branch already filters by `filters.endDate`; the resolved window's `endDate` is identical to what the user provided when explicit and is `today` when defaulted, which is harmless).
- Response `date_range` (snake_case) → Task 5.
- Markdown `Window` line with override hint when defaulted → Task 6.
- Tool description + schema text → Task 7.
- Constants `DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS`, `MAX_LIST_TRANSACTIONS_RANGE_DAYS` → Task 1.
- Out-of-scope confirmation: `BulkApprove`, `GetUnapproved`, `last_knowledge_of_server`, cursor pagination, schema renames → no tasks touch these; verified at Task 8 step 2.
