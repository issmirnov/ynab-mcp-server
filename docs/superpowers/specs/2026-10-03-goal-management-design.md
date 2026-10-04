# Goal Management — Design

**Date:** 2026-10-03
**Status:** Design approved; ready for implementation plan
**Branch:** `feat/goal-management`

## Problem

`ynab_set_category_goals` refuses to create goals — it returns "Creating new goals
requires the YNAB web interface" when a category has no goal, and only updates
`goal_target`/target date on categories that already have one. It also can't set a
goal's cadence or NEED behavior, and can't remove a goal.

## Feasibility (verified against live OpenAPI spec)

The "creation requires the web interface" belief is **outdated** (same story as category
creation). The PATCH-category body (`SaveCategory`) now supports:

| Operation | Field(s) | Notes |
|---|---|---|
| Create a goal | `goal_target` on a goal-less category | API creates it; type inferred |
| Change target / date | `goal_target`, `goal_target_date` | |
| Cadence | `goal_frequency` = `monthly`/`weekly`/`yearly` | recurring NEED; requires `goal_target`; **not** combinable with `goal_target_date` |
| NEED behavior | `goal_needs_whole_amount` | true = "set aside another…", false = "refill up to…" |
| Remove a goal | `goal_target: null` | |

**Hard limitation:** `SaveCategory` has **no settable `goal_type`**. On creation the API
infers it — **NEED** by default, **MF** for Credit Card Payment categories, **DEBT** for
loan-paired categories. So **Target-Balance (TB) and Target-Balance-by-Date (TBD) goals
cannot be created via the API** — only NEED-family (+ auto MF/DEBT).

**SDK gap:** `goal_frequency` is not on `ynab@4.5.0`'s `ExistingCategory` type (4.5.0 is
the latest). The SDK JSON-serializes the category object, so we send `goal_frequency` via
a type cast — same pattern used for `payee_id` null in the category work.

## Design — enhance `ynab_set_category_goals`

One tool that creates, updates, or removes a category's goal via a single PATCH. The
response states which occurred (created / updated / removed / no-op).

### Inputs
- `budgetId?` — unchanged (default-budget resolution)
- `categoryId?` / `categoryName?` — unchanged (exact-then-partial match)
- `goalTarget?` (number, dollars) — the target amount; on a goal-less category this
  **creates** a NEED goal
- `goalTargetDate?` (YYYY-MM-DD) — target date. **Consolidates** the old
  `goalTargetDate`/`goalTargetMonth` into one field
- `goalFrequency?` — **new**: `monthly` | `weekly` | `yearly`
- `needsWholeAmount?` (boolean) — **new**: NEED behavior
- `removeGoal?` (boolean) — **new**: sends `goal_target: null` to clear the goal
- `note?`, `dryRun?`, `response_format?` — unchanged
- **Removed:** `goalType` (the API can't honor it; it was never sent to the API anyway)

### Validation (clean errors instead of API 400s)
- `removeGoal` is mutually exclusive with `goalTarget`/`goalFrequency`/`goalTargetDate`/`needsWholeAmount`
- `goalFrequency` requires `goalTarget`
- `goalFrequency` cannot be combined with `goalTargetDate`
- At least one actionable field must be provided
- Category must resolve, else descriptive error

### Implementation notes
- `this.api.categories.updateCategory(budgetId, categoryId, { category })`
- `category` typed as `ynab.ExistingCategory & { goal_frequency?: "monthly"|"weekly"|"yearly" }`
- `goalTarget` dollars → milliunits via `amountToMilliUnits`; `removeGoal` → `goal_target: null`
- Detect created-vs-updated by whether the pre-fetched category had `goal_type`
- Tool description documents the NEED-family-only reality (no TB/TBD; MF/DEBT auto)

## Testing
- Update existing `SetCategoryGoalsTool` tests for the removed `goalType` and the new
  create-on-absent behavior (the current tests assert the old "requires web interface"
  refusal — those change)
- New cases: create goal on goal-less category; set frequency; set needs-whole-amount;
  remove goal; each validation error; API-error → `isError`; dryRun
- Full suite green; update CLAUDE.md goal-tool description

## Non-goals
- Creating TB/TBD goals or choosing `goal_type` (API unsupported)
- Changing other category fields (that's `ynab_update_category`)
