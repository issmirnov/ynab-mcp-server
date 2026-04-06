import { describe, it, expect, vi } from 'vitest';
import UpdateTransactionTool from '../src/tools/UpdateTransactionTool';

function createMockApi(mockFns: Record<string, any>) {
  return {
    transactions: mockFns,
  } as any;
}

const mockExistingTransaction = {
  id: 'txn-123',
  account_id: 'account-456',
  account_name: 'Checking',
  payee_id: 'payee-1',
  payee_name: 'Amazon',
  amount: -42500,
  category_id: 'cat-1',
  category_name: 'Shopping',
  memo: 'Household supplies',
  date: '2024-03-15',
  approved: false,
  cleared: 'uncleared',
  flag_color: null,
  flag_name: null,
  deleted: false,
  subtransactions: [],
};

describe('UpdateTransactionTool', () => {
  function createTool(overrides?: Record<string, any>) {
    const getTransactionById = vi.fn(async () => ({
      data: { transaction: mockExistingTransaction },
    }));
    const updateTransaction = vi.fn(async (_budgetId: string, _id: string, wrapper: any) => ({
      data: {
        transaction: {
          ...mockExistingTransaction,
          ...wrapper.transaction,
          account_name: 'Checking',
          payee_name: wrapper.transaction.payee_name ?? mockExistingTransaction.payee_name,
          category_name: wrapper.transaction.category_id === mockExistingTransaction.category_id || !wrapper.transaction.category_id
            ? mockExistingTransaction.category_name
            : 'New Category',
        },
      },
    }));
    const api = createMockApi({
      getTransactionById,
      updateTransaction,
      ...overrides,
    });
    const tool = new UpdateTransactionTool({
      ynabApi: api,
      budgetId: 'test-budget-id',
    });
    return { tool, getTransactionById, updateTransaction };
  }

  describe('execute', () => {
    it('should update amount on a transaction', async () => {
      const updateTransaction = vi.fn(async () => ({
        data: {
          transaction: { ...mockExistingTransaction, amount: -19990 },
        },
      }));
      const { tool } = createTool({ updateTransaction });

      const result = await tool.execute({
        transactionId: 'txn-123',
        amount: -19.99,
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.amount).toBe(-19.99);
    });

    it('should only send changed fields to the API', async () => {
      const { tool, updateTransaction } = createTool();

      await tool.execute({
        transactionId: 'txn-123',
        memo: 'Updated memo',
      });

      const sentTransaction = updateTransaction.mock.calls[0][2].transaction;
      // Should only have memo, not all fields
      expect(sentTransaction.memo).toBe('Updated memo');
      expect(sentTransaction.amount).toBeUndefined();
      expect(sentTransaction.date).toBeUndefined();
    });

    it('should null out payee_id when payeeName is provided without payeeId', async () => {
      const { tool, updateTransaction } = createTool();

      await tool.execute({
        transactionId: 'txn-123',
        payeeName: 'New Payee',
      });

      const sentTransaction = updateTransaction.mock.calls[0][2].transaction;
      expect(sentTransaction.payee_id).toBeNull();
      expect(sentTransaction.payee_name).toBe('New Payee');
    });

    it('should update approved status', async () => {
      const updateTransaction = vi.fn(async () => ({
        data: {
          transaction: { ...mockExistingTransaction, approved: true },
        },
      }));
      const { tool } = createTool({ updateTransaction });

      const result = await tool.execute({
        transactionId: 'txn-123',
        approved: true,
        response_format: 'json',
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.approved).toBe(true);
    });

    it('should return markdown format by default', async () => {
      const { tool } = createTool();

      const result = await tool.execute({
        transactionId: 'txn-123',
        memo: 'New memo',
      });

      expect(result.content[0].text).toContain('# Transaction Updated Successfully');
    });

    it('should handle API errors gracefully', async () => {
      const getTransactionById = vi.fn(async () => { throw new Error('Not found'); });
      const api = createMockApi({ getTransactionById });
      const tool = new UpdateTransactionTool({
        ynabApi: api,
        budgetId: 'test-budget-id',
      });

      const result = await tool.execute({ transactionId: 'nonexistent' });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Error updating transaction');
    });

    it('should error when API returns no data', async () => {
      const updateTransaction = vi.fn(async () => ({
        data: { transaction: null },
      }));
      const { tool } = createTool({ updateTransaction });

      const result = await tool.execute({
        transactionId: 'txn-123',
        amount: -5,
      });

      expect(result).toHaveProperty('isError', true);
      expect(result.content[0].text).toContain('Failed to update transaction');
    });
  });

  describe('tool configuration', () => {
    it('should have correct name', () => {
      const { tool } = createTool();
      expect(tool.getToolDefinition().name).toBe('ynab_update_transaction');
    });

    it('should require only transactionId', () => {
      const { tool } = createTool();
      expect(tool.getToolDefinition().inputSchema.required).toEqual(['transactionId']);
    });

    it('should have correct annotations', () => {
      const { tool } = createTool();
      const def = tool.getToolDefinition();
      expect(def.annotations?.readOnlyHint).toBe(false);
      expect(def.annotations?.destructiveHint).toBe(false);
      expect(def.annotations?.idempotentHint).toBe(true);
    });

    it('should have improved amount description warning against milliunits', () => {
      const { tool } = createTool();
      const props = tool.getToolDefinition().inputSchema.properties as any;
      expect(props.amount.description).toContain('Do NOT send milliunits');
      expect(props.amount.description).toContain('dollar');
    });
  });
});
