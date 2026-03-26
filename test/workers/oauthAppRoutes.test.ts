import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/index.js";

async function fetchWorker(input: string | Request, init?: RequestInit) {
  const request = typeof input === "string" ? new Request(input, init) : input;
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("worker public routes", () => {
  it("renders the homepage with privacy and deletion links", async () => {
    const response = await fetchWorker("https://example.com/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Hosted MCP connector for YNAB plans");
    expect(html).toContain("Install Instructions");
    expect(html).toContain("github.com/issmirnov/ynab-mcp-server#readme");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/delete"');
    expect(html).toContain("not officially supported by YNAB");
  });

  it("renders the privacy page with contact and disconnection guidance", async () => {
    const response = await fetchWorker("https://example.com/privacy");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("ivan@smirnovlabs.com");
    expect(html).toContain("removing the connection in your AI client");
  });

  it("renders the delete page and sets a CSRF cookie", async () => {
    const response = await fetchWorker("https://example.com/delete");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Delete my data");
    expect(response.headers.get("Set-Cookie")).toContain("__Host-YNAB_MCP_CSRF=");
  });

  it("rejects connector deletion requests without a bearer token", async () => {
    const response = await fetchWorker("https://example.com/delete", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "missing_bearer_token",
    });
  });
});
