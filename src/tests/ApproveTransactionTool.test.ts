import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import * as ynab from 'ynab';
import ApproveTransactionTool from '../tools/ApproveTransactionTool';

// Mock the entire ynab module
vi.mock('ynab');

// Mock the mcp-framework logger
vi.mock('mcp-framework', () => ({
  MCPTool: class {
    constructor() {}
  },
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('ApproveTransactionTool', () => {
  let tool: ApproveTransactionTool;
  let mockApi: {
    transactions: {
      getTransactionById: Mock;
      updateTransaction: Mock;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock API instance
    mockApi = {
      transactions: {
        getTransactionById: vi.fn(),
        updateTransaction: vi.fn(),
      },
    };

    // Mock the ynab.API constructor
    (ynab.API as any).mockImplementation(() => mockApi);

    // Set environment variables
    process.env.YNAB_API_TOKEN = 'test-token';
    process.env.YNAB_BUDGET_ID = 'test-budget-id';

    tool = new ApproveTransactionTool();
  });

  describe('execute', () => {
    const mockExistingTransaction = {
      id: 'transaction-123',
      account_id: 'account-456',
      payee_name: 'Test Payee',
      amount: -50000,
      approved: false,
    };

    const mockUpdatedTransaction = {
      id: 'transaction-123',
      account_id: 'account-456',
      payee_name: 'Test Payee',
      amount: -50000,
      approved: true,
    };

    it('should successfully approve a transaction with budget ID from input', async () => {
      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockUpdatedTransaction },
      });

      const input = {
        budgetId: 'custom-budget-id',
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(mockApi.transactions.getTransactionById).toHaveBeenCalledWith(
        'custom-budget-id',
        'transaction-123'
      );
      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
        'custom-budget-id',
        'transaction-123',
        {
          transaction: {
            approved: true,
          },
        }
      );
      expect(result).toEqual({
        success: true,
        transactionId: 'transaction-123',
        message: 'Transaction updated successfully',
      });
    });

    it('should successfully approve a transaction with budget ID from environment', async () => {
      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockUpdatedTransaction },
      });

      const input = {
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(mockApi.transactions.getTransactionById).toHaveBeenCalledWith(
        'test-budget-id',
        'transaction-123'
      );
      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'transaction-123',
        {
          transaction: {
            approved: true,
          },
        }
      );
      expect(result).toEqual({
        success: true,
        transactionId: 'transaction-123',
        message: 'Transaction updated successfully',
      });
    });

    it('should successfully disapprove a transaction', async () => {
      const mockDisapprovedTransaction = {
        ...mockExistingTransaction,
        approved: false,
      };

      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockDisapprovedTransaction },
      });

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'transaction-123',
        approved: false,
      };

      const result = await tool.execute(input);

      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'transaction-123',
        {
          transaction: {
            approved: false,
          },
        }
      );
      expect(result).toEqual({
        success: true,
        transactionId: 'transaction-123',
        message: 'Transaction updated successfully',
      });
    });

    it('should throw error when no budget ID is provided', async () => {
      // Clear environment budget ID
      delete process.env.YNAB_BUDGET_ID;
      tool = new ApproveTransactionTool();

      const input = {
        transactionId: 'transaction-123',
        approved: true,
      };

      await expect(tool.execute(input)).rejects.toThrow(
        'No budget ID provided. Please provide a budget ID or set the YNAB_BUDGET_ID environment variable.'
      );
    });

    it('should handle transaction not found error', async () => {
      // Setup mock to return no transaction
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: null },
      });

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'nonexistent-transaction',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(result).toMatch(/Error getting unapproved transactions: Transaction not found/);
    });

    it('should handle API error when getting existing transaction', async () => {
      // Setup mock to throw API error
      const apiError = new Error('API Error: Budget not found');
      mockApi.transactions.getTransactionById.mockRejectedValue(apiError);

      const input = {
        budgetId: 'invalid-budget-id',
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(result).toMatch(/Error getting unapproved transactions: API Error: Budget not found/);
    });

    it('should handle API error when updating transaction', async () => {
      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      
      const apiError = new Error('API Error: Transaction update failed');
      mockApi.transactions.updateTransaction.mockRejectedValue(apiError);

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(result).toMatch(/Error getting unapproved transactions: API Error: Transaction update failed/);
    });

    it('should handle case when update returns no transaction data', async () => {
      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: null },
      });

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(result).toMatch(/Error getting unapproved transactions: Failed to update transaction - no transaction data returned/);
    });

    it('should use default approved value of true when not specified', async () => {
      // Setup mocks
      mockApi.transactions.getTransactionById.mockResolvedValue({
        data: { transaction: mockExistingTransaction },
      });
      mockApi.transactions.updateTransaction.mockResolvedValue({
        data: { transaction: mockUpdatedTransaction },
      });

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'transaction-123',
        // approved not specified, should default to true
      };

      const result = await tool.execute(input);

      expect(mockApi.transactions.updateTransaction).toHaveBeenCalledWith(
        'test-budget-id',
        'transaction-123',
        {
          transaction: {
            approved: undefined, // Will be undefined since not specified in input
          },
        }
      );
      expect(result).toEqual({
        success: true,
        transactionId: 'transaction-123',
        message: 'Transaction updated successfully',
      });
    });

    it('should handle non-Error objects in catch block', async () => {
      // Setup mock to throw non-Error object
      const nonErrorObject = { message: 'Custom error object', code: 500 };
      mockApi.transactions.getTransactionById.mockRejectedValue(nonErrorObject);

      const input = {
        budgetId: 'test-budget-id',
        transactionId: 'transaction-123',
        approved: true,
      };

      const result = await tool.execute(input);

      expect(result).toMatch(/Error getting unapproved transactions: {"message":"Custom error object","code":500}/);
    });
  });

  describe('tool configuration', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('approve_transaction');
      expect(tool.description).toBe('Approves an existing transaction in your YNAB budget.');
    });

    it('should have correct schema definition', () => {
      expect(tool.schema).toHaveProperty('budgetId');
      expect(tool.schema).toHaveProperty('transactionId');
      expect(tool.schema).toHaveProperty('approved');
      
      expect(tool.schema.budgetId.description).toContain('budget containing the transaction');
      expect(tool.schema.transactionId.description).toContain('id of the transaction to approve');
      expect(tool.schema.approved.description).toContain('Whether the transaction should be marked as approved');
    });
  });
});