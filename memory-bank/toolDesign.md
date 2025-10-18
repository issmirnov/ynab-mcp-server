# YNAB MCP Tools Design

## Design Philosophy
Create tools that perform **units of meaningful work** rather than 1:1 API mappings. Each tool should automate a complete workflow or provide actionable insights that would otherwise require multiple API calls and manual logic.

## Proposed MCP Tools

### Tier 1: Core Workflow Automation (High Priority)

#### 1. HandleOverspending
**Purpose**: Automatically resolve overspent categories by moving funds from available sources
**Workflow**:
- Identify all overspent categories (negative balance) for specified month
- Find categories with positive balances that can contribute funds
- Suggest or automatically move funds based on priority rules (user preferences)
- Support natural language like "fix my overspending" or "cover grocery overspending from entertainment"

**Input**: `budgetId`, `month`, `strategy` (auto/suggest), optional `sourceCategories[]`, optional `targetCategories[]`
**Output**: List of suggested/completed moves with before/after balances

#### 2. AutoDistributeFunds
**Purpose**: Intelligently allocate "Ready to Assign" money based on category goals and priorities
**Workflow**:
- Check current "Ready to Assign" amount
- Identify underfunded goals (goal_under_funded > 0)
- Distribute funds based on: goal deadlines, goal types, user-defined priorities
- Support partial funding when insufficient money available

**Input**: `budgetId`, `month`, `strategy` (goals-first/proportional/custom), `maxAmount?`
**Output**: Distribution plan with category assignments and reasoning

#### 3. BulkApproveTransactions
**Purpose**: Approve multiple transactions matching criteria in one operation
**Workflow**:
- Fetch unapproved transactions with filters
- Support natural language patterns: "approve all grocery transactions" or "approve everything under $50"
- Batch approve matching transactions
- Return summary of approved vs skipped

**Input**: `budgetId`, `filters` (payee, category, amount range, date range, account)
**Output**: Summary of approved transactions with counts and totals

#### 4. ReconcileAccount
**Purpose**: Guide user through account reconciliation workflow with bank statement import
**Workflow**:
- Get current account balance from YNAB
- **Accept bank CSV export or text file** with transactions
- Parse common bank CSV formats (detect columns automatically or with hints)
- Match bank transactions to YNAB transactions (fuzzy matching on date, amount, payee)
- Identify unmatched transactions on both sides
- Suggest which YNAB transactions to clear based on bank records
- Detect missing transactions that need to be imported
- Support creating adjustment transaction if discrepancies remain

**Input**: `budgetId`, `accountId`, `bankData` (CSV text/file or manual balance), `asOfDate`, `csvFormat?` (auto-detect or specify)
**Output**: Reconciliation report with matched/unmatched transactions, suggested clears, missing imports

### Tier 2: Analytics & Insights (High Priority)

#### 5. AnalyzeSpendingPatterns
**Purpose**: Detect spending trends, anomalies, and provide insights across time periods
**Workflow**:
- Fetch transactions for specified period (with comparison period)
- Calculate spending by category with month-over-month or week-over-week changes
- Identify unusual spending (variance detection using statistical methods)
- Highlight top spending categories and payees
- Detect new or missing recurring transactions

**Input**: `budgetId`, `period` (current month, last 3 months, etc.), `compareWith?`, `categories[]?`
**Output**: Structured analysis with trends, anomalies, top spenders, recommendations

#### 6. GoalProgressReport
**Purpose**: Comprehensive view of all goals with progress tracking and projections
**Workflow**:
- Get all categories with goals
- Calculate progress percentage, funding needed, timeline to completion
- Identify at-risk goals (behind schedule)
- Project completion dates based on current funding rate
- Suggest funding adjustments to meet deadlines

**Input**: `budgetId`, `month?`, `goalTypes[]?`
**Output**: Goals grouped by status (on-track, at-risk, completed) with metrics and recommendations

#### 7. CashFlowForecast
**Purpose**: Project future account balances based on scheduled transactions and spending patterns
**Workflow**:
- Get all scheduled transactions
- Analyze historical spending patterns by category
- Project forward for specified timeframe (30/60/90 days)
- Identify potential low-balance periods
- Factor in recurring income and expenses

**Input**: `budgetId`, `accountId?`, `daysAhead` (default 30)
**Output**: Day-by-day or week-by-week projected balance with warning periods

#### 8. CategoryPerformanceReview
**Purpose**: Analyze how well categories are staying within budget over time
**Workflow**:
- Review multiple months of category activity
- Calculate on-budget percentage for each category
- Identify consistently over/under-budgeted categories
- Suggest budget adjustments based on actual spending patterns
- Detect seasonal patterns

**Input**: `budgetId`, `months` (number of months to analyze), `categoryIds[]?`
**Output**: Per-category performance metrics with budget adjustment suggestions

### Tier 3: Enhanced Category Management (Medium Priority)

#### 9. MoveFundsBetweenCategories
**Purpose**: Transfer budgeted amounts between categories with validation
**Workflow**:
- Validate source category has sufficient funds
- Support multiple simultaneous moves in one operation
- Update both source and target categories
- Provide clear before/after view
- Support natural language like "move $50 from dining to groceries"

**Input**: `budgetId`, `month`, `moves[]` (array of {fromCategoryId, toCategoryId, amount})
**Output**: Results of each move with updated balances

#### 10. SetCategoryGoals
**Purpose**: Create or update category goals with intelligent defaults
**Workflow**:
- Support all goal types (TB, TBD, MF, NEED)
- Validate goal parameters (dates, amounts, cadence)
- Calculate required monthly funding
- Optionally fund immediately
- Support natural language: "set grocery goal to $500/month"

**Input**: `budgetId`, `categoryId`, `goalType`, `targetAmount`, `targetDate?`, `cadence?`
**Output**: Created/updated goal with funding recommendations

#### 11. BudgetFromHistory
**Purpose**: Auto-populate budget amounts based on historical spending
**Workflow**:
- Analyze spending for specified categories over past N months
- Calculate average, median, or 90th percentile spending
- Apply calculated amounts to current/future month budget
- Allow adjustment multipliers (e.g., 110% of average)

**Input**: `budgetId`, `month`, `lookbackMonths`, `method` (average/median/percentile), `categories[]?`
**Output**: Budget adjustments with historical data and rationale

### Tier 4: Transaction Intelligence (Medium Priority)

#### 12. FindDuplicateTransactions
**Purpose**: Identify potentially duplicate transactions
**Workflow**:
- Search for transactions with same/similar amounts within date window
- Compare payees (exact and fuzzy matching)
- Detect import duplicates (same import_id)
- Group suspicious pairs/sets
- Support auto-deletion or flagging

**Input**: `budgetId`, `dateRange?`, `accountId?`, `threshold` (similarity %)
**Output**: Grouped potential duplicates with confidence scores

#### 13. SmartTransactionSearch
**Purpose**: Advanced transaction search with natural language support
**Workflow**:
- Support complex queries: "coffee purchases over $5 last month"
- Combine multiple filters (payee, category, amount, date, memo)
- Fuzzy matching for payees
- Return formatted results with totals
- Support date expressions (last week, this month, Q1 2024)

**Input**: `budgetId`, `query` (natural language or structured), `limit?`
**Output**: Matching transactions with totals and groupings

#### 14. CategorizePendingTransactions
**Purpose**: Auto-categorize unapproved transactions based on history and rules
**Workflow**:
- Get all unapproved transactions
- Match payees to historical category usage
- Apply user-defined rules (if implemented)
- Suggest categories with confidence scores
- Support bulk application of suggestions

**Input**: `budgetId`, `autoApply?`, `minConfidence?`
**Output**: Categorization suggestions or applied changes

### Tier 5: Specialized Tools (Lower Priority)

#### 15. MonthEndCloseout
**Purpose**: Automated month-end checklist and cleanup
**Workflow**:
- Check for unapproved transactions
- Identify uncategorized transactions
- List uncleared transactions older than X days
- Check "Ready to Assign" balance
- Verify all goals are appropriately funded
- Generate month summary report

**Input**: `budgetId`, `month?`
**Output**: Comprehensive month-end report with action items

#### 16. PayeeSpendingReport
**Purpose**: Analyze spending by payee over time
**Workflow**:
- Get all transactions for specified payee(s)
- Calculate totals by time period
- Show category distribution for payee
- Identify spending frequency and patterns
- Compare across similar payees

**Input**: `budgetId`, `payeeIds[]`, `dateRange`
**Output**: Per-payee analysis with trends and insights

#### 17. ExportBudgetData
**Purpose**: Export budget data in various formats for external analysis
**Workflow**:
- Fetch comprehensive budget data (transactions, categories, accounts)
- Format for specified output (CSV, JSON, custom)
- Support date ranges and filters
- Include computed fields (balances, trends)

**Input**: `budgetId`, `format`, `dateRange`, `includeData[]`
**Output**: Formatted export data or file reference

## Implementation Priorities

### Phase 1 (Immediate - Core Automation)
1. HandleOverspending
2. AutoDistributeFunds  
3. BulkApproveTransactions
4. MoveFundsBetweenCategories

### Phase 2 (Next - Analytics)
5. AnalyzeSpendingPatterns
6. GoalProgressReport
7. CategoryPerformanceReview
8. ReconcileAccount

### Phase 3 (Future - Enhanced Intelligence)
9. CashFlowForecast
10. FindDuplicateTransactions
11. SmartTransactionSearch
12. BudgetFromHistory

### Phase 4 (Nice-to-Have)
13. SetCategoryGoals
14. CategorizePendingTransactions
15. MonthEndCloseout
16. PayeeSpendingReport
17. ExportBudgetData

## Future Enhancements to Consider
- Payee intelligence and learning (auto-categorization improvements)
- Budget templates and scenarios (what-if analysis)
- Debt payoff optimization tools
- Savings goal prioritization
- Multi-budget comparison tools
- Budget sharing/collaboration features
- Integration with external data sources (bank feeds, investment accounts)

## Technical Considerations

### Natural Language Processing
- Support flexible date expressions ("last month", "Q1", "past 3 months")
- Accept category/payee/account names (not just IDs)
- Allow amount expressions ("under $50", "between $100 and $200")
- Implement fuzzy matching for names

### Performance Optimization
- Cache frequently accessed data (budget structure, categories)
- Batch API calls where possible
- Implement delta requests for large datasets
- Consider rate limiting handling

### Error Handling
- Validate all inputs before API calls
- Provide actionable error messages
- Handle partial failures in batch operations
- Support dry-run mode for destructive operations

### Data Privacy
- Never log sensitive financial data
- Sanitize error messages
- Respect YNAB API token security practices
