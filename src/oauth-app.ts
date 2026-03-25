import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import { bindStateToSession, createOAuthState, validateOAuthState } from "./auth/session.js";
import { buildAuthorizeUrl, createPkcePair, exchangeAuthorizationCode, fetchCurrentUser, saveStoredToken } from "./auth/ynab.js";
import type { AuthProps } from "./auth/types.js";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/", (c) => c.text("YNAB MCP remote server"));

app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  const pkce = createPkcePair();
  const codeChallenge = await pkce.createCodeChallenge();
  const { stateToken } = await createOAuthState(oauthReqInfo, pkce.codeVerifier, c.env.OAUTH_KV);
  const { setCookie } = await bindStateToSession(stateToken);

  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": setCookie,
      Location: await buildAuthorizeUrl(c.req.raw, c.env, stateToken, codeChallenge),
    },
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
  if (!code) {
    return c.text("Missing YNAB authorization code", 400);
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
    return c.text(error instanceof Error ? error.message : "YNAB OAuth failed", 500);
  }
});

export default app;
