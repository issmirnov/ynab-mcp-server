# ynab-mcp-server

Connect YNAB to ChatGPT or Claude with a hosted MCP server.

Use this if you want your AI assistant to read and manage your YNAB plans, categories, transactions, and goals — and review balances and net worth — after you sign in with your own YNAB account.

## What You Need

- a YNAB account
- the hosted MCP URL: `https://mcpforynab.smirnovlabs.com/mcp`
- ChatGPT or Claude with support for custom MCP connectors

## Quick Start

1. Get your hosted MCP URL.
2. Add that URL in ChatGPT or Claude.
3. Click Connect.
4. Sign in with YNAB when prompted.
5. Return to your chat and start asking YNAB questions.

## Set Up in ChatGPT

These steps are for the ChatGPT web app.

As of March 25, 2026, OpenAI requires developer mode for custom MCP connectors.

### Before you start

- You need a ChatGPT plan that supports custom MCP connectors.
- If you are on a workspace plan, your admin may need to enable developer mode first.
- You need this hosted MCP URL: `https://mcpforynab.smirnovlabs.com/mcp`.

### Step-by-step

1. Open `chatgpt.com`.
2. Open Settings.
3. Enable developer mode if it is not already enabled.
4. Go to Apps or Connectors and choose to create a custom app or connector.
5. Paste your hosted MCP URL.
6. Choose OAuth if ChatGPT asks for an authentication method.
7. Save or create the connector.
8. Start a new chat.
9. Open the tools menu and enable the new connector.
10. When redirected, sign in with YNAB and approve access.
11. Return to ChatGPT and send a test prompt.

### Good first prompts

- `Show me the balances of all my plan accounts.`
- `List my plan categories with available amounts.`
- `Find my most recent grocery transactions.`
- `What were my largest spending categories last month?`

## Set Up in Claude

These steps are for `claude.ai`.

As of March 25, 2026, Anthropic supports remote MCP connectors in the Connectors settings.

### Before you start

- You need a Claude plan that supports remote MCP connectors.
- You need this hosted MCP URL: `https://mcpforynab.smirnovlabs.com/mcp`.
- If you are on Claude Team or Enterprise, your workspace owner may need to add the connector first.

### Step-by-step for Claude Pro or Max

1. Open `claude.ai`.
2. Open Settings.
3. Open Connectors.
4. Click `Add custom connector`.
5. Paste your hosted MCP URL.
6. Save the connector.
7. Click `Connect`.
8. When redirected, sign in with YNAB and approve access.
9. Start a new chat.
10. Use the `+` menu to enable the connector for that conversation.
11. Send a test prompt.

### Step-by-step for Claude Team or Enterprise

1. Ask your workspace owner to open `Organization settings -> Connectors`.
2. Have them add the custom connector using your hosted MCP URL.
3. After that is done, open your own Claude settings.
4. Go to Connectors.
5. Find the new custom connector.
6. Click `Connect`.
7. When redirected, sign in with YNAB and approve access.
8. Start a new chat.
9. Use the `+` menu to enable the connector for that conversation.
10. Send a test prompt.

### Good first prompts

- `Show me my current account balances in YNAB.`
- `What categories are overspent right now?`
- `Find transactions from Amazon in the last 30 days.`
- `Summarize my spending by category this month.`

## What Happens When You Connect

1. ChatGPT or Claude connects to the hosted MCP URL.
2. The MCP server sends you to YNAB sign-in.
3. You approve access to your YNAB account.
4. The service stores the OAuth tokens needed to make future YNAB requests on your behalf.
5. Your assistant can then use YNAB tools and resources in chat.

## Available Tools

Once connected, your assistant can use the tools below. **Read** tools only look at your data; **Write** tools change your budget (and ones marked *delete* remove data).

### Budgets & setup

| Tool | What it does | Access |
|---|---|---|
| `ynab_list_budgets` | List your YNAB budgets | Read |
| `ynab_budget_summary` | Month summary of categories, balances, and accounts | Read |
| `ynab_set_default_budget` | Remember a default budget so you don't name it every time | Setup |

### Categories & goals

| Tool | What it does | Access |
|---|---|---|
| `ynab_list_categories` | List category groups and categories with balances and goals | Read |
| `ynab_create_category` | Create a category in a group | Write |
| `ynab_update_category` | Rename a category, edit its note, or move it between groups | Write |
| `ynab_create_category_group` | Create a category group | Write |
| `ynab_update_category_group` | Rename a category group | Write |
| `ynab_set_category_goals` | Create, update, or remove a category's goal | Write |

### Transactions

| Tool | What it does | Access |
|---|---|---|
| `ynab_list_transactions` | List and filter transactions by account, category, payee, or date | Read |
| `ynab_get_unapproved_transactions` | List transactions waiting for approval | Read |
| `ynab_create_transaction` | Add a transaction | Write |
| `ynab_update_transaction` | Edit an existing transaction | Write |
| `ynab_approve_transaction` | Approve one pending transaction | Write |
| `ynab_bulk_approve_transactions` | Approve many pending transactions at once | Write |
| `ynab_delete_transaction` | Delete a transaction | Write (delete) |

### Scheduled (recurring) transactions

| Tool | What it does | Access |
|---|---|---|
| `ynab_list_scheduled_transactions` | List scheduled/recurring transactions | Read |
| `ynab_create_scheduled_transaction` | Schedule a future or recurring transaction | Write |
| `ynab_update_scheduled_transaction` | Edit a scheduled transaction | Write |
| `ynab_delete_scheduled_transaction` | Delete a scheduled transaction | Write (delete) |

### Budgeting workflows

| Tool | What it does | Access |
|---|---|---|
| `ynab_move_funds_between_categories` | Move budgeted dollars between categories | Write |
| `ynab_auto_distribute_funds` | Allocate "Ready to Assign" money across categories by goal | Write |
| `ynab_handle_overspending` | Cover overspent categories by moving funds | Write |
| `ynab_budget_from_history` | Allocate based on historical spending | Write |
| `ynab_reconcile_account` | Reconcile an account to a statement balance | Write |

### Analytics & insights (read-only)

| Tool | What it does |
|---|---|
| `ynab_analyze_spending_patterns` | Spot spending trends and anomalies |
| `ynab_goal_progress_report` | Track progress toward category goals |
| `ynab_cash_flow_forecast` | Project upcoming cash flow from history |
| `ynab_category_performance_review` | Compare budgeted vs. actual by category |
| `ynab_net_worth_analysis` | Summarize net worth across accounts |

## YNAB API Coverage

How these tools line up with the official [YNAB API](https://api.ynab.com) (accessed through the `ynab` JavaScript SDK). ✅ = covered, ◐ = partial, — = not yet.

| YNAB API area | Covered | Tools / notes |
|---|---|---|
| Budgets (plans) | ✅ | `ynab_list_budgets`, `ynab_budget_summary`; plan *settings* are not exposed |
| Accounts | ◐ | Balances read via `ynab_budget_summary`, `ynab_net_worth_analysis`, `ynab_reconcile_account`; no create-account or standalone account list |
| Categories & groups | ✅ | List, create, and update categories and groups; goals; per-month funding |
| Months | ✅ | Surfaced through `ynab_budget_summary` and the analytics tools |
| Transactions | ✅ | List, create, update, delete, approve, bulk-approve (file `import` is not exposed) |
| Scheduled transactions | ✅ | List, create, update, delete |
| Payees | — | Referenced implicitly by name in the transaction tools; no list/update-payee tool |
| Payee locations | — | Not exposed |
| User | — | Identity is handled by OAuth; `getUser` is not exposed |

Beyond the raw API, this server adds **composite tools** that have no single API endpoint: the budgeting workflows (move funds, auto-distribute, handle overspending, budget from history, reconcile) and the analytics tools (spending patterns, goal progress, cash flow, category performance, net worth).

## Troubleshooting

### The connector does not appear in ChatGPT

- Confirm your plan supports custom MCP connectors.
- Confirm developer mode is enabled.
- If you are on a workspace plan, confirm your admin enabled the required settings.

### The connector does not appear in Claude

- Confirm your plan supports remote MCP connectors.
- On Team or Enterprise, confirm your workspace owner added the connector first.

### I connected, but YNAB tools are not working

- Disconnect and reconnect the connector.
- Make sure you completed the YNAB OAuth approval step.
- Start a fresh chat and re-enable the connector for that conversation.

### The MCP URL is not working

- Make sure you pasted the full HTTPS URL.
- Do not remove the trailing `/mcp` if your hosted URL includes it.

## Privacy

This service uses OAuth to connect to your YNAB account. It does not ask for your YNAB password directly.

This app is not officially supported by YNAB in any way. Use it at your own risk.

Read the privacy policy here:

- [PRIVACY.md](./PRIVACY.md)

## For Self-Hosting or Operators

If you are trying to deploy or host this service yourself, use [CONTRIBUTING.md](./CONTRIBUTING.md).
This README is intentionally written for end users connecting the hosted service in ChatGPT or Claude.
