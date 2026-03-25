import type { StoredYnabToken } from "./types.js";

const YNAB_AUTHORIZE_URL = "https://app.ynab.com/oauth/authorize";
const YNAB_TOKEN_URL = "https://app.ynab.com/oauth/token";
const YNAB_API_URL = "https://api.ynab.com/v1";

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createPkcePair() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = base64UrlEncode(verifierBytes);

  return {
    codeVerifier,
    async createCodeChallenge() {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
      return base64UrlEncode(new Uint8Array(digest));
    },
  };
}

export async function buildAuthorizeUrl(request: Request, env: Env, state: string, codeChallenge: string) {
  const url = new URL(YNAB_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.YNAB_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", new URL("/callback", request.url).href);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  if (env.YNAB_OAUTH_SCOPE) {
    url.searchParams.set("scope", env.YNAB_OAUTH_SCOPE);
  }

  return url.toString();
}

async function exchangeToken(body: URLSearchParams) {
  const response = await fetch(YNAB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`YNAB OAuth token exchange failed: ${await response.text()}`);
  }

  const token = await response.json<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  }>();

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    scope: token.scope,
  } satisfies StoredYnabToken;
}

export async function exchangeAuthorizationCode(
  env: Env,
  request: Request,
  code: string,
  codeVerifier: string
) {
  return exchangeToken(
    new URLSearchParams({
      client_id: env.YNAB_OAUTH_CLIENT_ID,
      client_secret: env.YNAB_OAUTH_CLIENT_SECRET,
      redirect_uri: new URL("/callback", request.url).href,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    })
  );
}

export async function refreshStoredToken(env: Env, refreshToken: string) {
  return exchangeToken(
    new URLSearchParams({
      client_id: env.YNAB_OAUTH_CLIENT_ID,
      client_secret: env.YNAB_OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );
}

export async function fetchCurrentUser(accessToken: string) {
  const response = await fetch(`${YNAB_API_URL}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YNAB user: ${await response.text()}`);
  }

  const payload = await response.json<{ data: { user: { id: string } } }>();
  return payload.data.user;
}

export async function loadStoredToken(kv: KVNamespace, ynabUserId: string) {
  const raw = await kv.get(`ynab:token:${ynabUserId}`);
  return raw ? (JSON.parse(raw) as StoredYnabToken) : null;
}

export async function saveStoredToken(kv: KVNamespace, ynabUserId: string, token: StoredYnabToken) {
  await kv.put(`ynab:token:${ynabUserId}`, JSON.stringify(token));
}

export async function deleteStoredToken(kv: KVNamespace, ynabUserId: string) {
  await kv.delete(`ynab:token:${ynabUserId}`);
}

export async function getValidAccessToken(env: Env, ynabUserId: string) {
  const storedToken = await loadStoredToken(env.OAUTH_KV, ynabUserId);
  if (!storedToken) {
    throw new Error("No YNAB token stored for this user");
  }

  if (storedToken.expiresAt > Date.now() + 60_000) {
    return storedToken.accessToken;
  }

  const refreshed = await refreshStoredToken(env, storedToken.refreshToken);
  await saveStoredToken(env.OAUTH_KV, ynabUserId, refreshed);
  return refreshed.accessToken;
}
