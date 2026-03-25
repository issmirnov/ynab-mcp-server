# ynab-mcp-server

Hosted YNAB MCP server for ChatGPT and Claude, built on Cloudflare Workers with per-user OAuth.

This repo is designed to power a branded hosted offering. The intended user experience is:

1. A user adds one HTTPS MCP URL in ChatGPT or Claude.
2. They sign in with YNAB.
3. The server stores their OAuth credentials and serves YNAB tools on future requests.

Most end users should never touch Wrangler, Cloudflare KV, or local infrastructure setup directly.

## Product shape

The best pattern to borrow from projects like `ha-mcp` is the onboarding flow, not the implementation details:

- lead with "add this URL to your AI client"
- keep provider infrastructure out of the main quick start
- make OAuth the visible setup step
- keep self-hosting and Cloudflare internals in a separate operator section

In practice, this repo should usually be presented behind a branded domain such as:

```text
https://mcp.example.com/mcp
```

## Add to ChatGPT

Use this flow when your hosted endpoint is already deployed.

Prerequisites:

- a reachable HTTPS MCP endpoint, for example `https://mcp.example.com/mcp`
- OAuth enabled on this server
- a ChatGPT plan that supports custom MCP connectors

As of March 25, 2026, OpenAI's documented flow is:

1. Enable developer mode for the relevant ChatGPT account or workspace.
2. In ChatGPT, create a new app/connector and provide the remote MCP endpoint plus required metadata.
3. Choose OAuth as the authentication mechanism.
4. Open a new chat and enable the draft app from the tools menu.
5. Complete the YNAB sign-in flow when ChatGPT redirects to this server.

For a productized hosted offering, the user-facing instructions should stay this simple:

1. Open ChatGPT.
2. Add the YNAB connector URL.
3. Click Connect.
4. Sign in with YNAB.
5. Start asking about budgets, accounts, transactions, and categories.

## Add to Claude

Use this flow when your hosted endpoint is already deployed.

Prerequisites:

- a reachable HTTPS MCP endpoint, for example `https://mcp.example.com/mcp`
- OAuth enabled on this server
- a Claude plan that supports remote MCP connectors

As of March 25, 2026, Anthropic's documented flow is:

- Claude Pro and Max: `Settings -> Connectors -> Add custom connector`
- Claude Team and Enterprise: an owner first adds the connector in `Organization settings -> Connectors`, then each user connects their own account

After that:

1. Paste the remote MCP server URL.
2. Optionally provide an OAuth client ID and secret if your deployment requires it.
3. Add the connector.
4. Click Connect and complete YNAB OAuth.
5. Enable the connector in a conversation from the `+` menu.

For a productized hosted offering, the user-facing instructions should stay this simple:

1. Open Claude.
2. Add the YNAB connector URL.
3. Click Connect.
4. Sign in with YNAB.
5. Start using the YNAB tools in chat.

## Recommended hosted onboarding

If we build a lightweight setup page for this service, it should act like a setup wizard without becoming a full product surface:

- Step 1: choose `ChatGPT` or `Claude`
- Step 2: show the exact MCP URL with a copy button
- Step 3: show the 3-5 client-specific steps
- Step 4: explain that the user will be redirected to YNAB OAuth
- Step 5: include links to privacy policy and support

That keeps the good part of the `ha-mcp` pattern: low-friction onboarding and client-specific guidance. It avoids copying their UX, install scripts, or demo-environment framing, which do not fit this hosted YNAB service.

## What this repo does

This codebase provides:

- remote MCP on Cloudflare Workers at `/mcp`
- MCP client OAuth via `@cloudflare/workers-oauth-provider`
- upstream YNAB OAuth using the authorization code flow
- per-user token storage in Cloudflare KV
- the existing YNAB tool set mounted behind request-scoped auth

## Architecture

- `src/index.ts`: Worker entrypoint, MCP Durable Object, OAuth provider wiring
- `src/oauth-app.ts`: consent, callback, privacy, and account-management routes
- `src/auth/ynab.ts`: YNAB OAuth exchange and refresh logic
- `src/mcp/registerTools.ts`: remote MCP tool registration
- `src/tools/`: YNAB tool implementations executed with request-scoped auth

## Connector behavior

The server flow is:

1. ChatGPT or Claude connects to `/mcp`.
2. This server starts the MCP OAuth flow.
3. The user is redirected to YNAB OAuth.
4. YNAB returns an auth code to `/callback`.
5. The server stores the user's YNAB access and refresh tokens.
6. Future tool calls run with that user's refreshed YNAB token.

## Operator deployment

This section is for whoever hosts the service, not for end users.

### Requirements

- a Cloudflare account
- a YNAB OAuth application
- one Cloudflare KV namespace bound as `OAUTH_KV`
- a deployed Worker with a Durable Object binding for `YnabMCP`

### Local development

1. Install dependencies:

```bash
npm install
```

2. Generate Worker types if needed:

```bash
npm run cf-typegen
```

3. Add local secrets with Wrangler or `.dev.vars`.

4. Start the Worker:

```bash
npm run dev
```

Local MCP endpoint:

```text
http://localhost:8788/mcp
```

### Cloudflare setup

1. Create the KV namespace:

```bash
wrangler kv namespace create OAUTH_KV
```

Then copy the namespace ID into `wrangler.jsonc`.

2. Create the YNAB OAuth app and configure:

- Homepage URL: `https://<your-domain>`
- Redirect URL: `https://<your-domain>/callback`

Required secrets:

- `YNAB_OAUTH_CLIENT_ID`
- `YNAB_OAUTH_CLIENT_SECRET`

Optional:

- `YNAB_OAUTH_SCOPE=read-only` for a read-only deployment

3. Set Worker secrets:

```bash
wrangler secret put YNAB_OAUTH_CLIENT_ID
wrangler secret put YNAB_OAUTH_CLIENT_SECRET
wrangler secret put YNAB_OAUTH_SCOPE
```

4. Deploy:

```bash
npm run deploy
```

Production MCP endpoint:

```text
https://<your-domain>/mcp
```

## Important deployment notes

- New YNAB OAuth apps start in Restricted Mode with a 25-user cap until YNAB approves the app.
- YNAB access tokens expire after 2 hours; this server refreshes them using the stored refresh token.
- Use a branded production hostname. Avoid exposing raw infrastructure naming in the public connector URL.

## YNAB approval checklist

- [x] Use OAuth authorization code flow with PKCE
- [x] Avoid collecting YNAB or financial account passwords directly
- [x] Publish a privacy policy and expose it in the app UI
- [x] Show the required non-affiliation footer in the app UI
- [ ] Set the privacy policy URL in the YNAB OAuth app configuration
- [ ] Confirm the production OAuth scope is the minimum necessary for the enabled tools
- [ ] Replace the generic support and deletion contact path with the production support channel before review

## Scripts

```bash
npm run dev
npm run type-check
npm run test
npm run cf-typegen
npm run deploy
```
