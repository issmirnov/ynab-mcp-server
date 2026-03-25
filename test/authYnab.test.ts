import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  getValidAccessToken,
  saveStoredToken,
} from "../src/auth/ynab.js";

function createKvMock() {
  const storage = new Map<string, string>();

  return {
    storage,
    kv: {
      put: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      get: vi.fn(async (key: string) => storage.get(key) ?? null),
      delete: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    } as unknown as KVNamespace,
  };
}

describe("auth/ynab", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the upstream YNAB authorize URL with PKCE and scope", async () => {
    const request = new Request("https://worker.example/authorize");
    const env = {
      YNAB_OAUTH_CLIENT_ID: "client-id",
      YNAB_OAUTH_SCOPE: "read-only",
    } as Env;

    const url = new URL(await buildAuthorizeUrl(request, env, "state-token", "challenge-token"));

    expect(url.origin).toBe("https://app.ynab.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://worker.example/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-token");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("read-only");
  });

  it("exchanges an authorization code with the expected token request payload", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "read-only",
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      YNAB_OAUTH_CLIENT_ID: "client-id",
      YNAB_OAUTH_CLIENT_SECRET: "client-secret",
    } as Env;
    const request = new Request("https://worker.example/callback");

    const token = await exchangeAuthorizationCode(env, request, "auth-code", "verifier-token");

    expect(token.accessToken).toBe("access-token");
    expect(token.refreshToken).toBe("refresh-token");
    expect(token.scope).toBe("read-only");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.ynab.com/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const body = new URLSearchParams(init.body as string);
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
    expect(body.get("redirect_uri")).toBe("https://worker.example/callback");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier-token");
  });

  it("returns the stored access token when it is still fresh", async () => {
    const { kv } = createKvMock();
    await saveStoredToken(kv, "user-123", {
      accessToken: "fresh-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 5 * 60_000,
      scope: "read-only",
    });

    const env = { OAUTH_KV: kv } as Env;

    await expect(getValidAccessToken(env, "user-123")).resolves.toBe("fresh-token");
  });

  it("refreshes and persists the token when the stored access token is expired", async () => {
    const { kv, storage } = createKvMock();
    await saveStoredToken(kv, "user-123", {
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() - 1_000,
      scope: "read-only",
    });

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
          scope: "read-only",
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      OAUTH_KV: kv,
      YNAB_OAUTH_CLIENT_ID: "client-id",
      YNAB_OAUTH_CLIENT_SECRET: "client-secret",
    } as Env;

    await expect(getValidAccessToken(env, "user-123")).resolves.toBe("new-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const persisted = JSON.parse(storage.get("ynab:token:user-123") ?? "{}");
    expect(persisted.accessToken).toBe("new-access-token");
    expect(persisted.refreshToken).toBe("new-refresh-token");
  });

  it("throws when no stored token exists for the user", async () => {
    const { kv } = createKvMock();
    const env = { OAUTH_KV: kv } as Env;

    await expect(getValidAccessToken(env, "missing-user")).rejects.toThrow("No YNAB token stored for this user");
  });
});
