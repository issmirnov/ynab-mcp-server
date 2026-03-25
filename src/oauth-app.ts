import type { AuthRequest, ClientInfo, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { bindStateToSession, createOAuthState, validateOAuthState } from "./auth/session.js";
import { buildAuthorizeUrl, createPkcePair, exchangeAuthorizationCode, fetchCurrentUser, saveStoredToken } from "./auth/ynab.js";
import type { AuthProps } from "./auth/types.js";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();
const CSRF_COOKIE = "__Host-YNAB_MCP_CSRF";

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
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize YNAB MCP</title>
    <style>
      body { font-family: sans-serif; max-width: 44rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.25rem; }
      .meta { color: #555; margin: 0.25rem 0; }
      .actions { display: flex; gap: 0.75rem; margin-top: 1.25rem; }
      button { padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid #222; cursor: pointer; }
      .primary { background: #111; color: #fff; }
      .secondary { background: #fff; color: #111; }
      code { background: #f5f5f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorize MCP client</h1>
      <p>This client is requesting access to your hosted YNAB MCP server.</p>
      <p class="meta"><strong>Client:</strong> ${escapeHtml(clientInfo.clientName || clientInfo.clientId)}</p>
      <p class="meta"><strong>Client ID:</strong> <code>${escapeHtml(clientInfo.clientId)}</code></p>
      <p class="meta"><strong>Redirect URI:</strong> <code>${escapeHtml(oauthReqInfo.redirectUri)}</code></p>
      <p class="meta"><strong>Scopes:</strong> ${escapeHtml(oauthReqInfo.scope.join(", ") || "(none)")}</p>
      <form method="post" action="/authorize">
        <input type="hidden" name="state" value="${escapeHtml(encodedState)}" />
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />
        <div class="actions">
          <button class="primary" type="submit" name="decision" value="approve">Continue to YNAB</button>
          <button class="secondary" type="submit" name="decision" value="deny">Deny</button>
        </div>
      </form>
    </div>
  </body>
</html>`;
}

app.get("/", (c) => c.text("YNAB MCP remote server"));

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

  const clientInfo = await c.env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  if (!clientInfo) {
    return c.text("Unknown OAuth client", 400);
  }
  if (!clientInfo.redirectUris.includes(oauthReqInfo.redirectUri)) {
    return c.text("OAuth client redirect URI is not registered", 400);
  }

  const pkce = createPkcePair();
  const codeChallenge = await pkce.createCodeChallenge();
  const { stateToken } = await createOAuthState(oauthReqInfo, pkce.codeVerifier, c.env.OAUTH_KV);
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
  let oauthReqInfo: AuthRequest;
  let codeVerifier: string;
  let clearCookie: string;

  try {
    const validated = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
    oauthReqInfo = validated.payload.oauthReqInfo;
    codeVerifier = validated.payload.codeVerifier;
    clearCookie = validated.clearCookie;
  } catch (error) {
    return c.text(error instanceof Error ? error.message : "Invalid OAuth callback", 400);
  }

  const code = c.req.query("code");
  const oauthError = c.req.query("error");
  const oauthErrorDescription = c.req.query("error_description");

  if (oauthError) {
    return redirectOAuthError(
      oauthReqInfo,
      oauthError,
      oauthErrorDescription || "Upstream YNAB authorization failed.",
      { "Set-Cookie": clearCookie }
    );
  }

  if (!code) {
    return redirectOAuthError(
      oauthReqInfo,
      "invalid_request",
      "Missing YNAB authorization code.",
      { "Set-Cookie": clearCookie }
    );
  }

  try {
    const token = await exchangeAuthorizationCode(c.env, c.req.raw, code, codeVerifier);
    const user = await fetchCurrentUser(token.accessToken);
    await saveStoredToken(c.env.OAUTH_KV, user.id, token);

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: user.id,
      scope: oauthReqInfo.scope,
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
    return redirectOAuthError(
      oauthReqInfo,
      "server_error",
      error instanceof Error ? error.message : "YNAB OAuth failed",
      { "Set-Cookie": clearCookie }
    );
  }
});

export default app;
