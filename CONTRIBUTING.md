# Contributing

This document is for contributors, operators, and anyone self-hosting `ynab-mcp-server`.

The main [README.md](/home/vania/Projects/3.third_party/ynab-mcp-server.4/README.md) is intentionally written for end users connecting the hosted service in ChatGPT or Claude.

## Project Overview

This codebase provides:

- remote MCP on Cloudflare Workers at `/mcp`
- MCP client OAuth via `@cloudflare/workers-oauth-provider`
- upstream YNAB OAuth using the authorization code flow
- per-user token storage in Cloudflare KV
- YNAB tools mounted behind request-scoped auth

## Architecture

- `src/index.ts`: Worker entrypoint, MCP Durable Object, OAuth provider wiring
- `src/oauth-app.ts`: consent, callback, privacy, and account-management routes
- `src/auth/ynab.ts`: YNAB OAuth exchange and refresh logic
- `src/mcp/registerTools.ts`: remote MCP tool registration
- `src/tools/`: YNAB tool implementations executed with request-scoped auth

## Local Development

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

## Cloudflare Deployment

### Requirements

- a Cloudflare account
- a YNAB OAuth application
- one Cloudflare KV namespace bound as `OAUTH_KV`
- a deployed Worker with a Durable Object binding for `YnabMCP`

### Setup

1. Create the KV namespace:

```bash
wrangler kv namespace create OAUTH_KV
```

Copy the namespace ID into `wrangler.jsonc`.

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

## Connector Behavior

1. ChatGPT or Claude connects to `/mcp`.
2. This server starts the MCP OAuth flow.
3. The user is redirected to YNAB OAuth.
4. YNAB returns an auth code to `/callback`.
5. The server stores the user's YNAB access and refresh tokens.
6. Future tool calls run with that user's refreshed YNAB token.

## Important Deployment Notes

- New YNAB OAuth apps start in Restricted Mode with a 25-user cap until YNAB approves the app.
- YNAB access tokens expire after 2 hours; this server refreshes them using the stored refresh token.
- Use a branded production hostname. Avoid exposing raw infrastructure naming in the public connector URL.

## YNAB Approval Checklist

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
