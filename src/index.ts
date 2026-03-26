import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import type { AuthProps } from "./auth/types.js";
import { registerYnabResources } from "./resources/registerResources.js";
import { registerYnabTools } from "./mcp/registerTools.js";
import app from "./oauth-app.js";

export class YnabMCP extends McpAgent<Env, Record<string, never>, AuthProps> {
  server = new McpServer({
    name: "ynab-mcp-server",
    version: "2.0.0",
  });

  async init() {
    if (!this.props) {
      throw new Error("Missing authenticated user context");
    }

    registerYnabResources(this.server, this.env, this.props);
    registerYnabTools(this.server, this.env, this.props);
  }
}

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: YnabMCP.serve("/mcp"),
  defaultHandler: app,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
