# System Patterns

## Architecture Overview
**MCP Server Pattern**: Built using the official Model Context Protocol TypeScript SDK with manual tool registration.

### Core Architecture
```
src/index.ts (Entry Point)
├── Server instance from @modelcontextprotocol/sdk
├── Manual tool registration and request handlers
├── StdioServerTransport for communication
└── YNAB API integration via environment variables
```

### Tool Architecture Pattern
Each tool follows a consistent pattern:
```typescript
class ToolName {
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
        properties: { /* JSON Schema */ },
        additionalProperties: false,
      },
    };
  }
  
  async execute(input: any) {
    // Implementation returns { content: [{ type: "text", text: "..." }] }
  }
}
```

## Key Technical Decisions

### 1. Framework Choice
- **@modelcontextprotocol/typescript-sdk**: Official MCP SDK for protocol handling
- **Benefits**: Official support, better maintenance, full MCP protocol compliance, modern features
- **Trade-offs**: Requires manual tool registration, more explicit setup

### 2. YNAB SDK Integration
- **Official YNAB SDK**: Uses `ynab` npm package for type safety
- **API Client Pattern**: Single instance per tool, initialized with token
- **Error Handling**: Try/catch with descriptive error messages

### 3. Type Safety
- **TypeScript**: Strict mode enabled for type safety
- **JSON Schema**: Runtime validation for tool inputs via official SDK
- **YNAB Types**: Leverages official YNAB SDK types
- **MCP Types**: Uses official MCP SDK types for proper protocol compliance

### 4. Configuration Management
- **Environment Variables**: `YNAB_API_TOKEN` (required), `YNAB_BUDGET_ID` (optional)
- **Budget ID Resolution**: Tool-level fallback to environment variable
- **Token Security**: Never logged or exposed to LLM

## Component Relationships

### Tool Dependencies
- **ListBudgetsTool**: Independent, provides budget selection
- **BudgetSummaryTool**: Requires budget ID, provides overview
- **CreateTransactionTool**: Requires budget + account ID
- **GetUnapprovedTransactionsTool**: Requires budget ID
- **ApproveTransactionTool**: Requires budget + transaction ID

### Data Flow
1. **User Input** → AI Client → MCP Protocol → Tool
2. **Tool** → YNAB API → Response Processing → User Output
3. **Error Handling** → Logging → User-friendly messages

## Design Patterns in Use

### 1. Factory Pattern
- Tools are manually instantiated and registered in the server
- Each tool creates its own YNAB API client

### 2. Template Method Pattern
- All tools follow consistent structure with getToolDefinition() and execute() methods
- Common patterns: constructor setup, error handling, MCP response format

### 3. Error Handling Pattern
- Consistent try/catch blocks
- Descriptive error messages returned in MCP content array format
- Console.error logging for debugging

### 4. Configuration Pattern
- Environment-based configuration
- Fallback mechanisms for optional parameters
- Secure token handling

## Integration Patterns

### MCP Protocol
- Tools manually registered via Server class
- Standardized input/output handling with content arrays
- Protocol-level error management via official SDK

### YNAB API Integration
- RESTful API calls via official SDK
- Milliunit currency handling (divide by 1000 for display)
- Rate limiting and error handling
