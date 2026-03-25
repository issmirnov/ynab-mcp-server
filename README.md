# ynab-mcp-server

Hosted YNAB MCP server for ChatGPT and Claude connectors, built for Cloudflare Workers and per-user OAuth.

## What changed

This repo now targets:

- Remote MCP on Cloudflare Workers at `/mcp`
- MCP client OAuth via `@cloudflare/workers-oauth-provider`
- Upstream YNAB OAuth using the authorization code flow
- Per-user YNAB token storage in Cloudflare KV
- The existing 18 YNAB tools mounted behind request-scoped auth

This is no longer a local `stdio` package-first project.

## Architecture

- `src/index.ts`: Worker entrypoint, MCP Durable Object, OAuth provider wiring
- `src/oauth-app.ts`: `/authorize` and `/callback` routes
- `src/auth/ynab.ts`: YNAB OAuth exchange and refresh logic
- `src/mcp/registerTools.ts`: Registers the YNAB tool set on the remote MCP server
- `src/tools/`: Existing YNAB tool implementations, refactored for request-scoped auth

## Local development

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

The local MCP endpoint will be:

```text
http://localhost:8788/mcp
```

## Cloudflare deployment

You need:

- A Cloudflare account
- A YNAB OAuth application
- One Cloudflare KV namespace bound as `OAUTH_KV`
- A deployed Worker with a Durable Object binding for `YnabMCP`

### 1. Create the KV namespace

```bash
wrangler kv namespace create OAUTH_KV
```

Then copy the namespace ID into `wrangler.jsonc`.

### 2. Create the YNAB OAuth app

In YNAB Developer Settings, create a new OAuth application and configure:

- Homepage URL: `https://<your-worker-domain>`
- Redirect URL: `https://<your-worker-domain>/callback`

You will need:

- `YNAB_OAUTH_CLIENT_ID`
- `YNAB_OAUTH_CLIENT_SECRET`

Optional:

- `YNAB_OAUTH_SCOPE=read-only` if you want a read-only deployment. Leave unset for full tool access.

### 3. Set Worker secrets

```bash
wrangler secret put YNAB_OAUTH_CLIENT_ID
wrangler secret put YNAB_OAUTH_CLIENT_SECRET
wrangler secret put YNAB_OAUTH_SCOPE
```

### 4. Deploy

```bash
npm run deploy
```

Your remote MCP URL will be:

```text
https://<your-worker-domain>/mcp
```

## Connector behavior

The intended flow is:

1. ChatGPT or Claude connects to `/mcp`
2. The MCP client is redirected through this Worker’s OAuth flow
3. The Worker redirects the user to YNAB OAuth
4. YNAB returns an auth code to `/callback`
5. The Worker stores the user’s YNAB access/refresh tokens in KV
6. Tool calls run with that user’s refreshed YNAB token

## Important deployment notes

- New YNAB OAuth apps start in Restricted Mode with a 25-user cap until YNAB approves the app.
- YNAB access tokens expire after 2 hours; this Worker refreshes them with the stored refresh token.
- If you want public multi-user deployment, you still need a privacy policy and the rest of the YNAB OAuth review requirements before asking YNAB to lift Restricted Mode.

## Scripts

```bash
npm run dev
npm run type-check
npm run cf-typegen
npm run deploy
```
