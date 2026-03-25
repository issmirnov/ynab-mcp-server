import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import * as ynab from "ynab";
import AnalyzeSpendingPatternsTool from "../tools/AnalyzeSpendingPatternsTool.js";
import ApproveTransactionTool from "../tools/ApproveTransactionTool.js";
import AutoDistributeFundsTool from "../tools/AutoDistributeFundsTool.js";
import BudgetFromHistoryTool from "../tools/BudgetFromHistoryTool.js";
import BudgetSummaryTool from "../tools/BudgetSummaryTool.js";
import BulkApproveTransactionsTool from "../tools/BulkApproveTransactionsTool.js";
import CashFlowForecastTool from "../tools/CashFlowForecastTool.js";
import CategoryPerformanceReviewTool from "../tools/CategoryPerformanceReviewTool.js";
import CreateTransactionTool from "../tools/CreateTransactionTool.js";
import GetUnapprovedTransactionsTool from "../tools/GetUnapprovedTransactionsTool.js";
import GoalProgressReportTool from "../tools/GoalProgressReportTool.js";
import HandleOverspendingTool from "../tools/HandleOverspendingTool.js";
import ListBudgetsTool from "../tools/ListBudgetsTool.js";
import ListTransactionsTool from "../tools/ListTransactionsTool.js";
import MoveFundsBetweenCategoriesTool from "../tools/MoveFundsBetweenCategoriesTool.js";
import NetWorthAnalysisTool from "../tools/NetWorthAnalysisTool.js";
import ReconcileAccountTool from "../tools/ReconcileAccountTool.js";
import SetCategoryGoalsTool from "../tools/SetCategoryGoalsTool.js";
import type { ToolRuntimeConfig } from "../tools/runtime.js";
import { jsonSchemaObjectToZodShape } from "../utils/jsonSchemaToZod.js";
import { getValidAccessToken } from "../auth/ynab.js";
import type { AuthProps } from "../auth/types.js";

type ToolClass = new (config?: ToolRuntimeConfig) => {
  getToolDefinition(): Tool;
  execute(input: any): Promise<any>;
};

const TOOL_CLASSES: ToolClass[] = [
  ListBudgetsTool as unknown as ToolClass,
  BudgetSummaryTool as unknown as ToolClass,
  CreateTransactionTool as unknown as ToolClass,
  GetUnapprovedTransactionsTool as unknown as ToolClass,
  ApproveTransactionTool as unknown as ToolClass,
  HandleOverspendingTool as unknown as ToolClass,
  AutoDistributeFundsTool as unknown as ToolClass,
  BulkApproveTransactionsTool as unknown as ToolClass,
  MoveFundsBetweenCategoriesTool as unknown as ToolClass,
  NetWorthAnalysisTool as unknown as ToolClass,
  AnalyzeSpendingPatternsTool as unknown as ToolClass,
  GoalProgressReportTool as unknown as ToolClass,
  CashFlowForecastTool as unknown as ToolClass,
  CategoryPerformanceReviewTool as unknown as ToolClass,
  SetCategoryGoalsTool as unknown as ToolClass,
  BudgetFromHistoryTool as unknown as ToolClass,
  ReconcileAccountTool as unknown as ToolClass,
  ListTransactionsTool as unknown as ToolClass,
];

async function createRuntimeConfig(env: Env, props: AuthProps): Promise<ToolRuntimeConfig> {
  const accessToken = await getValidAccessToken(env, props.ynabUserId);
  return {
    ynabApi: new ynab.API(accessToken),
    hasToken: true,
  };
}

export function registerYnabTools(server: McpServer, env: Env, props: AuthProps) {
  for (const ToolClass of TOOL_CLASSES) {
    const preview = new ToolClass();
    const definition = preview.getToolDefinition();

    server.registerTool(
      definition.name,
      {
        title: definition.annotations?.title,
        description: definition.description,
        annotations: definition.annotations,
        inputSchema: jsonSchemaObjectToZodShape(definition.inputSchema as any),
      },
      async (args) => {
        const tool = new ToolClass(await createRuntimeConfig(env, props));
        return tool.execute(args as Record<string, unknown>);
      }
    );
  }
}
