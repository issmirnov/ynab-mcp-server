import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindStateToSession, createOAuthState, validateOAuthState } from "../src/auth/session.js";
import type { OAuthStatePayload } from "../src/auth/types.js";

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

describe("auth/session", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("stores OAuth state in KV with the configured TTL", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("state-token");
    const { kv, storage } = createKvMock();
    const payload: OAuthStatePayload = {
      flow: "grant",
      oauthReqInfo: { clientId: "client-123" },
      codeVerifier: "verifier-123",
    };

    const result = await createOAuthState(payload, kv, 123);

    expect(result).toEqual({ stateToken: "state-token" });
    expect(storage.get("oauth:state:state-token")).toBe(JSON.stringify(payload));
  });

  it("binds the state token to a hashed session cookie", async () => {
    const { setCookie } = await bindStateToSession("state-token");

    expect(setCookie).toContain("__Host-YNAB_MCP_STATE=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).not.toContain("state-token");
  });

  it("validates the state token, returns the stored payload, and deletes it", async () => {
    const { kv, storage } = createKvMock();
    const payload: OAuthStatePayload = {
      flow: "grant",
      oauthReqInfo: { clientId: "client-123", redirectUri: "https://example.com/callback" },
      codeVerifier: "verifier-123",
    };

    storage.set("oauth:state:state-token", JSON.stringify(payload));

    const { setCookie } = await bindStateToSession("state-token");
    const cookieHeader = setCookie.split(";")[0];
    const request = new Request("https://example.com/callback?state=state-token", {
      headers: {
        Cookie: cookieHeader,
      },
    });

    const result = await validateOAuthState(request, kv);

    expect(result.payload).toEqual(payload);
    expect(result.clearCookie).toContain("Max-Age=0");
    expect(storage.has("oauth:state:state-token")).toBe(false);
  });

  it("rejects validation when the session binding cookie is missing", async () => {
    const { kv, storage } = createKvMock();
    storage.set(
      "oauth:state:state-token",
      JSON.stringify({ flow: "delete", codeVerifier: "verifier-123" } satisfies OAuthStatePayload)
    );

    const request = new Request("https://example.com/callback?state=state-token");

    await expect(validateOAuthState(request, kv)).rejects.toThrow("Missing session binding cookie");
  });

  it("rejects validation when the cookie hash does not match the state token", async () => {
    const { kv, storage } = createKvMock();
    storage.set(
      "oauth:state:state-token",
      JSON.stringify({ flow: "delete", codeVerifier: "verifier-123" } satisfies OAuthStatePayload)
    );

    const request = new Request("https://example.com/callback?state=state-token", {
      headers: {
        Cookie: "__Host-YNAB_MCP_STATE=not-the-right-hash",
      },
    });

    await expect(validateOAuthState(request, kv)).rejects.toThrow("OAuth state does not match this browser session");
  });
});
