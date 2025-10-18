# Project Brief

## Project Overview
**YNAB MCP Server** - A Model Context Protocol (MCP) server that provides AI tools for interacting with YNAB (You Need A Budget) budgets. This project enables AI assistants to manage personal finances through natural language conversations.

## Core Requirements
- **Primary Goal**: Enable AI conversation-based interaction with YNAB budgets
- **Target Users**: Personal finance users who want to manage their budgets via AI
- **Integration**: Works with Claude Desktop and other MCP clients
- **Authentication**: Uses YNAB Personal Access Token (never exposed to LLM)

## Key Workflows to Enable
1. **First-time setup**: Prompt user to select budget from available budgets
2. **Manage overspent categories**: Identify and address budget issues
3. **Add new transactions**: Create transactions through natural language
4. **Approve transactions**: Review and approve pending transactions
5. **Check monthly spending vs income**: Financial health overview
6. **Auto-distribute funds**: Allocate "ready to assign" funds based on targets

## Expanded Tool Vision
The project now includes 17+ comprehensive MCP tools organized into 5 tiers:

### Tier 1: Core Workflow Automation
- **HandleOverspending**: Auto-resolve overspent categories
- **AutoDistributeFunds**: Smart allocation of "Ready to Assign" money
- **BulkApproveTransactions**: Batch approve transactions with filters
- **ReconcileAccount**: Bank statement reconciliation with CSV import

### Tier 2: Analytics & Insights
- **AnalyzeSpendingPatterns**: Detect trends and anomalies
- **GoalProgressReport**: Comprehensive goal tracking
- **CashFlowForecast**: Future balance projections
- **CategoryPerformanceReview**: Budget performance analysis

### Tier 3: Enhanced Category Management
- **MoveFundsBetweenCategories**: Transfer budgeted amounts
- **SetCategoryGoals**: Create/update category goals
- **BudgetFromHistory**: Auto-populate from historical data

### Tier 4: Transaction Intelligence
- **FindDuplicateTransactions**: Detect potential duplicates
- **SmartTransactionSearch**: Advanced search with natural language
- **CategorizePendingTransactions**: Auto-categorize based on history

### Tier 5: Specialized Tools
- **MonthEndCloseout**: Automated month-end checklist
- **PayeeSpendingReport**: Payee analysis and trends
- **ExportBudgetData**: Export in various formats

## Current State
- **Version**: 0.1.2
- **Status**: Functional with 5 core tools implemented
- **Framework**: Built with mcp-framework for MCP protocol handling
- **Language**: TypeScript with ESNext target
- **Testing**: Vitest with coverage reporting

## Success Criteria
- Seamless AI interaction with YNAB budgets
- Reliable transaction management
- Clear error handling and user feedback
- Comprehensive test coverage
- Easy installation and configuration

## Constraints
- Must work with YNAB API limitations and rate limits
- Token security is critical (never expose to LLM)
- Must maintain compatibility with MCP protocol
- Should handle network failures gracefully
