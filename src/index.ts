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
import HandleOverspendingTool from "./tools/HandleOverspendingTool.js";
import AutoDistributeFundsTool from "./tools/AutoDistributeFundsTool.js";
import BulkApproveTransactionsTool from "./tools/BulkApproveTransactionsTool.js";
import MoveFundsBetweenCategoriesTool from "./tools/MoveFundsBetweenCategoriesTool.js";
import NetWorthAnalysisTool from "./tools/NetWorthAnalysisTool.js";
import AnalyzeSpendingPatternsTool from "./tools/AnalyzeSpendingPatternsTool.js";
import GoalProgressReportTool from "./tools/GoalProgressReportTool.js";
import CashFlowForecastTool from "./tools/CashFlowForecastTool.js";
import CategoryPerformanceReviewTool from "./tools/CategoryPerformanceReviewTool.js";
import SetCategoryGoalsTool from "./tools/SetCategoryGoalsTool.js";
import BudgetFromHistoryTool from "./tools/BudgetFromHistoryTool.js";

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
const handleOverspendingTool = new HandleOverspendingTool();
const autoDistributeFundsTool = new AutoDistributeFundsTool();
const bulkApproveTransactionsTool = new BulkApproveTransactionsTool();
const moveFundsBetweenCategoriesTool = new MoveFundsBetweenCategoriesTool();
const netWorthAnalysisTool = new NetWorthAnalysisTool();
const analyzeSpendingPatternsTool = new AnalyzeSpendingPatternsTool();
const goalProgressReportTool = new GoalProgressReportTool();
const cashFlowForecastTool = new CashFlowForecastTool();
const categoryPerformanceReviewTool = new CategoryPerformanceReviewTool();
const setCategoryGoalsTool = new SetCategoryGoalsTool();
const budgetFromHistoryTool = new BudgetFromHistoryTool();

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      listBudgetsTool.getToolDefinition(),
      budgetSummaryTool.getToolDefinition(),
      createTransactionTool.getToolDefinition(),
      getUnapprovedTransactionsTool.getToolDefinition(),
      approveTransactionTool.getToolDefinition(),
      handleOverspendingTool.getToolDefinition(),
      autoDistributeFundsTool.getToolDefinition(),
      bulkApproveTransactionsTool.getToolDefinition(),
      moveFundsBetweenCategoriesTool.getToolDefinition(),
      netWorthAnalysisTool.getToolDefinition(),
      analyzeSpendingPatternsTool.getToolDefinition(),
      goalProgressReportTool.getToolDefinition(),
      cashFlowForecastTool.getToolDefinition(),
      categoryPerformanceReviewTool.getToolDefinition(),
      setCategoryGoalsTool.getToolDefinition(),
      budgetFromHistoryTool.getToolDefinition(),
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
      case "handle_overspending":
        return await handleOverspendingTool.execute(args as any);
      case "auto_distribute_funds":
        return await autoDistributeFundsTool.execute(args as any);
      case "bulk_approve_transactions":
        return await bulkApproveTransactionsTool.execute(args as any);
      case "move_funds_between_categories":
        return await moveFundsBetweenCategoriesTool.execute(args as any);
      case "net_worth_analysis":
        return await netWorthAnalysisTool.execute(args as any);
      case "analyze_spending_patterns":
        return await analyzeSpendingPatternsTool.execute(args as any);
      case "goal_progress_report":
        return await goalProgressReportTool.execute(args as any);
      case "cash_flow_forecast":
        return await cashFlowForecastTool.execute(args as any);
      case "category_performance_review":
        return await categoryPerformanceReviewTool.execute(args as any);
      case "set_category_goals":
        return await setCategoryGoalsTool.execute(args as any);
      case "budget_from_history":
        return await budgetFromHistoryTool.execute(args as any);
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
