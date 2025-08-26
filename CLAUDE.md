# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript and runs mcp-build)
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

This is a **Model Context Protocol (MCP) server** that provides AI tools for interacting with YNAB (You Need A Budget) budgets. The architecture follows a simple pattern:

### Core Structure
- **Entry Point**: `src/index.ts` - Minimal server setup using `mcp-framework`
- **Tools Directory**: `src/tools/` - Contains all MCP tools as individual TypeScript classes
- **Framework**: Built with `mcp-framework` which auto-discovers tools and handles MCP protocol

### Tool Architecture Pattern
Each tool in `src/tools/` follows this pattern:
- Extends `MCPTool<InputType>` from `mcp-framework`
- Defines `name`, `description`, and `schema` properties
- Implements `execute()` method for tool logic
- Uses YNAB SDK client initialized with `process.env.YNAB_API_TOKEN`

### Available Tools
- **ListBudgetsTool**: Lists available YNAB budgets
- **BudgetSummaryTool**: Provides budget month summaries with categories and accounts
- **GetUnapprovedTransactionsTool**: Retrieves pending transactions
- **CreateTransactionTool**: Creates new transactions
- **ApproveTransactionTool**: Approves existing transactions

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

### Tool Development Pattern
```typescript
import { MCPTool, logger } from "mcp-framework";
import * as ynab from "ynab";
import { z } from "zod";

interface ToolInput {
  budgetId?: string;
  // other parameters
}

class NewTool extends MCPTool<ToolInput> {
  name = "tool_name";
  description = "Tool description";
  
  schema = {
    budgetId: {
      type: z.string().optional(),
      description: "Budget ID (optional)"
    }
  };

  private api: ynab.API;

  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }

  async execute(input: ToolInput) {
    // Implementation
  }
}

export default NewTool;
```

### Error Handling
- Check for `YNAB_API_TOKEN` presence
- Use try/catch blocks for YNAB API calls
- Use `logger` from `mcp-framework` for logging
- Return descriptive error messages to users

### Testing
- Tests run with Vitest
- Test files follow pattern: `**/*.{test,spec}.{ts,js}`
- Coverage reports available via `npm run test:coverage`
- Tests should be put into the `tests` folder

### TypeScript Configuration
- Target: ESNext with Node module resolution
- Strict mode enabled
- Output to `./dist` directory
- Base URL set to `./src` for clean imports