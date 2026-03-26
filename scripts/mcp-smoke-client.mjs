#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer } from "node:http";
import { exec } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";

const DEFAULT_SERVER_URL = "https://ynab-mcp-server-staging.smirnov-labs.workers.dev/mcp";
const CALLBACK_PORT = 8789;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;
const AUTH_STATE_PATH = resolve("data/mcp-smoke-auth.json");

function readState() {
  if (!existsSync(AUTH_STATE_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8"));
}

function writeState(state) {
  mkdirSync(dirname(AUTH_STATE_PATH), { recursive: true });
  writeFileSync(AUTH_STATE_PATH, JSON.stringify(state, null, 2));
}

class FileOAuthProvider {
  constructor(redirectUrl, clientMetadata, onRedirect) {
    this._redirectUrl = redirectUrl;
    this._clientMetadata = clientMetadata;
    this._onRedirect = onRedirect;
  }

  get redirectUrl() {
    return this._redirectUrl;
  }

  get clientMetadata() {
    return this._clientMetadata;
  }

  clientInformation() {
    return readState().clientInformation;
  }

  saveClientInformation(clientInformation) {
    const state = readState();
    writeState({ ...state, clientInformation });
  }

  tokens() {
    return readState().tokens;
  }

  saveTokens(tokens) {
    const state = readState();
    writeState({ ...state, tokens });
  }

  redirectToAuthorization(authorizationUrl) {
    this._onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier) {
    const state = readState();
    writeState({ ...state, codeVerifier });
  }

  codeVerifier() {
    const state = readState();
    if (!state.codeVerifier) {
      throw new Error("No code verifier saved");
    }

    return state.codeVerifier;
  }

  invalidateCredentials(scope) {
    const state = readState();
    if (scope === "all") {
      writeState({});
      return;
    }

    if (scope === "client") {
      delete state.clientInformation;
    }

    if (scope === "tokens") {
      delete state.tokens;
    }

    if (scope === "verifier") {
      delete state.codeVerifier;
    }

    writeState(state);
  }
}

function openBrowser(url) {
  const command = process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, (error) => {
    if (error) {
      console.error(`Failed to open browser automatically. Open this URL manually:\n${url}`);
    }
  });
}

function waitForOAuthCallback() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || "", "http://localhost");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Authorization complete.</h1><p>You can close this tab.</p>");
        resolve(code);
        setTimeout(() => server.close(), 100);
        return;
      }

      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`<h1>Authorization failed.</h1><p>${error || "Missing authorization code"}</p>`);
      reject(new Error(error || "Missing authorization code"));
      setTimeout(() => server.close(), 100);
    });

    server.listen(CALLBACK_PORT);
  });
}

async function connectClient(serverUrl) {
  const provider = new FileOAuthProvider(
    CALLBACK_URL,
    {
      client_name: "YNAB MCP Smoke Client",
      redirect_uris: [CALLBACK_URL],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    (authorizationUrl) => {
      console.log(`Authorize in browser:\n${authorizationUrl.toString()}\n`);
      openBrowser(authorizationUrl.toString());
    }
  );

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    authProvider: provider,
  });
  const client = new Client(
    {
      name: "ynab-mcp-smoke-client",
      version: "1.0.0",
    },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    return { client, transport };
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }

    const code = await waitForOAuthCallback();
    await transport.finishAuth(code);
    await transport.close();

    const authenticatedTransport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      authProvider: provider,
    });

    await client.connect(authenticatedTransport);
    return { client, transport: authenticatedTransport };
  }
}

async function main() {
  const [, , command, arg, providedServerUrl] = process.argv;
  const serverUrl = providedServerUrl || process.env.MCP_SERVER_URL || DEFAULT_SERVER_URL;

  if (!command || ["list-resources", "read-resource", "clear-auth"].includes(command) === false) {
    console.error(
      "Usage:\n  node scripts/mcp-smoke-client.mjs list-resources [serverUrl]\n  node scripts/mcp-smoke-client.mjs read-resource <uri> [serverUrl]\n  node scripts/mcp-smoke-client.mjs clear-auth"
    );
    process.exit(1);
  }

  if (command === "clear-auth") {
    writeState({});
    console.log(`Cleared ${AUTH_STATE_PATH}`);
    return;
  }

  const { client, transport } = await connectClient(serverUrl);

  try {
    if (command === "list-resources") {
      const result = await client.listResources();
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!arg) {
      throw new Error("read-resource requires a resource URI");
    }

    const result = await client.readResource({ uri: arg });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await transport.close();
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
