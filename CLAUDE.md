# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript with official MCP SDK)
npm run build

# Start the server
npm start

# Development build with file watching
npm run watch

# Debug the MCP server with inspector
npm run debug

# Run tests
npm test

# Run tests with file watching
npm test:watch

# Run tests with coverage report
npm test:coverage
```

## Architecture Overview

This is a **Model Context Protocol (MCP) server** that provides 14 comprehensive AI tools for interacting with YNAB (You Need A Budget) budgets. The architecture uses the official MCP SDK:

### Core Structure
- **Entry Point**: `src/index.ts` - Server setup using official `@modelcontextprotocol/sdk`
- **Tools Directory**: `src/tools/` - Contains all 14 MCP tools as individual TypeScript classes
- **Framework**: Built with official `@modelcontextprotocol/sdk` v1.20.1 for proper MCP protocol handling

### Tool Architecture Pattern
Each tool in `src/tools/` follows this pattern:
- Implements `getToolDefinition()` method returning MCP Tool definition
- Implements `execute()` method returning MCP content array format
- Uses YNAB SDK client initialized with `process.env.YNAB_API_TOKEN`
- Returns standardized MCP response format: `{ content: [{ type: "text", text: "..." }] }`

### Available Tools (14 Total)

#### **Core Foundation (5 Tools)**
- **ListBudgetsTool**: Lists available YNAB budgets
- **BudgetSummaryTool**: Provides budget month summaries with categories and accounts
- **GetUnapprovedTransactionsTool**: Retrieves pending transactions
- **CreateTransactionTool**: Creates new transactions
- **ApproveTransactionTool**: Approves existing transactions

#### **Workflow Automation (4 Tools)**
- **HandleOverspendingTool**: Automatically resolve overspent categories by moving funds
- **AutoDistributeFundsTool**: Intelligently allocate "Ready to Assign" money based on goals
- **BulkApproveTransactionsTool**: Approve multiple transactions matching criteria in one call
- **MoveFundsBetweenCategoriesTool**: Transfer budgeted amounts between categories

#### **Analytics & Insights (4 Tools)**
- **AnalyzeSpendingPatternsTool**: Analyze spending patterns to detect trends and anomalies
- **GoalProgressReportTool**: Generate comprehensive goal progress reports with performance ratings
- **CashFlowForecastTool**: Generate cash flow projections based on historical patterns
- **CategoryPerformanceReviewTool**: Review category budget performance with ratings and recommendations

#### **Additional Tools (1 Tool)**
- **NetWorthAnalysisTool**: Analyze current net worth across all accounts

### Environment Variables
- `YNAB_API_TOKEN` (required) - Personal Access Token from YNAB API
- `YNAB_BUDGET_ID` (optional) - Default budget ID to use

## Development Guidelines

### Adding New Tools
1. Create new tool class in `src/tools/` extending `MCPTool`
2. Reference YNAB SDK types from `node_modules/ynab/dist/index.d.ts`
3. Use YNAB OpenAPI spec at `https://api.ynab.com/papi/open_api_spec.yaml` for API reference
4. Follow existing pattern: initialize YNAB API client in constructor
5. Framework auto-discovers new tools - no manual registration needed
6. Add a test coverage file to `src/tools`

### Tool Development Pattern
```typescript
import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface ToolInput {
  budgetId?: string;
  // other parameters
}

class NewTool {
  private api: ynab.API;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  getToolDefinition(): Tool {
    return {
      name: "tool_name",
      description: "Tool description",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "Budget ID (optional)"
          }
        },
        additionalProperties: false,
      },
    };
  }

  async execute(input: ToolInput) {
    try {
      // Implementation
      const result = "Tool result";
      
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }
}

export default NewTool;
```

### Error Handling
- Check for `YNAB_API_TOKEN` presence
- Use try/catch blocks for YNAB API calls
- Use `console.error` for server-side logging
- Return descriptive error messages in MCP content array format
- Always return proper MCP response structure even for errors

### Testing
- Tests run with Vitest (69 tests currently passing)
- Test files follow pattern: `**/*.{test,spec}.{ts,js}`
- Coverage reports available via `npm run test:coverage`
- Tests should be put into the `src/tests` folder
- All tests updated to work with new MCP SDK content array format
- When any code is modified, update the test coverage to account for the change

### TypeScript Configuration
- Target: ESNext with Node module resolution
- Strict mode enabled
- Output to `./dist` directory
- Base URL set to `./src` for clean imports
- Uses official MCP SDK types for proper protocol compliance

## Project Status
- **Version**: 0.1.2
- **Status**: Production ready with 14 comprehensive tools
- **Framework**: Official @modelcontextprotocol/sdk v1.20.1
- **Test Coverage**: 69 tests passing
- **Architecture**: Manual tool registration with proper MCP protocol handling