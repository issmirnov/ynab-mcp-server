# Technical Context

## Technologies Used

### Core Technologies
- **TypeScript**: Primary language with strict mode
- **Server**: Node.js with ESNext target
- **Framework**: mcp-framework (v0.1.29) for MCP protocol handling
- **YNAB Integration**: Official ynab SDK (v2.9.0)
- **HTTP Client**: Axios (v1.8.4) via YNAB SDK

### Development Tools
- **Build System**: TypeScript compiler + mcp-build
- **Testing**: Vitest (v3.2.4) with coverage reporting
- **Linting**: TypeScript strict mode
- **Debugging**: MCP Inspector (@modelcontextprotocol/inspector)

### Package Management
- **Package Manager**: npm with package-lock.json
- **Module System**: ESNext modules
- **Type Definitions**: @types/node, @types/axios

## Development Setup

### Prerequisites
- Node.js (version not specified, but ESNext target suggests modern version)
- npm package manager
- YNAB Personal Access Token

### Installation
```bash
npm install
npm run build
```

### Available Scripts
- `build`: Compile TypeScript + mcp-build + chmod executable
- `watch`: TypeScript file watching
- `start`: Run compiled server
- `debug`: Run with MCP inspector
- `test`: Run Vitest tests
- `test:watch`: Watch mode testing
- `test:coverage`: Coverage report

## Technical Constraints

### YNAB API Limitations
- **Rate Limits**: Must respect YNAB API rate limiting
- **Authentication**: Personal Access Token required
- **Currency Format**: Milliunits (divide by 1000 for display)
- **Budget Selection**: Must handle budget ID resolution

### MCP Protocol Requirements
- **Tool Registration**: Auto-discovery via mcp-framework
- **Input Validation**: Zod schemas for runtime validation
- **Error Handling**: Consistent error response format
- **Logging**: Structured logging via framework

### Security Considerations
- **Token Security**: Never expose YNAB_API_TOKEN to LLM
- **Environment Variables**: Secure handling of sensitive data
- **Error Messages**: Avoid exposing internal details

## Dependencies

### Production Dependencies
```json
{
  "@types/axios": "^0.14.4",
  "axios": "^1.8.4", 
  "mcp-framework": "^0.1.29",
  "ynab": "^2.9.0"
}
```

### Development Dependencies
```json
{
  "@types/node": "^20.11.24",
  "@modelcontextprotocol/inspector": "^0.16.5",
  "@vitest/coverage-v8": "^3.2.4",
  "typescript": "^5.3.3",
  "vitest": "^3.2.4"
}
```

## Build Configuration

### TypeScript Configuration
- **Target**: ESNext with Node module resolution
- **Strict Mode**: Enabled for type safety
- **Output**: `./dist` directory
- **Base URL**: `./src` for clean imports
- **Exclusions**: Test files and node_modules

### Vitest Configuration
- **Environment**: Node.js
- **Coverage**: V8 provider with text/json/html reports
- **Test Pattern**: `**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}`

## Deployment

### Distribution
- **Binary**: `./dist/index.js` with executable permissions
- **Files**: Only `dist` directory included in npm package
- **CLI**: Available as `ynab-mcp-server` command

### Publishing
- **Registry**: npm
- **Version**: 0.1.2 (following semantic versioning)
- **Installation**: Available via npx or Smithery

## Development Workflow
1. Make changes to tools in `src/tools/`
2. Run `npm run build` to compile
3. Test with `npm test`
4. Debug with `npm run debug` if needed
5. Server auto-loads tools on startup
