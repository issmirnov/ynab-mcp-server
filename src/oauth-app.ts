import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { deleteUserPreferences } from "./auth/preferences.js";
import { bindStateToSession, createOAuthState, validateOAuthState } from "./auth/session.js";
import {
  buildAuthorizeUrl,
  createPkcePair,
  deleteStoredToken,
  exchangeAuthorizationCode,
  fetchCurrentUser,
  saveStoredToken,
} from "./auth/ynab.js";
import type { AuthProps } from "./auth/types.js";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();
const CSRF_COOKIE = "__Host-YNAB_MCP_CSRF";
const APP_NAME = "MCP for YNAB";
const PRIVACY_LAST_UPDATED = "2026-03-25";
const AFFILIATION_NOTICE = "We are not affiliated, associated, or in any way officially connected with YNAB or any of its subsidiaries or affiliates. The official YNAB website can be found at https://www.ynab.com. The names YNAB and You Need A Budget, as well as related names, tradenames, marks, trademarks, emblems, and images are registered trademarks of YNAB.";
const UNSUPPORTED_NOTICE = "This app is not officially supported by YNAB in any way. Use it at your own risk.";

function escapeHtml(value: string | undefined) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeState(payload: unknown) {
  return btoa(JSON.stringify(payload));
}

function decodeState<T>(value: string): T {
  return JSON.parse(atob(value)) as T;
}

function createCsrfCookie() {
  const token = crypto.randomUUID();
  return {
    token,
    setCookie: `${CSRF_COOKIE}=${token}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
  };
}

function validateCsrf(request: Request, submittedToken: string | File | null) {
  if (typeof submittedToken !== "string" || !submittedToken) {
    throw new Error("Missing CSRF token");
  }

  const cookieToken = request.headers
    .get("Cookie")
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`))
    ?.slice(CSRF_COOKIE.length + 1);

  if (!cookieToken || cookieToken !== submittedToken) {
    throw new Error("Invalid CSRF token");
  }
}

function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`;
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function renderLayout(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        font-family: sans-serif;
        max-width: 48rem;
        margin: 3rem auto;
        padding: 0 1rem 3rem;
        line-height: 1.5;
        color: #111;
      }
      .card {
        border: 1px solid #ddd;
        border-radius: 12px;
        padding: 1.25rem;
        background: #fff;
      }
      .meta {
        color: #555;
        margin: 0.25rem 0;
      }
      .actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 1.25rem;
        flex-wrap: wrap;
      }
      button, .link-button {
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border: 1px solid #222;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }
      .primary {
        background: #111;
        color: #fff;
      }
      .secondary {
        background: #fff;
        color: #111;
      }
      code {
        background: #f5f5f5;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
      }
      footer {
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid #ddd;
        color: #444;
        font-size: 0.95rem;
      }
      ul {
        padding-left: 1.25rem;
      }
      a {
        color: #0b57d0;
      }
    </style>
  </head>
  <body>
    ${body}
    <footer>
      <p><a href="/privacy">Privacy Policy</a></p>
      <p>${escapeHtml(AFFILIATION_NOTICE)}</p>
    </footer>
  </body>
</html>`;
}

function redirectOAuthError(request: AuthRequest, error: string, description: string, headers?: HeadersInit) {
  const redirectUrl = new URL(request.redirectUri);
  redirectUrl.searchParams.set("error", error);
  redirectUrl.searchParams.set("error_description", description);
  if (request.state) {
    redirectUrl.searchParams.set("state", request.state);
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...(headers || {}),
      Location: redirectUrl.toString(),
    },
  });
}

function renderConsentPage(oauthReqInfo: AuthRequest, clientInfo: ClientInfo, csrfToken: string) {
  const encodedState = encodeState({ oauthReqInfo });
  return renderLayout(
    `${APP_NAME} Authorization`,
    `<div class="card">
      <p><strong>${escapeHtml(APP_NAME)}</strong></p>
      <h1>Authorize MCP client</h1>
      <p>This client is requesting access to your hosted MCP server for YNAB.</p>
      <p class="meta"><strong>Client:</strong> ${escapeHtml(clientInfo.clientName || clientInfo.clientId)}</p>
      <p class="meta"><strong>Client ID:</strong> <code>${escapeHtml(clientInfo.clientId)}</code></p>
      <p class="meta"><strong>Redirect URI:</strong> <code>${escapeHtml(oauthReqInfo.redirectUri)}</code></p>
      <p class="meta"><strong>Scopes:</strong> ${escapeHtml(oauthReqInfo.scope.join(", ") || "(none)")}</p>
      <p class="meta">Review the <a href="/privacy">Privacy Policy</a> before continuing.</p>
      <p class="meta"><strong>Unsupported app notice:</strong> ${escapeHtml(UNSUPPORTED_NOTICE)}</p>
      <form method="post" action="/authorize">
        <input type="hidden" name="state" value="${escapeHtml(encodedState)}" />
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />
        <p>
          <label>
            <input type="checkbox" name="unsupported_acknowledged" value="yes" required />
            I understand this app is not officially supported by YNAB.
          </label>
        </p>
        <div class="actions">
          <button class="primary" type="submit" name="decision" value="approve">Continue to YNAB</button>
          <button class="secondary" type="submit" name="decision" value="deny">Deny</button>
        </div>
      </form>
    </div>`
  );
}

function renderHomePage(request: Request) {
  const mcpUrl = new URL("/mcp", request.url).toString();

  return renderLayout(
    APP_NAME,
    `<div class="card">
      <p><strong>${escapeHtml(APP_NAME)}</strong></p>
      <h1>Hosted MCP connector for YNAB plans</h1>
      <p>This service connects supported MCP clients to a user’s YNAB account through OAuth.</p>
      <p class="meta"><strong>Unsupported app notice:</strong> ${escapeHtml(UNSUPPORTED_NOTICE)}</p>
      <p class="meta"><strong>MCP endpoint:</strong> <code>${escapeHtml(mcpUrl)}</code></p>
      <div class="actions">
        <a class="link-button primary" href="/privacy">Privacy Policy</a>
        <a class="link-button secondary" href="/delete">Delete my data</a>
      </div>
    </div>`
  );
}

function renderDeletePage(csrfToken: string) {
  return renderLayout(
    `${APP_NAME} Delete Data`,
    `<div class="card">
      <p><strong>${escapeHtml(APP_NAME)}</strong></p>
      <h1>Delete my data</h1>
      <p>This flow removes stored connector data for your YNAB account from this service.</p>
      <p class="meta">To protect your account, you will be asked to sign in with YNAB again so we can identify which connector data to delete.</p>
      <form method="post" action="/delete/start">
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />
        <div class="actions">
          <button class="primary" type="submit">Continue to YNAB</button>
        </div>
      </form>
    </div>`
  );
}

function renderDeleteResultPage(message: string) {
  return renderLayout(
    `${APP_NAME} Delete Complete`,
    `<div class="card">
      <p><strong>${escapeHtml(APP_NAME)}</strong></p>
      <h1>Delete complete</h1>
      <p>${escapeHtml(message)}</p>
      <p class="meta">If you also added this MCP server in an AI client, remove the connector there to stop future use from that client.</p>
      <div class="actions">
        <a class="link-button primary" href="/">Return home</a>
      </div>
    </div>`
  );
}

async function revokeAllUserGrants(oauthProvider: OAuthHelpers, userId: string) {
  let cursor: string | undefined;
  do {
    const grants = await oauthProvider.listUserGrants(userId, { cursor, limit: 100 });
    for (const grant of grants.items) {
      await oauthProvider.revokeGrant(grant.id, userId);
    }
    cursor = grants.cursor;
  } while (cursor);
}

function renderPrivacyPage() {
  return renderLayout(
    `${APP_NAME} Privacy Policy`,
    `<div class="card">
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> ${escapeHtml(PRIVACY_LAST_UPDATED)}</p>
      <h2>Overview</h2>
      <p>This service provides a hosted Model Context Protocol (MCP) server for YNAB. It lets a user connect their own YNAB account to supported MCP clients such as ChatGPT and Claude through OAuth.</p>
      <h2>Data We Access</h2>
      <p>When you authorize this service with YNAB, we may access the plan data your YNAB account permits through the granted OAuth scope. Depending on the scope and features used, that can include:</p>
      <ul>
        <li>plan metadata</li>
        <li>accounts</li>
        <li>categories</li>
        <li>transactions</li>
        <li>monthly plan information</li>
        <li>other related YNAB planning data needed to fulfill MCP tool requests</li>
      </ul>
      <h2>How We Use Data</h2>
      <p>We use YNAB user data only to authenticate your connection to the service, fulfill MCP tool requests you initiate through your connected client, refresh OAuth access when needed using your YNAB refresh token, and operate, debug, and secure the hosted MCP service.</p>
      <p>We do not sell YNAB user data.</p>
      <h2>Data Storage</h2>
      <p>This service runs on an ephemeral Cloudflare Worker. It does not maintain or operate a separate long-term application database of your YNAB plan contents, and it is not designed to retain your YNAB plan data as a stored dataset. Plan data is accessed from YNAB only as needed to fulfill the tool request you initiate through your MCP client.</p>
      <p>The service does store the minimum OAuth-related data needed to operate, including YNAB OAuth access tokens, refresh tokens, token expiry metadata, and limited OAuth grant or session state needed to complete authentication. This data is stored in Cloudflare-hosted infrastructure used by the service, including Workers KV and related OAuth state handling.</p>
      <h2>Data Retention</h2>
      <p>Stored OAuth credentials and related operational metadata are retained only as long as needed to keep your connector working. Plan data fetched from YNAB to answer a request is not intentionally retained as an application dataset after the request is completed. If you remove the connector connection or revoke the YNAB OAuth grant, associated stored OAuth credentials should no longer be needed and should be removed in the normal course of operation.</p>
      <h2>Data Sharing</h2>
      <p>We do not share your YNAB user data with third parties except with infrastructure providers required to operate the service, when required by law, or when necessary to protect the security, integrity, or operation of the service.</p>
      <h2>Security</h2>
      <p>We use OAuth-based delegated access rather than asking for your YNAB password. Secrets are intended to be stored as deployment secrets, not in source control. No system can guarantee absolute security, but reasonable technical measures are used to reduce unauthorized access risk.</p>
      <h2>Your Choices</h2>
      <p>You can stop using the service at any time by removing the connection in your AI client's settings for custom connectors or connected apps, or by revoking the YNAB OAuth grant associated with this service.</p>
      <p>You have full control to disconnect this MCP server at any time. If you remove the connector from the AI client where you added it, that ends future access through this integration from that client. You may also revoke the YNAB OAuth grant for this service at any time.</p>
      <h2>Contact</h2>
      <p>For questions about this privacy policy, requests related to stored OAuth credentials, or the handling of YNAB user data, contact <a href="mailto:ivan@smirnovlabs.com">ivan@smirnovlabs.com</a>.</p>
    </div>`
  );
}

app.get("/", (c) => c.html(renderHomePage(c.req.raw)));
app.get("/privacy", (c) => c.html(renderPrivacyPage()));
app.get("/delete", (c) => {
  const { token, setCookie } = createCsrfCookie();
  return new Response(renderDeletePage(token), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": setCookie,
    },
  });
});

app.post("/delete/start", async (c) => {
  const formData = await c.req.raw.formData();

  try {
    validateCsrf(c.req.raw, formData.get("csrf_token"));
  } catch (error) {
    return c.text(error instanceof Error ? error.message : "Invalid delete request", 400);
  }

  const csrfClearCookie = clearCsrfCookie();
  const pkce = createPkcePair();
  const codeChallenge = await pkce.createCodeChallenge();
  const { stateToken } = await createOAuthState(
    {
      flow: "delete",
      codeVerifier: pkce.codeVerifier,
    },
    c.env.OAUTH_KV
  );
  const { setCookie } = await bindStateToSession(stateToken);

  const headers = new Headers();
  headers.append("Set-Cookie", csrfClearCookie);
  headers.append("Set-Cookie", setCookie);
  headers.set("Location", await buildAuthorizeUrl(c.req.raw, c.env, stateToken, codeChallenge));

  return new Response(null, {
    status: 302,
    headers,
  });
});

app.post("/delete", async (c) => {
  const accessToken = getBearerToken(c.req.raw);
  if (!accessToken) {
    return c.json(
      {
        error: "missing_bearer_token",
        message: "Provide the current connector access token using Authorization: Bearer <token>.",
      },
      401
    );
  }

  const tokenSummary = await c.env.OAUTH_PROVIDER.unwrapToken<AuthProps>(accessToken);
  if (!tokenSummary) {
    return c.json(
      {
        error: "invalid_token",
        message: "The provided bearer token is invalid or expired.",
      },
      401
    );
  }

  const ynabUserId = tokenSummary.grant.props?.ynabUserId;
  if (!ynabUserId) {
    return c.json(
      {
        error: "missing_user_context",
        message: "The provided token does not include the YNAB user context required for deletion.",
      },
      400
    );
  }

  await revokeAllUserGrants(c.env.OAUTH_PROVIDER, tokenSummary.userId);

  await deleteStoredToken(c.env.OAUTH_KV, ynabUserId);
  await deleteUserPreferences(c.env.OAUTH_KV, ynabUserId);

  return c.json({
    ok: true,
    message:
      "Connector data cleared. OAuth grants were revoked and stored connector state for this YNAB user was deleted.",
  });
});

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo) {
    return c.text("Unknown OAuth client", 400);
  }
  const { token, setCookie } = createCsrfCookie();
  return new Response(renderConsentPage(oauthReqInfo, clientInfo, token), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": setCookie,
    },
  });
});

app.post("/authorize", async (c) => {
  const formData = await c.req.raw.formData();

  try {
    validateCsrf(c.req.raw, formData.get("csrf_token"));
  } catch (error) {
    return c.text(error instanceof Error ? error.message : "Invalid consent request", 400);
  }

  const encodedState = formData.get("state");
  if (typeof encodedState !== "string" || !encodedState) {
    return c.text("Missing authorization request state", 400);
  }

  const { oauthReqInfo } = decodeState<{ oauthReqInfo: AuthRequest }>(encodedState);
  const csrfClearCookie = clearCsrfCookie();

  if (formData.get("decision") !== "approve") {
    return redirectOAuthError(oauthReqInfo, "access_denied", "The user denied this MCP client authorization request.", {
      "Set-Cookie": csrfClearCookie,
    });
  }

  if (formData.get("unsupported_acknowledged") !== "yes") {
    return c.text("You must acknowledge the unsupported app notice before continuing.", 400, {
      "Set-Cookie": csrfClearCookie,
    });
  }

  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo) {
    return c.text("Unknown OAuth client", 400);
  }
  if (!clientInfo.redirectUris.includes(oauthReqInfo.redirectUri)) {
    return c.text("OAuth client redirect URI is not registered", 400);
  }

  const pkce = createPkcePair();
  const codeChallenge = await pkce.createCodeChallenge();
  const { stateToken } = await createOAuthState(
    {
      flow: "grant",
      oauthReqInfo,
      codeVerifier: pkce.codeVerifier,
    },
    c.env.OAUTH_KV
  );
  const { setCookie } = await bindStateToSession(stateToken);

  const headers = new Headers();
  headers.append("Set-Cookie", csrfClearCookie);
  headers.append("Set-Cookie", setCookie);
  headers.set("Location", await buildAuthorizeUrl(c.req.raw, c.env, stateToken, codeChallenge));

  return new Response(null, {
    status: 302,
    headers,
  });
});

app.get("/callback", async (c) => {
  let flow: "grant" | "delete";
  let oauthReqInfo: AuthRequest | undefined;
  let codeVerifier: string;
  let clearCookie: string;

  try {
    const validated = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    flow = validated.payload.flow;
    if (validated.payload.flow === "grant") {
      oauthReqInfo = validated.payload.oauthReqInfo as AuthRequest;
    }
    codeVerifier = validated.payload.codeVerifier;
    clearCookie = validated.clearCookie;
  } catch (error) {
    return c.text(error instanceof Error ? error.message : "Invalid OAuth callback", 400);
  }

  const code = c.req.query("code");
  const oauthError = c.req.query("error");
  const oauthErrorDescription = c.req.query("error_description");

  if (oauthError) {
    if (flow === "delete") {
      return c.html(renderDeleteResultPage(oauthErrorDescription || "YNAB authorization was not completed. No connector data was deleted."), 400, {
        "Set-Cookie": clearCookie,
      });
    }

    return redirectOAuthError(
      oauthReqInfo!,
      oauthError,
      oauthErrorDescription || "Upstream YNAB authorization failed.",
      { "Set-Cookie": clearCookie }
    );
  }

  if (!code) {
    if (flow === "delete") {
      return c.html(renderDeleteResultPage("Missing YNAB authorization code. No connector data was deleted."), 400, {
        "Set-Cookie": clearCookie,
      });
    }

    return redirectOAuthError(
      oauthReqInfo!,
      "invalid_request",
      "Missing YNAB authorization code.",
      { "Set-Cookie": clearCookie }
    );
  }

  try {
    const token = await exchangeAuthorizationCode(c.env, c.req.raw, code, codeVerifier);
    const user = await fetchCurrentUser(token.accessToken);

    if (flow === "delete") {
      await revokeAllUserGrants(c.env.OAUTH_PROVIDER, user.id);
      await deleteStoredToken(c.env.OAUTH_KV, user.id);
      await deleteUserPreferences(c.env.OAUTH_KV, user.id);

      return c.html(
        renderDeleteResultPage("Stored connector data for your YNAB account has been deleted."),
        200,
        {
          "Set-Cookie": clearCookie,
        }
      );
    }

    const grantRequest = oauthReqInfo!;
    await saveStoredToken(c.env.OAUTH_KV, user.id, token);

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: grantRequest,
      userId: user.id,
      scope: grantRequest.scope,
      metadata: {
        label: `YNAB ${user.id.slice(0, 8)}`,
      },
      props: {
        ynabUserId: user.id,
      } satisfies AuthProps,
    });

    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": clearCookie,
        Location: redirectTo,
      },
    });
  } catch (error) {
    if (flow === "delete") {
      return c.html(renderDeleteResultPage(error instanceof Error ? error.message : "YNAB OAuth failed"), 500, {
        "Set-Cookie": clearCookie,
      });
    }

    return redirectOAuthError(
      oauthReqInfo!,
      "server_error",
      error instanceof Error ? error.message : "YNAB OAuth failed",
      { "Set-Cookie": clearCookie }
    );
  }
});

export default app;
