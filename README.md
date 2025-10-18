# ynab-mcp-server

A comprehensive Model Context Protocol (MCP) server built with the official @modelcontextprotocol/typescript-sdk. This MCP provides 14 powerful tools for interacting with your YNAB budgets setup at https://ynab.com

> **Acknowledgments**: This project is based on the original work by [Caleb LeNoir](https://github.com/calebl/ynab-mcp-server) and has been significantly expanded with additional tools, analytics capabilities, and enhanced functionality. We thank Caleb for the foundational work that made this comprehensive version possible.

[![GitHub](https://img.shields.io/badge/GitHub-issmirnov%2Fynab--mcp--server-blue)](https://github.com/issmirnov/ynab-mcp-server)
[![npm version](https://img.shields.io/npm/v/ynab-mcp-server)](https://www.npmjs.com/package/ynab-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.20.1-green)](https://github.com/modelcontextprotocol/typescript-sdk)

In order to have an AI interact with this tool, you will need to get your Personal Access Token
from YNAB: https://api.ynab.com/#personal-access-tokens. When adding this MCP server to any
client, you will need to provide your personal access token as YNAB_API_TOKEN. **This token
is never directly sent to the LLM.** It is stored privately in an environment variable for
use with the YNAB api.

## Setup
Specify env variables:
* YNAB_API_TOKEN (required)
* YNAB_BUDGET_ID (optional)

## Goal
The goal of this project is to enable comprehensive AI-powered interaction with YNAB budgets through natural language conversations. This server provides 14 powerful tools organized into multiple tiers for complete budget management.

## Core Workflows (All Implemented ✅)

### 🏗️ **Foundation & Setup**
- **First-time setup**: Select your budget from available budgets
- **Budget overview**: Get comprehensive budget summaries and health checks

### 💰 **Transaction Management**
- **Adding transactions**: Create transactions with natural language ("I spent $3.98 at REI today")
- **Approving transactions**: Review and approve pending transactions individually or in bulk
- **Transaction analysis**: Find duplicates and analyze spending patterns

### 📊 **Budget Management**
- **Overspending resolution**: Automatically resolve overspent categories by moving funds
- **Fund distribution**: Intelligently allocate "Ready to Assign" money based on goals
- **Category management**: Transfer budgeted amounts between categories

### 📈 **Analytics & Insights**
- **Spending analysis**: Detect trends, anomalies, and spending patterns
- **Goal tracking**: Comprehensive goal progress reports with performance ratings
- **Cash flow forecasting**: Project future balances based on historical patterns
- **Performance reviews**: Category budget performance analysis with recommendations
- **Net worth analysis**: Current net worth snapshot across all accounts

## Current State

✅ **Production Ready**: 14 comprehensive tools implemented with official @modelcontextprotocol/typescript-sdk v1.20.1

### 🛠️ **Available Tools (14 Total)**

#### **Core Foundation (5 Tools)**
1. **ListBudgets** - Lists all available YNAB budgets on your account
2. **BudgetSummary** - Provides comprehensive budget month summaries with categories and accounts
3. **GetUnapprovedTransactions** - Retrieves all pending transactions with readable formatting
4. **CreateTransaction** - Creates transactions with natural language support
   - Example: `Add a transaction to my Ally account for $3.98 I spent at REI today`
5. **ApproveTransaction** - Approves existing transactions in your YNAB budget

#### **Workflow Automation (4 Tools)**
6. **HandleOverspending** - Automatically resolve overspent categories by moving funds
7. **AutoDistributeFunds** - Intelligently allocate "Ready to Assign" money based on goals
8. **BulkApproveTransactions** - Approve multiple transactions matching criteria in one call
9. **MoveFundsBetweenCategories** - Transfer budgeted amounts between categories

#### **Analytics & Insights (4 Tools)**
10. **AnalyzeSpendingPatterns** - Analyze spending patterns to detect trends and anomalies
11. **GoalProgressReport** - Generate comprehensive goal progress reports with performance ratings
12. **CashFlowForecast** - Generate cash flow projections based on historical patterns
13. **CategoryPerformanceReview** - Review category budget performance with ratings and recommendations

#### **Additional Tools (1 Tool)**
14. **NetWorthAnalysis** - Analyze current net worth across all accounts

### 🏗️ **Technical Status**
- ✅ Official MCP SDK integration (v1.20.1)
- ✅ All 14 tools fully functional with new SDK
- ✅ Complete test suite (69 tests passing)
- ✅ TypeScript build system working
- ✅ Proper MCP protocol compliance
- ✅ Production-ready with comprehensive error handling

## Project Evolution

This project started as a fork of [Caleb LeNoir's original ynab-mcp-server](https://github.com/calebl/ynab-mcp-server) and has been significantly expanded:

### **Original Foundation (by Caleb LeNoir)**
- 5 core tools for basic YNAB interaction
- mcp-framework implementation
- Basic transaction and budget management

### **Enhanced Version (this repository)**
- **Expanded to 14 comprehensive tools** across 4 categories
- **Migrated to official MCP SDK** for better maintenance and features
- **Added advanced analytics** including spending patterns, goal tracking, and performance reviews
- **Implemented workflow automation** for overspending resolution and fund distribution
- **Enhanced error handling** and production-ready reliability
- **Comprehensive test coverage** with 69 passing tests
- **Improved documentation** and user experience

We maintain full compatibility with the original API while providing significantly more functionality for comprehensive budget management.


## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

```

## Project Structure

```
ynab-mcp-server/
├── src/
│   ├── tools/        # MCP Tools
│   └── index.ts      # Server entry point
├── .cursor/
│   └── rules/        # Cursor AI rules for code generation
├── package.json
└── tsconfig.json
```

## Adding Components

The YNAB sdk describes the available api endpoints: https://github.com/ynab/ynab-sdk-js.

YNAB open api specification is here: https://api.ynab.com/papi/open_api_spec.yaml. This can
be used to prompt an AI to generate a new tool. Example prompt for Cursor Agent:

```
create a new tool based on the readme and this openapi doc: https://api.ynab.com/papi/open_api_spec.yaml

The new tool should get the details for a single budget
```

You can add more tools by creating new TypeScript files in the `src/tools/` directory following the established pattern.

## Tool Development

Example tool structure using the official @modelcontextprotocol/typescript-sdk:

```typescript
import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";

interface MyToolInput {
  message: string;
}

class MyTool {
  private api: ynab.API;

  constructor() {
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  getToolDefinition(): Tool {
    return {
      name: "my_tool",
      description: "Describes what your tool does",
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Description of this input parameter",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
    };
  }

  async execute(input: MyToolInput) {
    try {
      // Your tool logic here
      const result = `Processed: ${input.message}`;
      
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

export default MyTool;
```

## Publishing to npm

1. Update your package.json:
   - Ensure `name` is unique and follows npm naming conventions
   - Set appropriate `version`
   - Add `description`, `author`, `license`, etc.
   - Check `bin` points to the correct entry file

2. Build and test locally:
   ```bash
   npm run build
   npm link
   ynab-mcp-server  # Test your CLI locally
   ```

3. Login to npm (create account if necessary):
   ```bash
   npm login
   ```

4. Publish your package:
   ```bash
   npm publish
   ```

After publishing, users can add it to their claude desktop client (read below) or run it with npx


## Using with Claude Desktop

### Installing via Smithery

To install YNAB MCP Server for Claude Desktop automatically via Smithery:

```bash
npx -y @smithery/cli install ynab-mcp-server --client claude
```

### Local Development

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ynab-mcp-server": {
      "command": "node",
      "args":["/absolute/path/to/ynab-mcp-server/dist/index.js"]
    }
  }
}
```

### After Publishing

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ynab-mcp-server": {
      "command": "npx",
      "args": ["ynab-mcp-server"],
      "env": {
        "YNAB_API_TOKEN": "your-ynab-api-token-here"
      }
    }
  }
}
```

### Other MCP Clients
Check https://modelcontextprotocol.io/clients for other available clients.

## Building and Testing

1. Make changes to your tools
2. Run `npm run build` to compile
3. The server will automatically load your tools on startup

## Learn More

- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [YNAB API Documentation](https://api.ynab.com/)
- [YNAB JavaScript SDK](https://github.com/ynab/ynab-sdk-js)
