# ynab-mcp-server

[![Add to Claude](https://img.shields.io/badge/Add_to_Claude-D97757?style=for-the-badge&logo=claude&logoColor=white)](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=MCP%20for%20YNAB&connectorUrl=https%3A%2F%2Fmcpforynab.smirnovlabs.com%2Fmcp)

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

On Claude, the **Add to Claude** button at the top covers steps 1 and 2. See [Set Up in Claude](#set-up-in-claude).

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

As of October 25, 2026, Claude keeps custom connectors under `Customize > Connectors`.

### Before you start

- Free, Pro, Max, Team, and Enterprise plans support custom connectors. The Free plan allows one.
- The hosted MCP URL is `https://mcpforynab.smirnovlabs.com/mcp`. The **Add to Claude** button fills it in for you.
- On Claude Team or Enterprise, an organization Owner adds the connector first.

### Step-by-step for Claude Free, Pro, or Max

1. Click **Add to Claude** at the top of this page.
2. If prompted, sign in to Claude.
3. Claude opens the `Add custom connector` dialog with the fields filled in, plus a notice that the values came from an external link. Check that the name is `MCP for YNAB` and the URL is `https://mcpforynab.smirnovlabs.com/mcp`.
4. If the dialog shows **Authentication** and **OAuth client** settings, choose `Sign in now` and `Register automatically`. This server does not support `Use Claude's published identity`.
5. Click `Add`.
6. Click `Connect`.
7. When redirected, sign in with YNAB and approve access.
8. Start a new chat.
9. Click `+`, select `Connectors`, and turn on `MCP for YNAB`.
10. Send a test prompt.

To add the connector by hand, go to `Customize > Connectors` and click `Add custom connector`. Enter the name `MCP for YNAB` and the hosted MCP URL, then continue from step 4.

### Step-by-step for Claude Team or Enterprise

An organization Owner adds the connector once. Then each member connects their own YNAB account.

For the Owner:

1. Open the [organization install link](https://claude.ai/admin-settings/connectors?modal=add-custom-connector&connectorName=MCP%20for%20YNAB&connectorUrl=https%3A%2F%2Fmcpforynab.smirnovlabs.com%2Fmcp). Claude opens the organization's `Add custom connector` dialog with the name and URL filled in.
2. If the dialog shows **Authentication** and **OAuth client** settings, choose `Sign in now` and `Register automatically`.
3. Click `Add`.

To add it by hand, go to `Organization settings > Connectors` and select `Add`, then `Custom`. Enter the name `MCP for YNAB` and the hosted MCP URL, then continue from step 2.

For each member:

1. Go to `Customize > Connectors`.
2. Find the connector your Owner added. It has the `Custom` label.
3. Click `Connect`.
4. When redirected, sign in with YNAB and approve access.
5. Start a new chat.
6. Click `+`, select `Connectors`, and turn on the connector.
7. Send a test prompt.

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
