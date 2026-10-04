# Goal Management — Design

**Date:** 2026-10-03
**Status:** Revised after second-opinion review (Opus 5.5); pending final approval
**Branch:** `feat/goal-management`

## Problem

`ynab_set_category_goals` refuses to create goals — it returns "Creating new goals
requires the YNAB web interface" when a category has no goal, and only updates
`goal_target`/target date on categories that already have one. It also can't set a
goal's NEED behavior, and can't remove a goal.

## Feasibility (verified against live OpenAPI spec)

The "creation requires the web interface" belief is **outdated** (same story as category
creation). The PATCH-category body (`SaveCategory`) supports:

| Operation | Field(s) | Notes |
|---|---|---|
| Create a goal | `goal_target` on a goal-less category | API creates it; type inferred (NEED default; MF for credit-card, DEBT for loan categories) |
| Change target / date | `goal_target`, `goal_target_date` | |
| NEED behavior | `goal_needs_whole_amount` | true = "set aside another…", false = "refill up to…". NEED-only; not for card/loan categories |
| Remove a goal | `goal_target: null` | verified: `null` survives the SDK serializer + `JSON.stringify` |
| Cadence (recurring) | `goal_frequency` | API supports it, but the pinned SDK can't transmit it — **deferred**, see Non-goals |

**Hard limitation:** `SaveCategory` has **no settable `goal_type`**. On creation the API
infers it — **NEED** by default, **MF** for Credit Card Payment categories, **DEBT** for
loan-paired categories. So **Target-Balance (TB) and Target-Balance-by-Date (TBD) goals
cannot be created via the API** — only NEED-family (+ auto MF/DEBT). A caller asking for a
TB goal silently gets a NEED goal; the tool description must say so.

### SDK transport limitation (why `goal_frequency` is deferred)

`ynab@4.5.0` (confirmed latest) does **not** merely JSON-serialize the category object —
`ExistingCategoryToJSONTyped` **rebuilds the body from a fixed whitelist**: `name`, `note`,
`category_group_id`, `goal_target`, `goal_target_date`, `goal_needs_whole_amount`.
`goal_frequency` is **not** in the whitelist, so a type cast compiles but the value is
dropped before `JSON.stringify` — it never reaches the wire. (Verified in
`node_modules/ynab/dist/esm/models/ExistingCategory.js` and the CJS build.)

The `payee_id: null` precedent does **not** apply here: `payee_id` *is* whitelisted in the
transaction serializer, so that cast only widened the *type* to allow a `null` *value* for a
field the serializer already sends. `goal_frequency` is a different problem — an unknown
field the serializer never copies — and no newer SDK exists. It is therefore deferred to a
follow-up (would require a direct, non-SDK PATCH). By contrast, `goal_target: null` for
removal is safe: `goal_target` is whitelisted and `null` survives serialization.

## Design — enhance `ynab_set_category_goals`

One tool that creates, updates, or removes a category's goal via a single PATCH. The
response states which occurred (created / updated / removed / no-op) and reports the goal
type the API actually assigned.

### Inputs
- `budgetId?` — unchanged (default-budget resolution)
- `categoryId?` / `categoryName?` — unchanged, now resolved via the shared `findCategory`
  helper in `src/utils/categoryLookup.ts` (exact-then-partial), replacing the tool's
  bespoke matcher
- `goalTarget?` (number, dollars) — the target amount; on a goal-less category this
  **creates** a goal (type auto-inferred by the API)
- `goalTargetDate?` (YYYY-MM-DD) — target date
- `needsWholeAmount?` (boolean) — **new**: NEED behavior
- `removeGoal?` (boolean) — **new**: sends `goal_target: null` to clear the goal
- `note?`, `dryRun?`, `response_format?` — unchanged
- **Deprecated but still accepted** (so `additionalProperties: false` doesn't hard-reject a
  stale caller — backward compatibility):
  - `goalType` — ignored; it never reached the API. Documented as deprecated/no-op.
  - `goalTargetMonth` — aliased to `goalTargetDate` (if both are given, `goalTargetDate`
    wins). Documented as deprecated.
- **Not added:** `goalFrequency` — the SDK can't transmit it (see above); deferred.

### Validation (clean errors instead of API 400s)
- `removeGoal: true` is mutually exclusive with `goalTarget` / `goalTargetDate` /
  `needsWholeAmount`. `removeGoal: false` is a no-op flag, not an action.
- At least one actionable field must be provided (`goalTarget` / `goalTargetDate` /
  `needsWholeAmount` / `removeGoal: true`). `goalTarget: 0` counts as actionable (a real
  zero target, distinct from removal).
- Category must resolve, else a descriptive error.
- Using the **pre-fetched** category's `goal_type`, reject *before* the API call when:
  - `needsWholeAmount` is set on a non-NEED goal, or a credit-card / loan-paired category
  - `goalTargetDate` is set on a loan-paired category

  These are documented API-only constraints; catching them avoids raw 400s. When the goal
  type is unknown (a goal-less category being created), let the API decide.

### Implementation notes
- `this.api.categories.updateCategory(budgetId, categoryId, { category })`
- `category` typed as
  `Omit<ynab.ExistingCategory, "goal_target"> & { goal_target?: number | null }` — the same
  null-widening the `payee_id` work used (the *valid* half of that precedent), so
  `removeGoal` can send `goal_target: null`. No `goal_frequency` cast (de-scoped).
- `goalTarget` dollars → milliunits via `amountToMilliUnits`; `removeGoal: true` →
  `goal_target: null`
- Detect created-vs-updated by whether the pre-fetched category had a `goal_type`; **report
  the goal type from the `updateCategory` response** (may be MF/DEBT) — never hard-code
  "NEED"
- Tool description documents the reality: creates NEED-family goals only (no TB/TBD); type
  is auto-inferred (NEED, or MF/DEBT for card/loan categories); a requested TB goal becomes
  NEED; recurring cadence is not yet supported

## Testing
- Rewrite the `SetCategoryGoalsTool` tests: the current ones assert the old "requires web
  interface" refusal and the removed `goalType`, and mock `months.getPlanMonth`, which the
  tool never calls (drop the vestigial mock). The response shape changes
  (created/updated/removed/no-op + reported type), so the `SetCategoryGoalsResult`
  assertions churn broadly.
- New cases:
  - create a goal on a goal-less category, asserting it **reports the API-returned
    `goal_type`** (e.g. a credit-card category returns MF)
  - set target/date on an existing goal
  - set needs-whole-amount
  - remove a goal, asserting the body is exactly `{ category: { goal_target: null } }`
    (a meaningful mock-boundary assertion — the field is whitelisted, so it reaches the wire)
  - each validation error: exclusivity, nothing-actionable, and the incompatible-`goal_type`
    guard
  - back-compat: a stale `goalType` is ignored; `goalTargetMonth` is treated as
    `goalTargetDate`
  - API error → `isError`; `dryRun`
- Full suite green; update the CLAUDE.md goal-tool description.

## Non-goals
- **Recurring-cadence goals (`goal_frequency`)** — the API supports it, but the pinned SDK
  strips the field; deferred to a follow-up that issues a direct (non-SDK) PATCH.
- Creating TB/TBD goals or choosing `goal_type` (API-unsupported).
- Changing other category fields (that's `ynab_update_category`).

## Revisions
- **2026-10-03 — second-opinion review (Opus 5.5):** de-scoped `goal_frequency` after
  verifying the SDK serializer drops non-whitelisted fields; report the API-assigned
  `goal_type` instead of assuming NEED; added pre-flight guards for API-only field
  constraints; kept `goalType`/`goalTargetMonth` as deprecated-accepted inputs for
  backward compatibility; switched to the shared `findCategory` helper; tightened the
  test plan (wire-level `removeGoal` assertion, API-returned-type assertion, drop the
  vestigial `getPlanMonth` mock).
