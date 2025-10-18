# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2024-03-26

### Added
- **9 New Comprehensive Tools** expanding from 5 to 14 total tools:
  - **HandleOverspendingTool**: Automatically resolve overspent categories by moving funds
  - **AutoDistributeFundsTool**: Intelligently allocate "Ready to Assign" money based on goals
  - **BulkApproveTransactionsTool**: Approve multiple transactions matching criteria in one call
  - **MoveFundsBetweenCategoriesTool**: Transfer budgeted amounts between categories
  - **AnalyzeSpendingPatternsTool**: Analyze spending patterns to detect trends and anomalies
  - **GoalProgressReportTool**: Generate comprehensive goal progress reports with performance ratings
  - **CashFlowForecastTool**: Generate cash flow projections based on historical patterns
  - **CategoryPerformanceReviewTool**: Review category budget performance with ratings and recommendations
  - **NetWorthAnalysisTool**: Analyze current net worth across all accounts

### Changed
- **Migrated to Official MCP SDK**: Upgraded from mcp-framework to @modelcontextprotocol/sdk v1.20.1
- **Updated Architecture**: Manual tool registration with proper MCP protocol handling
- **Enhanced Error Handling**: Consistent MCP content array format across all tools
- **Improved Test Suite**: Updated all 69 tests to work with new SDK response format
- **Updated Documentation**: Comprehensive README with all 14 tools documented
- **Added Project Credits**: Proper attribution to original work by Caleb LeNoir

### Technical Improvements
- **Type Safety**: Enhanced TypeScript integration with official MCP SDK types
- **Build System**: Updated to use official SDK without mcp-build dependency
- **Server Implementation**: Complete rewrite using official Server class and request handlers
- **Protocol Compliance**: Full MCP protocol compliance with proper request/response handling

### Fixed
- **Test Compatibility**: All tests now work with new SDK content array format
- **Error Responses**: Consistent error handling across all tools
- **Documentation**: Updated all references to reflect current architecture

## [0.1.1] - 2024-03-25

### Added
- New `ApproveTransaction` tool for approving existing transactions in YNAB
  - Can approve/unapprove transactions by ID
  - Works in conjunction with GetUnapprovedTransactions tool
  - Preserves existing transaction data when updating approval status
- Added Cursor rules for YNAB API development
  - New `.cursor/rules/ynabapi.mdc` file
  - Provides guidance for working with YNAB types and API endpoints
  - Helps maintain consistency in tool development

### Changed
- Updated project structure documentation to include `.cursor/rules` directory
- Enhanced README with documentation for the new ApproveTransaction tool 