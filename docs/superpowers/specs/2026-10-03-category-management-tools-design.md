# Category Management Tools — Design

**Date:** 2026-10-03
**Status:** Approved (scope + approach), implementation in progress
**Branch:** `feat/category-management-tools`

## Problem

The YNAB connector can read budgets and categories but cannot **create** categories
or category groups, and `ynab_set_category_goals` only edits goals on categories
that already have one. Users have no way to build out their category structure
through the MCP server.

## Feasibility (verified)

Initial assumption was that the YNAB API cannot create categories — a long-standing
limitation. **This was verified wrong against the live OpenAPI spec**
(`https://api.ynab.com/papi/open_api_spec.yaml`). YNAB has since added:

| Operation | Endpoint | Request body |
|---|---|---|
| Create category | `POST /v1/plans/{id}/categories` | `name` + `category_group_id` (both required), optional `note` |
| Create category group | `POST /v1/plans/{id}/category_groups` | `name` (required, ≤50 chars) |
| Update category group | `PATCH /v1/plans/{id}/category_groups/{id}` | `name` |
| Update category | `PATCH /v1/plans/{id}/categories/{id}` | `name`, `note`, `category_group_id` (already in SDK) |

The API has **no delete** for categories or groups — so deletion is out of scope.

The bundled SDK (`ynab@2.10.0`) predates these endpoints. The current SDK
(`ynab@4.5.0`) ships `createCategory`, `createCategoryGroup`, and
`updateCategoryGroup` natively. **Approach chosen: upgrade the SDK** (vs. hand-rolling
`fetch`), for native typed methods and future-proofing.

## SDK migration (2.10.0 → 4.5.0)

v4.5.0 renamed the `budgets` API namespace to `plans` (YNAB's path rename). All other
namespaces (`accounts`, `categories`, `months`, `payees`, `transactions`,
`scheduledTransactions`) and all imported model types are preserved. Methods that
previously took `budgetId` now name the positional param `planId` — same call sites,
no change needed.

**Only the SDK call boundary changes. All user-facing "budget" terminology, tool names
(`ynab_list_budgets`), and `budgetId` parameters stay unchanged** — the product is still
"budgets" to users; only YNAB's internal API paths were renamed.

Required edits:
- `this.api.budgets.getBudgets()` → `this.api.plans.getPlans()`; `res.data.budgets` → `res.data.plans`
  - `src/tools/ListBudgetsTool.ts`, `src/tools/SetDefaultBudgetTool.ts`, `src/resources/ynabResources.ts`
- `this.api.budgets.getBudgetById("default")` → `this.api.plans.getPlanById("default")`; `res.data.budget` → `res.data.plan`
  - `src/resources/ynabResources.ts`
- Matching test-mock updates (`budgets.getBudgets` → `plans.getPlans`, `data:{budgets}` → `data:{plans}`).
- Any other breakage surfaced by `tsc --noEmit` and the test suite (baseline: **406 tests green**).

## New tools (4)

All follow the existing tool pattern: `getToolDefinition()` + `execute()`, `ynab_` prefix,
`response_format` json/markdown, `truncateResponse`/`CHARACTER_LIMIT`, `isError` on failure,
`createRetryableAPICall` wrapping the write, manual registration in
`src/mcp/registerTools.ts`, write annotations (`readOnlyHint:false`) so the registry
invalidates budget-scoped caches after the call.

1. **`ynab_create_category_group`** — create a group.
   Inputs: `budgetId?`, `name` (required), `response_format?`.
2. **`ynab_create_category`** — create a category in a group.
   Inputs: `budgetId?`, `name` (required), `categoryGroupId?` **or** `categoryGroupName?`
   (name resolved via `getCategories`, exact-then-partial like `SetCategoryGoalsTool`),
   `note?`, `response_format?`. Errors if the group can't be resolved.
3. **`ynab_update_category`** — rename / move / edit note on an existing category.
   Inputs: `budgetId?`, `categoryId?` **or** `categoryName?`, and any of `newName?`,
   `note?`, `categoryGroupId?`/`categoryGroupName?` (move). Uses existing SDK `updateCategory`.
4. **`ynab_update_category_group`** — rename a group.
   Inputs: `budgetId?`, `categoryGroupId?` **or** `categoryGroupName?`, `name` (required).

### Name resolution helper

Create/update-category and update-group accept names as a convenience (an agent that
just read the category list has names, not ids). Resolution reuses the exact-then-partial
match already used in `SetCategoryGoalsTool`, factored into a small shared helper to avoid
duplication. Ambiguous/!found → descriptive error.

## Testing

- Unit test per new tool (mock `ynab.API`), covering: success (json + markdown),
  name resolution (hit/miss/ambiguous), validation errors, and API-error → `isError`.
- Full suite must return to green (≥ 406 + new tests).
- Local `wrangler dev` smoke (OAuth-gated, so full E2E happens on staging).
- Deploy to staging (`npm run deploy:staging`) for real-token verification.

## Non-goals

- Deleting categories/groups (API unsupported).
- Renaming existing tools, params, or "budget" terminology.
- Broader refactors beyond the `budgets→plans` SDK boundary.
