import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as ynab from "ynab";

// Import all tools
import ListBudgetsTool from "./tools/ListBudgetsTool.js";
import BudgetSummaryTool from "./tools/BudgetSummaryTool.js";
import CreateTransactionTool from "./tools/CreateTransactionTool.js";
import GetUnapprovedTransactionsTool from "./tools/GetUnapprovedTransactionsTool.js";
import ApproveTransactionTool from "./tools/ApproveTransactionTool.js";

const server = new Server(
  {
    name: "ynab-mcp-server",
    version: "0.1.2",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Initialize tools
const listBudgetsTool = new ListBudgetsTool();
const budgetSummaryTool = new BudgetSummaryTool();
const createTransactionTool = new CreateTransactionTool();
const getUnapprovedTransactionsTool = new GetUnapprovedTransactionsTool();
const approveTransactionTool = new ApproveTransactionTool();

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      listBudgetsTool.getToolDefinition(),
      budgetSummaryTool.getToolDefinition(),
      createTransactionTool.getToolDefinition(),
      getUnapprovedTransactionsTool.getToolDefinition(),
      approveTransactionTool.getToolDefinition(),
    ],
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_budgets":
        return await listBudgetsTool.execute(args as any);
      case "budget_summary":
        return await budgetSummaryTool.execute(args as any);
      case "create_transaction":
        return await createTransactionTool.execute(args as any);
      case "get_unapproved_transactions":
        return await getUnapprovedTransactionsTool.execute(args as any);
      case "approve_transaction":
        return await approveTransactionTool.execute(args as any);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("YNAB MCP Server running on stdio");
}

// Handle shutdown
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
