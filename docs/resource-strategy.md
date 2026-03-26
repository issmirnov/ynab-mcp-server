# Resource Strategy

This server already has the right foundation for quota-aware MCP resources:

- per-user OAuth-backed auth
- per-user default budget selection
- a small set of read-oriented tools
- Cloudflare KV for lightweight shared state

The goal is to add resources that improve client grounding without encouraging expensive or repeated YNAB API reads.

## Why Resources Here

Resources are better than tools when the client needs stable, read-only context before deciding on an action.

For this server, the main benefits are:

- clients can read budget context directly instead of guessing a tool
- Claude/ChatGPT are less likely to misuse heavy analytics tools for simple read requests
- common context like budgets, categories, and the current month can be reused across a session

Resources are not automatically a quota win. They only help if we keep them:

- small
- predictable
- cheap to read
- short-term cached

## What To Ship First

Start with 4 resources.

### 1. `ynab://budgets`

Purpose:
- list all available budgets for the authenticated user

YNAB calls:
- `budgets.getBudgets()`

Why first:
- required for discovery
- required for default budget setup
- cheap and stable

Cache:
- yes
- TTL: 5 minutes

### 2. `ynab://budgets/default`

Purpose:
- show the resolved default budget metadata
- include whether it came from explicit user preference or single-budget auto-selection

YNAB calls:
- ideally none if `ynab://budgets` is cached
- otherwise `budgets.getBudgets()`

Why first:
- gives clients a clean way to confirm budget context
- avoids tool chatter just to check what budget is active

Cache:
- yes
- TTL: 5 minutes
- derived from `ynab://budgets` + user prefs

### 3. `ynab://budgets/default/categories`

Purpose:
- grouped category listing for the resolved default budget

YNAB calls:
- `categories.getCategories(budgetId)`

Why first:
- directly addresses the “list my categories” use case
- prevents the model from choosing an analysis tool just to inspect categories

Cache:
- yes
- TTL: 2 minutes

### 4. `ynab://budgets/default/month/current`

Purpose:
- current-month budget summary, suitable for grounding before recommendations

YNAB calls:
- `months.getBudgetMonth(budgetId, currentMonth)`
- optionally `accounts.getAccounts(budgetId)` if we want the same shape as the current budget-summary tool

Why first:
- useful context for many assistant conversations
- still cheap if kept narrow

Cache:
- yes
- TTL: 30 to 60 seconds

## What Not To Ship Initially

Do not add these as first-wave resources:

- multi-month analytics
- transaction history resources with wide date ranges
- anything that loops across categories and months
- resources that duplicate write workflows

Those are better as explicit tools, where the model has to opt into the cost.

## Resource Shapes

Return machine-friendly JSON as resource text content with `application/json`.

Suggested shapes:

### `ynab://budgets`

```json
{
  "budgets": [
    { "id": "uuid", "name": "Colorado" }
  ]
}
```

### `ynab://budgets/default`

```json
{
  "budget": {
    "id": "uuid",
    "name": "Colorado"
  },
  "selectionSource": "user_preference"
}
```

### `ynab://budgets/default/categories`

```json
{
  "budgetId": "uuid",
  "groups": [
    {
      "id": "group-id",
      "name": "Monthly Bills",
      "categories": [
        { "id": "cat-id", "name": "Rent", "hidden": false }
      ]
    }
  ]
}
```

### `ynab://budgets/default/month/current`

```json
{
  "budgetId": "uuid",
  "month": "2026-03-01",
  "summary": {
    "income": 0,
    "budgeted": 0,
    "activity": 0,
    "toBeBudgeted": 0,
    "ageOfMoney": 0
  }
}
```

## Cache Design

Use KV for first-pass shared cache. It is simple, available already, and good enough for short TTL reads.

### Cache Keys

Use explicit versioned keys:

- `cache:v1:ynab:{userId}:budgets`
- `cache:v1:ynab:{userId}:default-budget`
- `cache:v1:ynab:{userId}:budget:{budgetId}:categories`
- `cache:v1:ynab:{userId}:budget:{budgetId}:month:{yyyy-mm}`

### Stored Value Shape

```json
{
  "cachedAt": "2026-03-25T23:00:00Z",
  "expiresAt": 1742944020000,
  "data": {}
}
```

### TTLs

- budgets: 300s
- default budget metadata: 300s
- categories: 120s
- current month summary: 45s

These are short enough to avoid obviously stale reads but long enough to absorb repeated client fetches.

## Invalidation Rules

Reads alone should never invalidate anything. Write tools should invalidate affected cached resources.

### Invalidate on Budget Preference Changes

When `ynab_set_default_budget` runs:

- delete `cache:v1:ynab:{userId}:default-budget`
- optionally keep `budgets` cache

### Invalidate on Budget Mutations

When tools change budget state, clear:

- `cache:v1:ynab:{userId}:budget:{budgetId}:categories` when category structure or category settings change
- `cache:v1:ynab:{userId}:budget:{budgetId}:month:{yyyy-mm}` when month balances or assignments change

Conservative invalidation is fine at first. It is better to over-invalidate than to serve misleading financial state.

## Resource Templates

After the first 4 resources, add templates instead of many fixed resources.

Second wave:

- `ynab://budgets/{budgetId}/categories`
- `ynab://budgets/{budgetId}/month/{month}`

This keeps discovery compact while still allowing explicit reads for advanced clients.

## Prompts

Prompts are worth adding after the first resource pass, but they are secondary.

Good prompt candidates:

- `monthly-budget-review`
- `review-overspending`
- `set-next-month-goals`

These should embed resources rather than duplicating expensive logic in prompt generation.

## Tasks

Do not prioritize tasks yet.

This server is mostly request-response over YNAB APIs. Tasks make more sense later if we introduce:

- multi-step planning flows
- async long-running analytics
- resumable or background jobs

## API Budget Strategy

Until YNAB approves the app and raises the limit, the resource system should optimize for predictable bounded cost.

Rules:

- every first-wave resource should use at most one upstream YNAB read, except current-month summary if accounts are included
- no resource should iterate across categories and months
- prefer a cache hit over shape-perfect freshness
- make heavy computation opt-in through tools

## Recommended Implementation Order

1. Add a small cache utility backed by KV
2. Register `resources/list` with the 4 fixed resources
3. Implement `resources/read` for those URIs
4. Invalidate cache from `ynab_set_default_budget`
5. Invalidate cache from write-capable tools
6. Add resource templates for explicit budget/month reads
7. Add a small prompt layer that references the resources

## Open Questions

- Should current-month resource include accounts, or stay month-only to keep it to one YNAB call?
- Should category resources include balances, goals, and activity, or remain name-oriented for low token cost?
- Do Claude and ChatGPT actually consume resources aggressively in this connector flow, or mostly on-demand?

The safe default is:

- no accounts in the first current-month resource
- lightweight categories
- fixed resources first, templates second
