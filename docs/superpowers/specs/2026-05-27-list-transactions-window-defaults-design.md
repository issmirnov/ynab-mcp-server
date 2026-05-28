# ListTransactions: window defaults and date-range paging

**Status:** Approved design, pending implementation plan.
**Date:** 2026-05-27
**Scope:** `src/tools/ListTransactionsTool.ts` only.

## Motivation

YNAB PAPI v1.85.0 (2026-06-04) defaults the `since_date` parameter to one year
ago when unspecified. PR #1 on branch `fix/preserve-full-transaction-history`
ships a defensive fix that passes `1900-01-01` from three call sites to
preserve prior all-history behavior.

For `ListTransactionsTool`, all-history is the wrong default: it can return
thousands of transactions, blow past the 25,000-character response cap, and
waste both YNAB API bandwidth and LLM context. This design replaces that
preservation behavior with an explicit recent-by-default window plus a hard
range cap that forces the LLM to page when it wants more.

`BulkApproveTransactionsTool` and `GetUnapprovedTransactionsTool` are out of
scope. Their results are inherently bounded by approval status (typically
dozens of transactions), so the all-history default remains appropriate.

## Behavior

### Date-range resolution

Inputs: `filters.startDate` (string, `YYYY-MM-DD`), `filters.endDate` (same).

Both are optional. The tool resolves them as follows before any other work:

| `startDate` | `endDate` | Resolved `startDate` | Resolved `endDate` |
|---|---|---|---|
| absent | absent | `today − 60 days` | `today` |
| present | absent | as given | `today` |
| absent | present | `endDate − 60 days` | as given |
| present | present | as given | as given |

`today` is computed as `new Date().toISOString().split("T")[0]` (UTC), matching
the existing convention used throughout `src/tools/`.

### Validation

The tool returns `isError: true` (no API call made) when:

- `endDate − startDate > 180 days`. Message:
  > "Date range cannot exceed 180 days. Make multiple calls with sequential
  > windows. For example, for a year: query `2025-12-01→2026-05-29`, then
  > `2025-06-04→2025-11-30`, then `2024-12-08→2025-06-03`."

- `startDate > endDate`. Message:
  > "filters.startDate (X) must be on or before filters.endDate (Y)."

The 180-day comparison is strict (`> 180` triggers the error; a 180-day
window is allowed). Range arithmetic is `(endDate − startDate)` in whole UTC
days. A zero-day range (`startDate === endDate`) is allowed — single-day
query.

No upper bound on how far in the past `startDate` may be, as long as the
resolved range stays ≤ 180 days. This is the date-window paging mechanism:
the LLM walks the calendar in 180-day chunks.

### API call

The resolved `startDate` is passed as the `since_date` parameter to
`ynab.transactions.getTransactions(budgetId, startDate)`. This replaces the
current call which passes `FULL_HISTORY_SINCE_DATE = "1900-01-01"`.

The YNAB API does not accept an end-date parameter, so `endDate` is enforced
client-side in the existing `applyFilters` pass.

### Response shape (JSON)

A new top-level `date_range` block joins the existing `pagination` and
`transactions` blocks:

```json
{
  "transactions": [...],
  "date_range": {
    "start_date": "2026-03-28",
    "end_date":   "2026-05-27",
    "was_defaulted": true
  },
  "pagination": {
    "total": 42,
    "count": 42,
    "offset": 0,
    "limit": 50,
    "has_more": false,
    "next_offset": null
  },
  "transaction_count": 42,
  "filters_applied": {...},
  "account_filter": "all"
}
```

`was_defaulted` is `true` when either side was filled in by the tool (i.e.,
the LLM did not explicitly provide both `startDate` and `endDate`).

Field naming is snake_case to match the existing response convention
(`has_more`, `next_offset`, `transaction_count`, `filters_applied`).

### Response shape (Markdown)

The existing summary block gains one line, matching the project's
`- **Field**: value` pattern. When the window was auto-filled
(`was_defaulted: true`), include the override hint:

```
- **Window**: 2026-03-28 → 2026-05-27 (default — pass filters.startDate/endDate to widen, up to 180-day range)
```

When the LLM provided both dates explicitly, drop the parenthetical:

```
- **Window**: 2026-03-28 → 2026-05-27
```

The override hint is generic across all three defaulting cases (neither
side given; only startDate; only endDate) because in all of them the LLM's
useful next move is the same: provide both sides explicitly.

### Pagination semantics (unchanged + clarified)

`limit` (default 50, max 100) and `offset` page through results *within* a
single date window. Nothing changes here.

LLMs now have two paging axes:

1. **Date window:** to access data older than 60 days, set
   `filters.startDate` / `filters.endDate` (each call ≤ 180 days). Step
   backwards in time to walk multi-year history.
2. **Offset:** when `pagination.has_more` is `true` within a window, bump
   `offset` to fetch the next slice without re-issuing the API call.

## Tool description update

```
List transactions from a budget with comprehensive filtering options.
Returns the last 60 days by default; specify filters.startDate /
filters.endDate to widen, up to a 180-day range per call. For older
history, make multiple calls stepping the window backwards. Supports
filtering by account, approval status, cleared status, and other criteria.
```

`filters.startDate` and `filters.endDate` schema descriptions each get a
one-line addendum noting the 60-day default and 180-day max range.

## Constants

Added to `src/utils/commonUtils.ts`:

```ts
export const DEFAULT_LIST_TRANSACTIONS_WINDOW_DAYS = 60;
export const MAX_LIST_TRANSACTIONS_RANGE_DAYS = 180;
```

Tool-specific naming because the rule applies to `ListTransactionsTool` only.
`FULL_HISTORY_SINCE_DATE` stays for `BulkApprove` and `GetUnapproved`.

## Cross-references

- **MCP spec:** the cursor-based pagination spec
  (https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/pagination)
  governs `tools/list`/`resources/list`/etc. only — tool response shapes are
  unconstrained. The offset/limit + opaque `date_range` block design does
  not conflict.
- **YNAB API:** `since_date` is the only date parameter on
  `GET /budgets/{id}/transactions`; no `end_date`/`until_date` exists. Confirms
  client-side enforcement of `endDate` is necessary.
- **`last_knowledge_of_server`:** YNAB supports incremental sync via this
  parameter. Out of scope for this design but a possible future enhancement
  if we add cross-call state.

## Testing

TDD; tests in `src/tests/ListTransactionsTool.test.ts`. New cases:

1. Default behavior: no `startDate`/`endDate` → API called with `now − 60d`
   as `since_date`; response `date_range.was_defaulted` is `true`.
2. `startDate` only, within 180 days of today → API called with that date;
   `endDate` resolved to today.
3. `startDate` only, > 180 days back from today → error with the range-cap
   message; no API call made.
4. `endDate` only → `startDate` resolved to `endDate − 60d`.
5. Both, ≤ 180-day range → API called with `startDate`; `endDate` filters
   client-side.
6. Both, > 180-day range → error with the range-cap message.
7. `startDate > endDate` → error with the ordering message.
8. Response includes `date_range` block (JSON path); markdown summary
   contains the `Window: ...` line.
9. Existing assertions in `ListTransactionsTool.test.ts` that expect
   `toHaveBeenCalledWith('test-budget-id', '1900-01-01')` are updated. To
   avoid date-flakiness, use `expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)`
   or Vitest fake-timers (`vi.useFakeTimers()` + `vi.setSystemTime(...)`).

## Out of scope

- Changes to `BulkApproveTransactionsTool` or `GetUnapprovedTransactionsTool`.
- `last_knowledge_of_server` incremental sync.
- Replacing offset/limit pagination with MCP-style cursors.
- Renaming `filters.startDate` / `filters.endDate` or moving them to the top
  level of the input schema.

## Branch and PR strategy

The current branch `fix/preserve-full-transaction-history` ships the
defensive fix for YNAB's June 4 change as PR #1.

This design ships on a new branch off `main` as PR #2 (named e.g.
`feat/list-transactions-window-defaults`). PR #2 modifies the
`FULL_HISTORY_SINCE_DATE` call site that PR #1 introduced in
`ListTransactionsTool.ts`; if PR #2 is reviewed in parallel, rebase it once
PR #1 lands.
