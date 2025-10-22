# ynab-mcp-server

A comprehensive Model Context Protocol (MCP) server that transforms how you interact with YNAB (You Need A Budget) through AI. Built with the official @modelcontextprotocol/typescript-sdk, this server provides **18 powerful tools** that enable natural language budget management, automated workflows, advanced analytics, and intelligent financial insights.

> **Acknowledgments**: This project is based on the original work by [Caleb LeNoir](https://github.com/calebl/ynab-mcp-server) and has been significantly expanded with additional tools, analytics capabilities, and enhanced functionality. We thank Caleb for the foundational work that made this comprehensive version possible.

[![GitHub](https://img.shields.io/badge/GitHub-issmirnov%2Fynab--mcp--server-blue)](https://github.com/issmirnov/ynab-mcp-server)
[![npm version](https://img.shields.io/npm/v/@issmirnov/ynab-mcp-server)](https://www.npmjs.com/package/@issmirnov/ynab-mcp-server)
[![Docker Image](https://img.shields.io/badge/Docker-ghcr.io%2Fissmirnov%2Fynab--mcp--server-blue)](https://github.com/issmirnov/ynab-mcp-server/pkgs/container/ynab-mcp-server)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.20.1-green)](https://github.com/modelcontextprotocol/typescript-sdk)

## Quick Links

📚 [Real-World Workflows](#real-world-workflows) | 🛠️ [All 18 Tools](#available-tools-18-total) | 🚀 [Quick Start](#quick-start) | 🔧 [Setup Guide](#using-with-claude-desktop)

## Installation

Choose your preferred installation method:

### Option 1: Using Docker (Recommended) 🐳
```bash
docker pull ghcr.io/issmirnov/ynab-mcp-server:latest
```

### Option 2: Using npm/npx 📦
```bash
# Run directly without installation
npx -y @issmirnov/ynab-mcp-server

# Or install globally
npm install -g @issmirnov/ynab-mcp-server
```

### Option 3: Using Smithery (Claude Desktop)
```bash
npx -y @smithery/cli install @issmirnov/ynab-mcp-server --client claude
```

## Setup

**Required**: Get your Personal Access Token from YNAB: https://api.ynab.com/#personal-access-tokens

Environment variables:
* **YNAB_API_TOKEN** (required) - Your YNAB Personal Access Token
* **YNAB_BUDGET_ID** (optional) - Default budget ID (can be specified per-request)

**Security Note**: Your API token is never sent to the LLM. It's stored privately in an environment variable and only used for YNAB API calls.

## What Makes This Powerful?

This isn't just another YNAB API wrapper. This MCP server enables **true AI-powered financial management** through:

- 🗣️ **Natural Language**: "I spent $3.98 at REI today" → Transaction created
- 🤖 **Intelligent Automation**: Automatically resolve overspending by intelligently moving funds
- 📊 **Advanced Analytics**: Detect spending anomalies, forecast cash flow, analyze category performance
- 🔄 **Bank Reconciliation**: Feed in CSV bank statements, automatically find and create missing transactions
- 💡 **Smart Recommendations**: AI-generated insights based on your actual spending patterns
- ⚡ **Bulk Operations**: Approve 50 transactions at once with filters, move funds between multiple categories
- 🎯 **Goal-Driven**: Intelligently distribute "Ready to Assign" money based on your category goals

## Use Cases

**Perfect for**:
- 🔄 Monthly budget ceremonies (auto-allocate funds to goals)
- 🏦 Bank account reconciliation (import CSV, auto-create missing transactions)
- 📊 Spending pattern analysis (detect trends and anomalies)
- 🚨 Overspending fixes (automatically rebalance categories)
- 💰 Major purchase planning (cash flow forecasting)
- 📈 Budget optimization (create budgets from historical spending)
- 🎯 Goal tracking (progress reports and intelligent funding)

See [detailed workflows](#real-world-workflows) below for step-by-step examples.

## Available Tools (18 Total)

✅ **Production Ready**: 18 comprehensive tools implemented with official @modelcontextprotocol/typescript-sdk v1.20.1

### **Core Foundation (6 Tools)**
1. **ynab_list_budgets** - Lists all available YNAB budgets on your account
2. **ynab_budget_summary** - Provides comprehensive budget month summaries with categories and accounts
3. **ynab_list_transactions** - List and filter transactions with comprehensive search options
4. **ynab_get_unapproved_transactions** - Retrieves all pending transactions with readable formatting
5. **ynab_create_transaction** - Creates transactions with natural language support
6. **ynab_approve_transaction** - Approves existing transactions in your YNAB budget

### **Workflow Automation (4 Tools)**
7. **ynab_handle_overspending** - Automatically resolve overspent categories by intelligently moving funds from available sources
8. **ynab_auto_distribute_funds** - Intelligently allocate "Ready to Assign" money based on category goals and priorities
9. **ynab_bulk_approve_transactions** - Approve multiple transactions matching criteria in one operation
10. **ynab_move_funds_between_categories** - Transfer budgeted amounts between categories with validation

### **Analytics & Insights (5 Tools)**
11. **ynab_analyze_spending_patterns** - Analyze spending patterns to detect trends, anomalies, and provide insights
12. **ynab_goal_progress_report** - Generate comprehensive goal progress reports with completion status and performance ratings
13. **ynab_cash_flow_forecast** - Generate cash flow projections based on historical income and expense patterns
14. **ynab_category_performance_review** - Review category budget performance over time with ratings and recommendations
15. **ynab_net_worth_analysis** - Analyze current net worth across all accounts (on-budget and tracking)

### **Advanced Management (3 Tools)**
16. **ynab_reconcile_account** - Reconcile YNAB accounts with bank statement data (CSV support)
17. **ynab_set_category_goals** - Create or update category goals (target balance, monthly funding, etc.)
18. **ynab_budget_from_history** - Analyze historical spending and suggest budget allocations based on past behavior

### 🏗️ **Technical Status**
- ✅ Official MCP SDK integration (v1.20.1)
- ✅ All 18 tools fully functional with new SDK
- ✅ Comprehensive test suite (274 tests, 91.6% pass rate)
- ✅ TypeScript build system working
- ✅ Proper MCP protocol compliance with tool annotations
- ✅ Production-ready with comprehensive error handling and retry logic
- ✅ Context-optimized responses with 25,000 character limit
- ✅ Both JSON and Markdown output formats supported

## Real-World Workflows

### 🔄 **Bank Account Reconciliation** (The Power Feature!)

One of the most powerful workflows is bank account reconciliation. Simply export your bank statement as CSV and let AI do the heavy lifting:

**Scenario**: You have 50 transactions from your bank, but only 45 are in YNAB.

**Workflow**:
```
You: "Help me reconcile my Chase Checking account. My statement balance is $2,543.21 as of March 31, 2024"

AI: "I'll help you reconcile. Please paste your bank statement CSV."

You: [Paste CSV data]
Date,Description,Amount
2024-03-15,STARBUCKS,4.50
2024-03-16,AMAZON.COM,29.99
2024-03-17,SHELL GAS,45.00
...

AI: "I found 5 discrepancies:
- 3 transactions in bank statement but missing from YNAB
- 2 transactions have different amounts
- Statement balance matches after adjustments!

Would you like me to create the missing transactions?"

You: "Yes, create them"

AI: [Creates 3 missing transactions with correct dates, amounts, and payees]
"Done! Your account is now reconciled. Balance: $2,543.21 ✓"
```

**What Happens Behind the Scenes**:
- `ynab_reconcile_account` tool parses your CSV (auto-detects column format)
- Matches transactions by date, amount, and description similarity
- Identifies missing transactions, duplicates, and balance discrepancies
- Optionally creates missing transactions automatically
- Provides detailed reconciliation report

### 💰 **Monthly Budget Ceremony** (Smart Allocation)

**Scenario**: It's the 1st of the month and you have $1,200 "Ready to Assign"

**Workflow**:
```
You: "I have $1,200 ready to assign. Help me allocate it intelligently."

AI: [Analyzes your budget using multiple tools]
"Based on your budget analysis:
- 5 categories have underfunded goals (need $800 total)
- 3 categories are frequently overspent (recommend +$200 buffer)
- Historical analysis shows you typically need $150 more for groceries

Recommended distribution:
1. Emergency Fund Goal: $300 (60% to goal)
2. Groceries: $150 (historical average + 20%)
3. Gas: $100 (frequently overspent)
4. Entertainment: $50 (goal funding)
5. Vacation Fund: $200 (goal funding)
6. Misc Buffer: $400 (flexible allocation)

Approve this allocation?"

You: "Approved"

AI: [Uses ynab_auto_distribute_funds with goals-first strategy]
"✓ Allocated $1,200 across 6 categories based on goals and spending patterns"
```

### 🚨 **Overspending Resolution** (Automated Fix)

**Scenario**: Mid-month reality check - 3 categories are overspent

**Workflow**:
```
You: "Check my budget for overspending"

AI: "Found 3 overspent categories:
- Dining Out: -$45.00 (over by $45)
- Gas: -$23.50 (over by $23.50)
- Entertainment: -$15.00 (over by $15)

Total overspending: $83.50

I can automatically fix this by moving funds from categories with available money.
Available sources: Clothing ($200), Misc ($150), Gifts ($75)

Shall I resolve this automatically?"

You: "Yes, but prioritize taking from Misc first"

AI: [Uses ynab_handle_overspending]
"✓ Resolved all overspending:
- Moved $45.00 from Misc → Dining Out
- Moved $23.50 from Misc → Gas
- Moved $15.00 from Misc → Entertainment

Misc remaining: $66.50
All categories now balanced!"
```

### 📊 **Spending Analysis & Insights**

**Scenario**: You want to understand your spending patterns

**Workflow**:
```
You: "Analyze my spending patterns for the last 6 months"

AI: [Uses ynab_analyze_spending_patterns with 6-month window]
"📊 Spending Pattern Analysis (6 months):

🔴 Anomalies Detected:
- Groceries: Spent $847 in Feb (avg: $620) - 36% over normal
- Gas: Spent $95 in Jan (avg: $165) - 42% under normal

📈 Trends:
- Dining Out: Increasing trend (+15% over 6 months)
- Entertainment: Stable within 5% variance
- Utilities: Seasonal pattern detected (higher in winter)

💡 AI Insights:
- Consider increasing Groceries budget by $50/month
- Dining Out trend suggests need for $40 more/month
- Gas spending normalized after January anomaly

Recommended Actions:
1. Increase Groceries: $620 → $670/month
2. Increase Dining Out: $200 → $240/month
3. Monitor Gas for next 2 months

Would you like me to update these budgets?"
```

### 📈 **Cash Flow Forecasting**

**Scenario**: Planning a big purchase

**Workflow**:
```
You: "I want to buy a $2,000 laptop in 3 months. Can I afford it?"

AI: [Uses ynab_cash_flow_forecast for 3-month projection]
"💰 Cash Flow Forecast (Next 3 Months):

Based on your historical income/expense patterns:

April 2024: $4,250 income - $3,800 expenses = +$450
May 2024: $4,250 income - $3,750 expenses = +$500
June 2024: $4,250 income - $3,850 expenses = +$400

Projected savings by June: $1,350
Current balance: $3,200
Projected balance in June: $4,550

✅ You can afford the $2,000 laptop!

After purchase, you'll have $2,550 remaining, which is above your
recommended emergency fund minimum of $2,000.

Recommendation: Purchase is financially safe. Consider:
- Buying in May (earlier without risk)
- Or waiting until June for extra cushion"
```

### 🎯 **Goal-Based Budgeting**

**Scenario**: Setting up a vacation fund

**Workflow**:
```
You: "I want to save $3,000 for a vacation by December"

AI: "I'll help you set up a goal for this. What category should I use?"

You: "Create one called 'Europe Vacation 2024'"

AI: [Uses ynab_set_category_goals]
"✓ Created goal: Europe Vacation 2024
- Target: $3,000
- Target Date: December 31, 2024
- Monthly funding needed: $375
- Status: $0 of $3,000 (0%)

I can automatically allocate $375/month when you assign money.
Enable auto-distribution for this goal?"

You: "Yes"

[Next month, when you assign money...]

AI: [Automatically via ynab_auto_distribute_funds]
"✓ Auto-allocated $375 to Europe Vacation 2024
- Progress: $375 of $3,000 (12.5%)
- On track to reach goal by December!"
```

### 🔍 **Transaction Management**

**Scenario**: Bulk operations and cleanup

**Workflow**:
```
You: "Approve all Amazon transactions from last week"

AI: [Uses ynab_bulk_approve_transactions]
"Found 7 unapproved Amazon transactions (March 11-17):
1. $29.99 - Books
2. $15.49 - Household supplies
3. $42.00 - Electronics
... (4 more)

Total: $183.47

Approve all 7 transactions?"

You: "Yes"

AI: "✓ Approved 7 transactions totaling $183.47"

---

You: "Show me all transactions over $100 this month"

AI: [Uses ynab_list_transactions with filters]
"Found 12 transactions over $100 in March:
1. $450.00 - Rent (Housing) ✓ Approved
2. $125.50 - Costco (Groceries) ✓ Approved
3. $118.00 - Electric Bill (Utilities) ⏳ Pending
...

Would you like to approve the pending ones?"
```

### 🧠 **Historical Budget Creation**

**Scenario**: Starting fresh or refining your budget

**Workflow**:
```
You: "I want to rebuild my budget based on what I actually spend"

AI: [Uses ynab_budget_from_history]
"Analyzed your last 6 months of spending...

📊 Budget Recommendations (based on historical averages):

Essential Categories:
- Rent: $1,200 (no change needed - consistent)
- Groceries: $685 (increase from $600 - averaging $685/mo)
- Gas: $175 (increase from $150 - averaging $168/mo)
- Utilities: $145 (seasonal adjusted)

Discretionary:
- Dining Out: $280 (decrease from $350 - averaging $265/mo)
- Entertainment: $95 (consistent with current)
- Shopping: $220 (increase from $150 - averaging $215/mo)

💡 Insights:
- You consistently overspend Groceries by 14% - recommend increase
- Dining Out budget is too high - you typically spend less
- Shopping needs more allocation to avoid frequent overspending

Apply these recommendations?"

You: "Yes, apply them"

AI: [Updates all category budgets]
"✓ Updated 15 category budgets based on 6-month analysis.
Your budget now reflects your actual spending patterns!"
```

## Project Evolution

This project started as a fork of [Caleb LeNoir's original ynab-mcp-server](https://github.com/calebl/ynab-mcp-server) and has been significantly expanded:

### **Original Foundation (by Caleb LeNoir)**
- 5 core tools for basic YNAB interaction
- mcp-framework implementation
- Basic transaction and budget management

### **Enhanced Version (this repository)**
- **Expanded to 18 comprehensive tools** across 4 categories
- **Migrated to official MCP SDK** for better maintenance and features
- **Added advanced analytics** including spending patterns, goal tracking, and performance reviews
- **Implemented workflow automation** for overspending resolution and fund distribution
- **Added bank reconciliation** with CSV import and automatic transaction creation
- **Enhanced error handling** and production-ready reliability with retry logic
- **Comprehensive test coverage** with 274 tests (91.6% pass rate)
- **Context optimization** for efficient AI interactions
- **Improved documentation** and user experience

We maintain full compatibility with the original API while providing significantly more functionality for comprehensive budget management.


## Quick Start

### Using Docker (Recommended)

The easiest way to run the YNAB MCP Server is using our pre-built Docker image:

```bash
# Pull the latest image
docker pull ghcr.io/issmirnov/ynab-mcp-server:latest

# Run the container with your YNAB API token
docker run -e YNAB_API_TOKEN=your-token-here ghcr.io/issmirnov/ynab-mcp-server:latest
```

### Using npm/npx

```bash
# Install and run directly
npx @issmirnov/ynab-mcp-server

# Or install globally
npm install -g @issmirnov/ynab-mcp-server
ynab-mcp-server
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/issmirnov/ynab-mcp-server.git
cd ynab-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run locally
npm start
```

## Project Structure

```
ynab-mcp-server/
├── src/
│   ├── tools/           # 18 MCP Tools (one file per tool)
│   ├── utils/           # Shared utilities (currency, dates, error handling)
│   ├── tests/           # Comprehensive test suite (274 tests)
│   └── index.ts         # Server entry point with MCP SDK setup
├── dist/                # Compiled JavaScript output
├── CLAUDE.md            # Development guidelines for AI assistants
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

#### Using Docker (Recommended)

Add this configuration to your Claude Desktop config file:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ynab-mcp-server": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "YNAB_API_TOKEN=your-ynab-api-token-here",
        "ghcr.io/issmirnov/ynab-mcp-server:latest"
      ]
    }
  }
}
```

#### Using npm/npx

```json
{
  "mcpServers": {
    "ynab-mcp-server": {
      "command": "npx",
      "args": ["-y", "@issmirnov/ynab-mcp-server"],
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
