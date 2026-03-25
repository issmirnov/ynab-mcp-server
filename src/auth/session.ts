import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { OAuthStatePayload } from "./types.js";

const STATE_COOKIE = "__Host-YNAB_MCP_STATE";

export async function createOAuthState(
  oauthReqInfo: AuthRequest,
  codeVerifier: string,
  kv: KVNamespace,
  ttlSeconds = 600
) {
  const stateToken = crypto.randomUUID();
  const payload: OAuthStatePayload = { oauthReqInfo, codeVerifier };

  await kv.put(`oauth:state:${stateToken}`, JSON.stringify(payload), {
    expirationTtl: ttlSeconds,
  });

  return { stateToken };
}

export async function bindStateToSession(stateToken: string) {
  const data = new TextEncoder().encode(stateToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return {
    setCookie: `${STATE_COOKIE}=${hashHex}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=600`,
  };
}

export async function validateOAuthState(request: Request, kv: KVNamespace) {
  const url = new URL(request.url);
  const stateToken = url.searchParams.get("state");

  if (!stateToken) {
    throw new Error("Missing OAuth state");
  }

  const rawPayload = await kv.get(`oauth:state:${stateToken}`);
  if (!rawPayload) {
    throw new Error("Invalid or expired OAuth state");
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const expectedHash = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (!expectedHash) {
    throw new Error("Missing session binding cookie");
  }

  const data = new TextEncoder().encode(stateToken);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const actualHash = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (actualHash !== expectedHash) {
    throw new Error("OAuth state does not match this browser session");
  }

  await kv.delete(`oauth:state:${stateToken}`);

  return {
    payload: JSON.parse(rawPayload) as OAuthStatePayload & { oauthReqInfo: AuthRequest },
    clearCookie: `${STATE_COOKIE}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`,
  };
}
