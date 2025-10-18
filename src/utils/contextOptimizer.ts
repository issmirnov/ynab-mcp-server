/**
 * Context Optimization Utilities
 * 
 * This module provides utilities to reduce context bloat in tool outputs
 * by implementing smart summarization, pagination, and data compression.
 */

export interface ContextOptimizationOptions {
  maxItems?: number;
  maxTokens?: number;
  includeDetails?: boolean;
  summarizeCategories?: boolean;
  summarizeAccounts?: boolean;
  summarizeTransactions?: boolean;
  prioritizeByActivity?: boolean;
}

export interface OptimizedCategory {
  id: string;
  name: string;
  bal: number;        // balance_dollars -> bal
  bud: number;        // budgeted_dollars -> bud
  act: number;        // activity_dollars -> act
  grp?: string;       // category_group -> grp
}

export interface OptimizedAccount {
  id: string;
  name: string;
  type: string;
  bal: number;        // balance_dollars -> bal
  on_budget: boolean;
}

export interface OptimizedTransaction {
  id: string;
  date: string;
  amt: number;        // amount_dollars -> amt
  payee: string;      // payee_name -> payee
  cat?: string;       // category_name -> cat
  acc?: string;       // account_name -> acc
  memo?: string;
}

/**
 * Optimize category data for context efficiency - COMPRESS rather than LIMIT
 */
export function optimizeCategories(
  categories: any[],
  options: ContextOptimizationOptions = {}
): OptimizedCategory[] {
  const { includeDetails = false, prioritizeByActivity = false } = options;
  
  let sortedCategories = categories;
  
  // If prioritizing by activity, sort by absolute activity value (most active first)
  if (prioritizeByActivity) {
    sortedCategories = [...categories].sort((a, b) => {
      const aActivity = Math.abs(a.activity || 0);
      const bActivity = Math.abs(b.activity || 0);
      return bActivity - aActivity; // Descending order
    });
  }
  
  // Return ALL categories but in compressed format
  return sortedCategories.map(cat => ({
    id: cat.id,
    name: cat.name,
    bal: Math.round((cat.balance / 1000) * 100) / 100,        // "balance" -> "bal"
    bud: Math.round((cat.budgeted / 1000) * 100) / 100,      // "budgeted" -> "bud"
    act: Math.round((cat.activity / 1000) * 100) / 100,      // "activity" -> "act"
    ...(includeDetails && { grp: cat.category_group_name })   // "category_group" -> "grp"
  }));
}

/**
 * Optimize account data for context efficiency - COMPRESS rather than LIMIT
 */
export function optimizeAccounts(
  accounts: any[],
  options: ContextOptimizationOptions = {}
): OptimizedAccount[] {
  const { includeDetails = false } = options;
  
  // Return ALL accounts but in compressed format
  return accounts.map(acc => ({
    id: acc.id,
    name: acc.name,
    type: acc.type,
    bal: Math.round((acc.balance / 1000) * 100) / 100,        // "balance_dollars" -> "bal"
    on_budget: acc.on_budget
  }));
}

/**
 * Optimize transaction data for context efficiency - COMPRESS rather than LIMIT
 */
export function optimizeTransactions(
  transactions: any[],
  options: ContextOptimizationOptions = {}
): OptimizedTransaction[] {
  const { includeDetails = false } = options;
  
  // Return ALL transactions but in compressed format
  return transactions.map(txn => ({
    id: txn.id,
    date: txn.date,
    amt: Math.round((txn.amount / 1000) * 100) / 100,          // "amount_dollars" -> "amt"
    payee: txn.payee_name || 'Unknown',                        // "payee_name" -> "payee"
    ...(includeDetails && {
      cat: txn.category_name,                                  // "category_name" -> "cat"
      acc: txn.account_name,                                   // "account_name" -> "acc"
      memo: txn.memo
    })
  }));
}

/**
 * Create a summary object that reduces context usage
 */
export function createSummary(
  data: any,
  options: ContextOptimizationOptions = {}
): any {
  const { maxTokens = 2000 } = options;
  
  // If data is already small enough, return as-is
  const dataString = JSON.stringify(data);
  if (dataString.length <= maxTokens) {
    return data;
  }
  
  // Create a compressed summary
  const summary: any = {
    _summary: true,
    _total_items: Array.isArray(data) ? data.length : Object.keys(data).length,
    _truncated: true
  };
  
  if (Array.isArray(data)) {
    // For arrays, show first few items and summary stats
    summary.items = data.slice(0, 5);
    summary._showing_first = 5;
    summary._total_count = data.length;
  } else {
    // For objects, show key fields only
    const keyFields = Object.keys(data).slice(0, 10);
    keyFields.forEach(key => {
      summary[key] = data[key];
    });
    summary._showing_fields = keyFields;
    summary._total_fields = Object.keys(data).length;
  }
  
  return summary;
}

/**
 * Estimate token count for a given object
 */
export function estimateTokenCount(obj: any): number {
  const jsonString = JSON.stringify(obj);
  // Rough estimate: 1 token ≈ 4 characters for English text
  return Math.ceil(jsonString.length / 4);
}

/**
 * Smart pagination for large datasets
 */
export function paginateData<T>(
  data: T[],
  page: number = 1,
  pageSize: number = 20
): { items: T[]; pagination: { page: number; pageSize: number; total: number; hasMore: boolean } } {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  return {
    items: data.slice(startIndex, endIndex),
    pagination: {
      page,
      pageSize,
      total: data.length,
      hasMore: endIndex < data.length
    }
  };
}

/**
 * Create a context-efficient response
 */
export function createOptimizedResponse(
  data: any,
  options: ContextOptimizationOptions = {}
): { content: Array<{ type: string; text: string }> } {
  const optimized = createSummary(data, options);
  const tokenCount = estimateTokenCount(optimized);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          ...optimized,
          _context_info: {
            estimated_tokens: tokenCount,
            optimized: tokenCount > 1000,
            note: tokenCount > 1000 ? "Response optimized for context efficiency. Use specific queries for detailed data." : undefined
          }
        }, null, 2)
      }
    ]
  };
}

/**
 * Context-aware tool response wrapper
 */
export function withContextOptimization<T>(
  data: T,
  options: ContextOptimizationOptions = {}
): { content: Array<{ type: string; text: string }> } {
  const tokenCount = estimateTokenCount(data);
  
  if (tokenCount <= (options.maxTokens || 2000)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }
  
  return createOptimizedResponse(data, options);
}
