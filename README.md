# ynab-mcp-server

Connect YNAB to ChatGPT or Claude with a hosted MCP server.

Use this if you want your AI assistant to read your budgets, accounts, categories, payees, and transactions from YNAB after you sign in with your own YNAB account.

## What You Need

- a YNAB account
- the hosted MCP URL: `https://ynab-mcp-server.smirnov-labs.workers.dev/mcp`
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
- You need this hosted MCP URL: `https://ynab-mcp-server.smirnov-labs.workers.dev/mcp`.

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

- `Show me the balances of all my budget accounts.`
- `List my budget categories with available amounts.`
- `Find my most recent grocery transactions.`
- `What were my largest spending categories last month?`

## Set Up in Claude

These steps are for `claude.ai`.

As of March 25, 2026, Anthropic supports remote MCP connectors in the Connectors settings.

### Before you start

- You need a Claude plan that supports remote MCP connectors.
- You need this hosted MCP URL: `https://ynab-mcp-server.smirnov-labs.workers.dev/mcp`.
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

## Staging Deploys

Use a separate Worker environment for staging so connector and OAuth testing does not disturb production users.

1. Create a second KV namespace for staging:

```bash
wrangler kv namespace create OAUTH_KV --env staging
```

2. Copy the returned namespace ID into `wrangler.jsonc` under `env.staging.kv_namespaces`.

3. Set staging-only secrets:

```bash
wrangler secret put YNAB_OAUTH_CLIENT_ID --env staging
wrangler secret put YNAB_OAUTH_CLIENT_SECRET --env staging
wrangler secret put YNAB_OAUTH_SCOPE --env staging
```

4. Deploy staging:

```bash
npm run deploy:staging
```

That publishes a separate Worker named `ynab-mcp-server-staging` with its own `workers.dev` hostname and isolated KV-backed auth/session state.

Important:

- use a separate YNAB OAuth app for staging, because the callback URL is different
- keep staging on its own KV namespace so user tokens, defaults, and cache state do not mix with production

## Local Smoke Tests

To test resources without living in MCP Inspector:

```bash
npm run smoke:resources
node scripts/mcp-smoke-client.mjs read-resource 'ynab://budgets/default'
node scripts/mcp-smoke-client.mjs read-resource 'ynab://budgets/default/categories'
node scripts/mcp-smoke-client.mjs read-resource 'ynab://budgets/default/month/current'
```

The smoke client persists its OAuth session in `data/mcp-smoke-auth.json`.

## Privacy

This service uses OAuth to connect to your YNAB account. It does not ask for your YNAB password directly.

Read the privacy policy here:

- [PRIVACY.md](./PRIVACY.md)

## For Self-Hosting or Operators

If you are trying to deploy or host this service yourself, use [CONTRIBUTING.md](./CONTRIBUTING.md).
This README is intentionally written for end users connecting the hosted service in ChatGPT or Claude.
