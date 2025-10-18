# System Patterns

## Architecture Overview
**MCP Server Pattern**: Built using the Model Context Protocol framework with auto-discovery of tools.

### Core Architecture
```
src/index.ts (Entry Point)
├── MCPServer instance
├── Auto-discovery of tools in src/tools/
└── YNAB API integration via environment variables
```

### Tool Architecture Pattern
Each tool follows a consistent pattern:
```typescript
class ToolName extends MCPTool<InputType> {
  name = "tool_name";
  description = "Tool description";
  schema = { /* Zod validation */ };
  
  private api: ynab.API;
  
  constructor() {
    super();
    this.api = new ynab.API(process.env.YNAB_API_TOKEN || "");
  }
  
  async execute(input: InputType) {
    // Implementation
  }
}
```

## Key Technical Decisions

### 1. Framework Choice
- **mcp-framework**: Chosen for MCP protocol handling and auto-discovery
- **Benefits**: Automatic tool registration, built-in logging, standardized patterns
- **Trade-offs**: Less control over MCP protocol details

### 2. YNAB SDK Integration
- **Official YNAB SDK**: Uses `ynab` npm package for type safety
- **API Client Pattern**: Single instance per tool, initialized with token
- **Error Handling**: Try/catch with descriptive error messages

### 3. Type Safety
- **TypeScript**: Strict mode enabled for type safety
- **Zod Schemas**: Runtime validation for tool inputs
- **YNAB Types**: Leverages official YNAB SDK types

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
- Tools are auto-discovered and instantiated by mcp-framework
- Each tool creates its own YNAB API client

### 2. Template Method Pattern
- All tools extend MCPTool with consistent structure
- Common patterns: constructor setup, error handling, logging

### 3. Error Handling Pattern
- Consistent try/catch blocks
- Descriptive error messages for users
- Detailed logging for debugging

### 4. Configuration Pattern
- Environment-based configuration
- Fallback mechanisms for optional parameters
- Secure token handling

## Integration Patterns

### MCP Protocol
- Tools auto-register via framework
- Standardized input/output handling
- Protocol-level error management

### YNAB API Integration
- RESTful API calls via official SDK
- Milliunit currency handling (divide by 1000 for display)
- Rate limiting and error handling
