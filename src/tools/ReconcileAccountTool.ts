import * as ynab from "ynab";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { handleAPIError, createRetryableAPICall } from "../utils/apiErrorHandler.js";

interface ReconcileAccountInput {
  budgetId?: string;
  accountId?: string;
  accountName?: string;
  statementData?: string; // CSV data as string
  statementBalance?: number; // Statement ending balance in dollars
  statementDate?: string; // Statement date in YYYY-MM-DD format
  tolerance?: number; // Tolerance for matching amounts in dollars (default: 0.01)
  dryRun?: boolean;
}

interface TransactionMatch {
  ynab_transaction_id?: string;
  ynab_date: string;
  ynab_amount: number;
  ynab_payee: string;
  ynab_memo: string;
  statement_amount?: number;
  statement_date?: string;
  statement_description?: string;
  match_type: 'exact' | 'fuzzy' | 'unmatched';
  confidence: number; // 0-1, higher = more confident match
  discrepancy?: number; // Amount difference if fuzzy match
}

interface ReconciliationResult {
  account_id: string;
  account_name: string;
  statement_balance: number;
  ynab_balance: number;
  balance_difference: number;
  statement_date: string;
  reconciliation_date: string;
  total_ynab_transactions: number;
  total_statement_transactions: number;
  exact_matches: number;
  fuzzy_matches: number;
  unmatched_ynab: number;
  unmatched_statement: number;
  matches: TransactionMatch[];
  discrepancies: {
    type: 'missing_ynab' | 'missing_statement' | 'amount_mismatch' | 'date_mismatch';
    description: string;
    amount?: number;
    transaction_id?: string;
  }[];
  summary: {
    reconciliation_status: 'balanced' | 'unbalanced' | 'needs_review';
    confidence_score: number;
    total_discrepancies: number;
    largest_discrepancy: number;
    recommendations: string[];
  };
  note: string;
}

export default class ReconcileAccountTool {
  private api: ynab.API;
  private budgetId?: string;

  constructor(budgetId?: string, ynabApi?: ynab.API) {
    this.api = ynabApi || new ynab.API(process.env.YNAB_API_TOKEN || "");
    this.budgetId = budgetId || process.env.YNAB_BUDGET_ID;
  }

  getToolDefinition(): Tool {
    return {
      name: "reconcile_account",
      description: "Reconcile a YNAB account with bank statement data. Compares YNAB transactions with statement transactions to identify discrepancies, missing transactions, and balance differences. Supports CSV statement data import.",
      inputSchema: {
        type: "object",
        properties: {
          budgetId: {
            type: "string",
            description: "The ID of the budget to reconcile (optional, defaults to the budget set in the YNAB_BUDGET_ID environment variable)",
          },
          accountId: {
            type: "string",
            description: "The ID of the account to reconcile (optional if accountName is provided)",
          },
          accountName: {
            type: "string",
            description: "The name of the account to reconcile (optional if accountId is provided). Supports partial matching.",
          },
          statementData: {
            type: "string",
            description: "CSV data from bank statement. Expected format: Date,Description,Amount (one transaction per line)",
          },
          statementBalance: {
            type: "number",
            description: "The ending balance from the bank statement in dollars (e.g., 1234.56)",
          },
          statementDate: {
            type: "string",
            description: "The statement date in YYYY-MM-DD format (e.g., '2024-03-31')",
          },
          tolerance: {
            type: "number",
            description: "Tolerance for matching amounts in dollars (default: 0.01)",
            default: 0.01,
          },
          dryRun: {
            type: "boolean",
            description: "If true, will analyze and show discrepancies without making any changes",
            default: false,
          },
        },
        required: ["statementData", "statementBalance", "statementDate"],
      },
    };
  }

  async execute(input: ReconcileAccountInput): Promise<{ content: Array<{ type: string; text: string }> }> {
    const budgetId = input.budgetId || this.budgetId;
    if (!budgetId) {
      throw new Error("No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable. Use the ListBudgets tool to get a list of available budgets.");
    }

    if (!input.statementData || !input.statementBalance || !input.statementDate) {
      throw new Error("Missing required parameters: statementData, statementBalance, and statementDate are required.");
    }

    try {
      // Get all accounts
      const accountsResponse = await createRetryableAPICall(
        () => this.api.accounts.getAccounts(budgetId),
        'Get accounts for reconciliation'
      );
      const allAccounts = accountsResponse.data.accounts.filter(
        (account: any) => !account.deleted && !account.closed
      );

      // Find the target account
      let targetAccount: any = null;
      if (input.accountId) {
        targetAccount = allAccounts.find((account: any) => account.id === input.accountId);
      } else if (input.accountName) {
        // Try exact match first
        targetAccount = allAccounts.find((account: any) => 
          account.name.toLowerCase() === input.accountName!.toLowerCase()
        );
        // If no exact match, try partial match
        if (!targetAccount) {
          targetAccount = allAccounts.find((account: any) => 
            account.name.toLowerCase().includes(input.accountName!.toLowerCase())
          );
        }
      }

      if (!targetAccount) {
        throw new Error(`Account not found. Please provide a valid accountId or accountName. Use the budget_summary tool to see available accounts.`);
      }

      // Parse statement data
      const statementTransactions = this.parseStatementData(input.statementData);
      
      // Get YNAB transactions for the account
      const ynabTransactions = await this.getYNABTransactions(budgetId, targetAccount.id, input.statementDate);

      // Perform reconciliation
      const matches = this.matchTransactions(ynabTransactions, statementTransactions, input.tolerance || 0.01);
      
      // Calculate balances and discrepancies
      const ynabBalance = targetAccount.balance / 1000; // Convert to dollars
      const statementBalance = input.statementBalance;
      const balanceDifference = ynabBalance - statementBalance;

      // Analyze matches and create discrepancies
      const discrepancies = this.analyzeDiscrepancies(matches, ynabTransactions, statementTransactions);
      
      // Generate summary and recommendations
      const summary = this.generateSummary(matches, discrepancies, balanceDifference, input.tolerance || 0.01);

      const result: ReconciliationResult = {
        account_id: targetAccount.id,
        account_name: targetAccount.name,
        statement_balance: statementBalance,
        ynab_balance: ynabBalance,
        balance_difference: balanceDifference,
        statement_date: input.statementDate,
        reconciliation_date: new Date().toISOString().split('T')[0],
        total_ynab_transactions: ynabTransactions.length,
        total_statement_transactions: statementTransactions.length,
        exact_matches: matches.filter(m => m.match_type === 'exact').length,
        fuzzy_matches: matches.filter(m => m.match_type === 'fuzzy').length,
        unmatched_ynab: matches.filter(m => m.match_type === 'unmatched' && m.ynab_transaction_id).length,
        unmatched_statement: matches.filter(m => m.match_type === 'unmatched' && !m.ynab_transaction_id).length,
        matches: matches,
        discrepancies: discrepancies,
        summary: summary,
        note: "All amounts are in dollars. This reconciliation compares YNAB transactions with bank statement data to identify discrepancies and missing transactions.",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };

    } catch (error) {
      await handleAPIError(error, 'Account reconciliation');
      throw error; // This line will never be reached, but satisfies TypeScript
    }
  }

  private parseStatementData(csvData: string): Array<{date: string, description: string, amount: number}> {
    const lines = csvData.trim().split('\n');
    const transactions: Array<{date: string, description: string, amount: number}> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Skip header row if it looks like a header
      if (i === 0 && (line.toLowerCase().includes('date') || line.toLowerCase().includes('description'))) {
        continue;
      }

      // Parse CSV line (simple comma-separated)
      const parts = line.split(',').map(part => part.trim().replace(/^["']|["']$/g, ''));
      
      if (parts.length >= 3) {
        try {
          const date = this.parseDate(parts[0]);
          const description = parts[1];
          const amount = parseFloat(parts[2].replace(/[$,]/g, ''));

          if (!isNaN(amount) && date) {
            transactions.push({
              date: date,
              description: description,
              amount: amount
            });
          }
        } catch (error) {
          console.warn(`Failed to parse line ${i + 1}: ${line}`);
        }
      }
    }

    return transactions;
  }

  private parseDate(dateStr: string): string | null {
    try {
      // Try various date formats
      const formats = [
        /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
        /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
        /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // M/D/YYYY
      ];

      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          if (format.source.includes('YYYY')) {
            // YYYY-MM-DD format
            return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
          } else {
            // MM/DD/YYYY or MM-DD-YYYY format
            return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          }
        }
      }

      // Try parsing as Date object
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async getYNABTransactions(budgetId: string, accountId: string, statementDate: string): Promise<any[]> {
    try {
      // Get transactions for the account up to the statement date
      const endDate = new Date(statementDate);
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - 3); // Get 3 months of data

      const transactionsResponse = await createRetryableAPICall(
        () => this.api.transactions.getTransactionsByAccount(
          budgetId,
          accountId,
          startDate.toISOString().split('T')[0]
        ),
        'Get transactions for reconciliation'
      );

      return transactionsResponse.data.transactions.filter((t: any) => !t.deleted);
    } catch (error) {
      console.error('Error fetching YNAB transactions:', error);
      return [];
    }
  }

  private matchTransactions(ynabTransactions: any[], statementTransactions: Array<{date: string, description: string, amount: number}>, tolerance: number): TransactionMatch[] {
    const matches: TransactionMatch[] = [];
    const usedYNAB = new Set<string>();
    const usedStatement = new Set<number>();

    // First pass: exact matches
    for (const ynabTxn of ynabTransactions) {
      for (let i = 0; i < statementTransactions.length; i++) {
        const stmtTxn = statementTransactions[i];
        
        if (usedStatement.has(i)) continue;

        const ynabAmount = ynabTxn.amount / 1000; // Convert to dollars
        const amountDiff = Math.abs(ynabAmount - stmtTxn.amount);
        const dateDiff = Math.abs(new Date(ynabTxn.date).getTime() - new Date(stmtTxn.date).getTime());
        const daysDiff = dateDiff / (1000 * 60 * 60 * 24);

        // Exact match: same amount and date within 1 day
        if (amountDiff <= tolerance && daysDiff <= 1) {
          matches.push({
            ynab_transaction_id: ynabTxn.id,
            ynab_date: ynabTxn.date,
            ynab_amount: ynabAmount,
            ynab_payee: ynabTxn.payee_name || 'Unknown',
            ynab_memo: ynabTxn.memo || '',
            statement_amount: stmtTxn.amount,
            statement_date: stmtTxn.date,
            statement_description: stmtTxn.description,
            match_type: 'exact',
            confidence: 1.0,
          });
          usedYNAB.add(ynabTxn.id);
          usedStatement.add(i);
          break;
        }
      }
    }

    // Second pass: fuzzy matches
    for (const ynabTxn of ynabTransactions) {
      if (usedYNAB.has(ynabTxn.id)) continue;

      for (let i = 0; i < statementTransactions.length; i++) {
        const stmtTxn = statementTransactions[i];
        
        if (usedStatement.has(i)) continue;

        const ynabAmount = ynabTxn.amount / 1000;
        const amountDiff = Math.abs(ynabAmount - stmtTxn.amount);
        const dateDiff = Math.abs(new Date(ynabTxn.date).getTime() - new Date(stmtTxn.date).getTime());
        const daysDiff = dateDiff / (1000 * 60 * 60 * 24);

        // Fuzzy match: amount within tolerance and date within 7 days
        if (amountDiff <= tolerance * 10 && daysDiff <= 7) {
          const confidence = this.calculateMatchConfidence(ynabTxn, stmtTxn, amountDiff, daysDiff);
          
          if (confidence > 0.5) {
            matches.push({
              ynab_transaction_id: ynabTxn.id,
              ynab_date: ynabTxn.date,
              ynab_amount: ynabAmount,
              ynab_payee: ynabTxn.payee_name || 'Unknown',
              ynab_memo: ynabTxn.memo || '',
              statement_amount: stmtTxn.amount,
              statement_date: stmtTxn.date,
              statement_description: stmtTxn.description,
              match_type: 'fuzzy',
              confidence: confidence,
              discrepancy: amountDiff,
            });
            usedYNAB.add(ynabTxn.id);
            usedStatement.add(i);
            break;
          }
        }
      }
    }

    // Third pass: unmatched YNAB transactions
    for (const ynabTxn of ynabTransactions) {
      if (!usedYNAB.has(ynabTxn.id)) {
        matches.push({
          ynab_transaction_id: ynabTxn.id,
          ynab_date: ynabTxn.date,
          ynab_amount: ynabTxn.amount / 1000,
          ynab_payee: ynabTxn.payee_name || 'Unknown',
          ynab_memo: ynabTxn.memo || '',
          match_type: 'unmatched',
          confidence: 0,
        });
      }
    }

    // Fourth pass: unmatched statement transactions
    for (let i = 0; i < statementTransactions.length; i++) {
      if (!usedStatement.has(i)) {
        const stmtTxn = statementTransactions[i];
        matches.push({
          ynab_date: '',
          ynab_amount: 0,
          ynab_payee: '',
          ynab_memo: '',
          statement_amount: stmtTxn.amount,
          statement_date: stmtTxn.date,
          statement_description: stmtTxn.description,
          match_type: 'unmatched',
          confidence: 0,
        });
      }
    }

    return matches;
  }

  private calculateMatchConfidence(ynabTxn: any, stmtTxn: {date: string, description: string, amount: number}, amountDiff: number, daysDiff: number): number {
    let confidence = 1.0;

    // Reduce confidence based on amount difference
    confidence -= Math.min(amountDiff / 10, 0.3); // Max 30% reduction for amount

    // Reduce confidence based on date difference
    confidence -= Math.min(daysDiff / 10, 0.3); // Max 30% reduction for date

    // Reduce confidence based on description similarity (simple check)
    const ynabDesc = (ynabTxn.payee_name || '').toLowerCase();
    const stmtDesc = stmtTxn.description.toLowerCase();
    const commonWords = this.getCommonWords(ynabDesc, stmtDesc);
    if (commonWords.length === 0) {
      confidence -= 0.2; // 20% reduction if no common words
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private getCommonWords(str1: string, str2: string): string[] {
    const words1 = str1.split(/\s+/).filter(w => w.length > 2);
    const words2 = str2.split(/\s+/).filter(w => w.length > 2);
    return words1.filter(word => words2.includes(word));
  }

  private analyzeDiscrepancies(matches: TransactionMatch[], ynabTransactions: any[], statementTransactions: Array<{date: string, description: string, amount: number}>): Array<{type: 'missing_ynab' | 'missing_statement' | 'amount_mismatch' | 'date_mismatch', description: string, amount?: number, transaction_id?: string}> {
    const discrepancies: Array<{type: 'missing_ynab' | 'missing_statement' | 'amount_mismatch' | 'date_mismatch', description: string, amount?: number, transaction_id?: string}> = [];

    // Find unmatched YNAB transactions
    const unmatchedYNAB = matches.filter(m => m.match_type === 'unmatched' && m.ynab_transaction_id);
    for (const match of unmatchedYNAB) {
      discrepancies.push({
        type: 'missing_statement',
        description: `YNAB transaction not found in statement: ${match.ynab_payee} - $${match.ynab_amount.toFixed(2)} on ${match.ynab_date}`,
        amount: match.ynab_amount,
        transaction_id: match.ynab_transaction_id,
      });
    }

    // Find unmatched statement transactions
    const unmatchedStatement = matches.filter(m => m.match_type === 'unmatched' && !m.ynab_transaction_id);
    for (const match of unmatchedStatement) {
      discrepancies.push({
        type: 'missing_ynab',
        description: `Statement transaction not found in YNAB: ${match.statement_description} - $${match.statement_amount?.toFixed(2)} on ${match.statement_date}`,
        amount: match.statement_amount,
      });
    }

    // Find amount mismatches
    const fuzzyMatches = matches.filter(m => m.match_type === 'fuzzy' && m.discrepancy && m.discrepancy > 0.01);
    for (const match of fuzzyMatches) {
      discrepancies.push({
        type: 'amount_mismatch',
        description: `Amount mismatch: YNAB $${match.ynab_amount.toFixed(2)} vs Statement $${match.statement_amount?.toFixed(2)} (diff: $${match.discrepancy?.toFixed(2)})`,
        amount: match.discrepancy,
        transaction_id: match.ynab_transaction_id,
      });
    }

    return discrepancies;
  }

  private generateSummary(matches: TransactionMatch[], discrepancies: Array<{type: 'missing_ynab' | 'missing_statement' | 'amount_mismatch' | 'date_mismatch', description: string, amount?: number, transaction_id?: string}>, balanceDifference: number, tolerance: number): {reconciliation_status: 'balanced' | 'unbalanced' | 'needs_review', confidence_score: number, total_discrepancies: number, largest_discrepancy: number, recommendations: string[]} {
    const exactMatches = matches.filter(m => m.match_type === 'exact').length;
    const fuzzyMatches = matches.filter(m => m.match_type === 'fuzzy').length;
    const totalMatches = exactMatches + fuzzyMatches;
    const totalTransactions = matches.length;

    // Calculate confidence score
    const confidenceScore = totalTransactions > 0 ? totalMatches / totalTransactions : 0;

    // Determine reconciliation status
    let reconciliationStatus: 'balanced' | 'unbalanced' | 'needs_review';
    if (Math.abs(balanceDifference) <= tolerance && discrepancies.length === 0) {
      reconciliationStatus = 'balanced';
    } else if (discrepancies.length <= 2 && Math.abs(balanceDifference) <= 10) {
      reconciliationStatus = 'needs_review';
    } else {
      reconciliationStatus = 'unbalanced';
    }

    // Find largest discrepancy
    const largestDiscrepancy = Math.max(
      ...discrepancies.map(d => Math.abs(d.amount || 0)),
      Math.abs(balanceDifference)
    );

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (reconciliationStatus === 'balanced') {
      recommendations.push('Account is fully reconciled - no action needed');
    } else {
      if (Math.abs(balanceDifference) > tolerance) {
        recommendations.push(`Balance difference of $${balanceDifference.toFixed(2)} needs investigation`);
      }
      
      const missingYNAB = discrepancies.filter(d => d.type === 'missing_ynab').length;
      const missingStatement = discrepancies.filter(d => d.type === 'missing_statement').length;
      
      if (missingYNAB > 0) {
        recommendations.push(`${missingYNAB} statement transactions need to be added to YNAB`);
      }
      
      if (missingStatement > 0) {
        recommendations.push(`${missingStatement} YNAB transactions may need to be removed or marked as pending`);
      }
      
      if (confidenceScore < 0.8) {
        recommendations.push('Low confidence in transaction matching - manual review recommended');
      }
    }

    return {
      reconciliation_status: reconciliationStatus,
      confidence_score: confidenceScore,
      total_discrepancies: discrepancies.length,
      largest_discrepancy: largestDiscrepancy,
      recommendations: recommendations,
    };
  }
}
